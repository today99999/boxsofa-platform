import { spawnSync } from "node:child_process";

const npmCliPath = process.env.npm_execpath;
const npmCommand = npmCliPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = (script) => (npmCliPath ? [npmCliPath, "run", script] : ["run", script]);

const managementOnlySecrets = [
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

function withoutRemoteMigrationSecrets(env = process.env) {
  const sanitized = { ...env };
  for (const name of managementOnlySecrets) delete sanitized[name];
  return sanitized;
}

function remoteMigrationVerifierEnv() {
  const sanitized = withoutRemoteMigrationSecrets();
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ...sanitized,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
  }
  if (process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_ACCESS_TOKEN) {
    return {
      ...sanitized,
      SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN
    };
  }
  return sanitized;
}

function hasRemoteMigrationCredentials() {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      || (process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_ACCESS_TOKEN)
  );
}

function canSkipRemoteMigrationVerification() {
  return process.env.VERCEL_ENV === "preview" && !hasRemoteMigrationCredentials();
}

function testAdapter() {
  return process.env.NODE_ENV === "test" ? process.env.BOXSOFA_DEPLOY_PREFLIGHT_TEST_ADAPTER : undefined;
}

function run(label, script, env = withoutRemoteMigrationSecrets()) {
  console.log(`\n=== ${label} ===`);
  const adapter = testAdapter();
  const result = spawnSync(adapter ? process.execPath : npmCommand, adapter ? [adapter, label] : npmArgs(script), {
    stdio: "inherit",
    env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed`);
}

// Vercel invokes this before its own `next build` command. Keep this list
// build-free so the configured Vercel build command cannot recurse.
if (canSkipRemoteMigrationVerification()) {
  console.log("\n=== remote Supabase migration history ===");
  console.log("Skipped for Vercel preview deployment without remote Supabase migration credentials.");
} else {
  run("remote Supabase migration history", "db:migrations:verify-remote", remoteMigrationVerifierEnv());
}
run("migration manifest", "db:migrations:verify");
run("bootstrap lexical validation", "db:bootstrap:validate");
run("bootstrap PGlite execution", "db:bootstrap:execute");
run("unit tests", "test");
run("typecheck", "typecheck");

console.log("\nDeployment preflight passed. Vercel may now run next build.");
