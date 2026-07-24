import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const npmCliPath = process.env.npm_execpath;
const npmCommand = npmCliPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = (script, extraArgs = []) => npmCliPath
  ? [npmCliPath, "run", script, ...extraArgs]
  : ["run", script, ...extraArgs];

function withoutRemoteMigrationSecrets(env = process.env) {
  const sanitized = { ...env };
  delete sanitized.SUPABASE_ACCESS_TOKEN;
  delete sanitized.SUPABASE_SERVICE_ROLE_KEY;
  delete sanitized.SUPABASE_DB_URL;
  delete sanitized.SUPABASE_DB_PASSWORD;
  delete sanitized.DATABASE_URL;
  delete sanitized.POSTGRES_URL;
  delete sanitized.POSTGRES_PRISMA_URL;
  delete sanitized.POSTGRES_URL_NON_POOLING;
  delete sanitized.POSTGRES_PASSWORD;
  delete sanitized.PGPASSWORD;
  return sanitized;
}

function run(label, script, env = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(npmCommand, npmArgs(script), {
    stdio: "inherit",
    env: { ...withoutRemoteMigrationSecrets(), ...env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reserveLocalPort() {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve a local verification port");
  return {
    port: address.port,
    release: () => new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()))
  };
}

async function waitForLocalServer(child, baseUrl, nonce) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`local Next.js server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.ok) {
        if (response.headers.get("x-boxsofa-local-verify-nonce") !== nonce) {
          throw new Error("local verification port belongs to an unexpected process");
        }
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("unexpected process")) throw error;
      // The production server needs a few seconds to start.
    }
    await delay(250);
  }
  throw new Error(`local Next.js server did not become ready at ${baseUrl}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    delay(timeoutMs).then(() => false)
  ]);
  return exited;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 5_000)) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
  if (!await waitForExit(child, 5_000)) {
    throw new Error(`local Next.js server process ${child.pid} did not exit after forced cleanup`);
  }
}

run("migration manifest", "db:migrations:verify");
run("bootstrap lexical validation", "db:bootstrap:validate");
run("bootstrap PGlite execution", "db:bootstrap:execute");
run("unit tests", "test");
run("typecheck", "typecheck");
run("production build", "build");

const reservation = await reserveLocalPort();
const port = reservation.port;
const baseUrl = `http://127.0.0.1:${port}`;
const nonce = randomUUID();
const nextCliPath = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
let server;

try {
  await reservation.release();
  server = spawn(process.execPath, [nextCliPath, "start", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: "inherit",
    env: {
      ...withoutRemoteMigrationSecrets(),
      PORT: String(port),
      BOXSOFA_LOCAL_VERIFY: "1",
      BOXSOFA_LOCAL_VERIFY_NONCE: nonce
    }
  });
  await waitForLocalServer(server, baseUrl, nonce);
  run("local smoke audit", "smoke", { SMOKE_BASE_URL: baseUrl });
  run("local API authorization audit", "api:auth-audit", { API_AUDIT_BASE_URL: baseUrl });
} finally {
  if (server) await stopServer(server);
}

console.log("\nLocal production verification passed.");
