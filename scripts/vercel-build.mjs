import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const npmCliPath = process.env.npm_execpath;
const npmCommand = npmCliPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = (script) => npmCliPath ? [npmCliPath, "run", script] : ["run", script];
const nextCliPath = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

const nonBuildSecrets = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_DB_PASSWORD",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PASSWORD",
  "PGPASSWORD"
];

export function withoutManagementSecrets(env = process.env) {
  const sanitized = { ...env };
  for (const name of nonBuildSecrets) delete sanitized[name];
  return sanitized;
}

export function remoteMigrationVerifierEnv(env = process.env) {
  const sanitized = withoutManagementSecrets(env);
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ...sanitized,
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
    };
  }
  if (env.SUPABASE_PROJECT_REF && env.SUPABASE_ACCESS_TOKEN) {
    return {
      ...sanitized,
      SUPABASE_PROJECT_REF: env.SUPABASE_PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN
    };
  }
  return sanitized;
}

function testAdapter() {
  return process.env.NODE_ENV === "test" ? process.env.BOXSOFA_VERCEL_BUILD_TEST_ADAPTER : undefined;
}

function run(label, command, args, env) {
  console.log(`\n=== ${label} ===`);
  const adapter = testAdapter();
  const result = spawnSync(adapter ? process.execPath : command, adapter ? [adapter, label] : args, {
    cwd: root,
    stdio: "inherit",
    env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed`);
}

// A single process controls both phases so remote-only credentials have no
// opportunity to leak from Vercel's inherited build environment to Next.
run("deploy preflight", npmCommand, npmArgs("deploy:preflight"), remoteMigrationVerifierEnv());
run("next build", process.execPath, [nextCliPath, "build"], withoutManagementSecrets());

console.log("\nVercel build passed.");
