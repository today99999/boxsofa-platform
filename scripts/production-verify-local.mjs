import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const npmCliPath = process.env.npm_execpath;
const npmCommand = npmCliPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmArgs = (script, extraArgs = []) => npmCliPath
  ? [npmCliPath, 'run', script, ...extraArgs]
  : ['run', script, ...extraArgs];
const port = Number(process.env.LOCAL_VERIFY_PORT || 3045);
const baseUrl = `http://127.0.0.1:${port}`;

function run(label, script, env = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(npmCommand, npmArgs(script), {
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed`);
}

async function waitForLocalServer(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`local Next.js server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // The production server needs a few seconds to start.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`local Next.js server did not become ready at ${baseUrl}`);
}

run('migration manifest', 'db:migrations:verify');
run('bootstrap lexical validation', 'db:bootstrap:validate');
run('bootstrap PGlite execution', 'db:bootstrap:execute');
run('unit tests', 'test');
run('typecheck', 'typecheck');
run('production build', 'build');

const nextCliPath = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const server = spawn(process.execPath, [nextCliPath, 'start', '-p', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) }
});

try {
  await waitForLocalServer(server);
  run('local smoke audit', 'smoke', { SMOKE_BASE_URL: baseUrl });
  run('local API authorization audit', 'api:auth-audit', { API_AUDIT_BASE_URL: baseUrl });
} finally {
  server.kill();
}

console.log('\nLocal production verification passed.');
