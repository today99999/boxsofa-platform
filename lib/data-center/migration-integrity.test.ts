import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeMigrationText } from "../../scripts/verify-migration-manifest.mjs";
import {
  criticalFunctions,
  publicBaseTables,
  sensitivePolicyExpectations,
  validateBootstrapCatalog
} from "../../scripts/execute-bootstrap-pglite.mjs";

type RemoteMigrationVerifier = {
  fetchRemoteMigrationRows: (options: {
    projectRef: string;
    accessToken: string;
    checkpoints: unknown[];
    fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  }) => Promise<unknown[]>;
  verifyRemoteMigrationRows: (manifest: unknown, rows: unknown[], options?: { readMigration?: (file: string) => string }) => { remoteCheckpoints: number };
};

async function loadRemoteMigrationVerifier() {
  return await import("../../scripts/verify-migration-manifest.mjs") as unknown as RemoteMigrationVerifier;
}

function runScript(script: string, args: string[] = [], env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

test("migration manifest prevents applied SQL from being silently rewritten", () => {
  const result = runScript("scripts/verify-migration-manifest.mjs");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Migration manifest verified: 21 SQL files/);
  assert.match(result.stdout, /3 remote checkpoints/);
});

test("Supabase migration comparison canonicalizes only line endings and trailing blank lines", () => {
  assert.equal(normalizeMigrationText("select 1;\r\n\r\n"), "select 1;\n");
  assert.equal(normalizeMigrationText("select 1;\n\n\n"), "select 1;\n");
  assert.equal(normalizeMigrationText("select 1;\nselect 2;\n"), "select 1;\nselect 2;\n");
});

const migrationDirectory = new URL("../../supabase/migrations/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("MANIFEST.json", migrationDirectory), "utf8"));
const sourceByFile = new Map<string, string>(manifest.remoteCheckpoints.map((checkpoint: { file: string }) => [
  checkpoint.file,
  readFileSync(new URL(checkpoint.file, migrationDirectory), "utf8")
]));

function remoteRows() {
  return manifest.remoteCheckpoints.map((checkpoint: { file: string; version: string; name: string }) => ({
    version: checkpoint.version,
    name: checkpoint.name,
    statements: [sourceByFile.get(checkpoint.file)]
  }));
}

test("remote migration truth rejects simultaneous local and manifest tampering", async () => {
  const { verifyRemoteMigrationRows } = await loadRemoteMigrationVerifier();
  const changedSql = "select 'tampered local migration';\n";
  const changedManifest = structuredClone(manifest);
  const changedCheckpoint = changedManifest.remoteCheckpoints[0];
  changedCheckpoint.normalizedMd5 = createHash("md5").update(normalizeMigrationText(changedSql)).digest("hex");
  assert.throws(
    () => verifyRemoteMigrationRows(changedManifest, remoteRows(), {
      readMigration: (file: string) => file === changedCheckpoint.file ? changedSql : sourceByFile.get(file)!
    }),
    /remote statement hash diverged/
  );
});

test("remote migration truth rejects missing versions, names, statement counts, and hashes", async () => {
  const { verifyRemoteMigrationRows } = await loadRemoteMigrationVerifier();
  const cases = [
    { rows: remoteRows().slice(1), message: /remote migration response has an unexpected row count/ },
    { rows: remoteRows().map((row: { version: string; name: string; statements: string[] }, index: number) => index === 0 ? { ...row, name: "wrong_name" } : row), message: /remote migration name diverged/ },
    { rows: remoteRows().map((row: { version: string; name: string; statements: string[] }, index: number) => index === 0 ? { ...row, statements: [...row.statements, "select 2;\n"] } : row), message: /remote statement count diverged/ },
    { rows: remoteRows().map((row: { version: string; name: string; statements: string[] }, index: number) => index === 0 ? { ...row, statements: ["select 'wrong hash';\n"] } : row), message: /remote statement hash diverged/ }
  ];
  for (const { rows, message } of cases) {
    assert.throws(() => verifyRemoteMigrationRows(manifest, rows), message);
  }
});

test("remote migration truth accepts exact Management API rows", async () => {
  const { fetchRemoteMigrationRows, verifyRemoteMigrationRows } = await loadRemoteMigrationVerifier();
  const rows = remoteRows();
  const fetchedRows = await fetchRemoteMigrationRows({
    projectRef: "osmjevtynywbkokzejcp",
    accessToken: "test-token",
    checkpoints: manifest.remoteCheckpoints,
    fetchImpl: async (url: string, init: RequestInit) => {
      assert.match(url, /database\/query\/read-only$/);
      assert.equal(init.method, "POST");
      assert.equal((init.headers as Record<string, string>).authorization, "Bearer test-token");
      const body = JSON.parse(String(init.body));
      assert.match(body.query, /supabase_migrations\.schema_migrations/);
      assert.deepEqual(body.parameters, manifest.remoteCheckpoints.map((checkpoint: { version: string }) => checkpoint.version));
      return new Response(JSON.stringify(rows), { status: 201 });
    }
  });
  assert.deepEqual(fetchedRows, rows);
  assert.deepEqual(verifyRemoteMigrationRows(manifest, fetchedRows), { remoteCheckpoints: 3 });
});

test("bootstrap SQL has no patch artifacts and passes lexical statement validation", () => {
  const result = runScript("scripts/validate-bootstrap-sql.mjs");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Bootstrap SQL lexical validation passed/);
});

test("production release gate requires remote migration credentials before live checks", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["production:verify"], "node scripts/production-verify.mjs --release");
  assert.equal(packageJson.scripts["production:verify:local"], "node scripts/production-verify-local.mjs");
  assert.equal(packageJson.scripts["deploy:preflight"], "npm run production:verify");
  for (const [name, value] of Object.entries<string>(packageJson.scripts)) {
    if (name.startsWith("deploy")) assert.doesNotMatch(value, /production:verify:local/);
  }

  const result = runScript("scripts/production-verify.mjs", ["--release"], {
    SUPABASE_PROJECT_REF: "",
    SUPABASE_ACCESS_TOKEN: ""
  });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /SUPABASE_PROJECT_REF must be a Supabase project ref/);
  assert.match(result.stderr, /required release gate failed/);
});

function validBootstrapCatalog() {
  return {
    publicTables: publicBaseTables.map((relname: string) => ({ relname, relrowsecurity: true })),
    sensitivePolicies: sensitivePolicyExpectations.map((policy) => ({
      tablename: policy.table,
      policyname: policy.name,
      cmd: policy.command,
      roles: policy.roles,
      qual: policy.qual,
      with_check: policy.withCheck
    })),
    securityDefinerFunctions: criticalFunctions.map((fn) => ({
      proname: fn.name,
      identity_arguments: fn.identity,
      prosecdef: true,
      proconfig: "search_path=public, pg_temp",
      public_execute: false,
      anon_execute: false,
      authenticated_execute: fn.authenticated,
      service_role_execute: fn.serviceRole ?? true,
      postgres_execute: true
    }))
  };
}

test("bootstrap catalog validator rejects an unlisted public table and disabled RLS", () => {
  const unlisted = validBootstrapCatalog();
  unlisted.publicTables.push({ relname: "accidental_public_table", relrowsecurity: false });
  assert.throws(() => validateBootstrapCatalog(unlisted), /public base table catalog changed/);

  const noRls = validBootstrapCatalog();
  noRls.publicTables[0].relrowsecurity = false;
  assert.throws(() => validateBootstrapCatalog(noRls), /RLS is disabled/);
});

test("bootstrap catalog validator rejects permissive, wrong-role, and wrong-command sensitive policies", () => {
  const permissive = validBootstrapCatalog();
  permissive.sensitivePolicies.push({
    tablename: "analytics_consent_intents",
    policyname: "accidental public analytics access",
    cmd: "SELECT",
    roles: "{public}",
    qual: "true",
    with_check: null
  });
  assert.throws(() => validateBootstrapCatalog(permissive), /sensitive owner policy catalog changed/);

  const wrongRole = validBootstrapCatalog();
  wrongRole.sensitivePolicies[0].roles = "{anon}";
  assert.throws(() => validateBootstrapCatalog(wrongRole), /sensitive owner policy catalog changed/);

  const wrongCommand = validBootstrapCatalog();
  wrongCommand.sensitivePolicies[0].cmd = "ALL";
  assert.throws(() => validateBootstrapCatalog(wrongCommand), /sensitive owner policy catalog changed/);
});

test("bootstrap catalog validator rejects a changed critical RPC signature", () => {
  const wrongSignature = validBootstrapCatalog();
  wrongSignature.securityDefinerFunctions[0].identity_arguments = "p_notification_id uuid";
  assert.throws(() => validateBootstrapCatalog(wrongSignature), /unexpected or missing SECURITY DEFINER RPC/);
});
