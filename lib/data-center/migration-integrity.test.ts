import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeMigrationText,
  normalizeRepositoryMigrationText
} from "../../scripts/verify-migration-manifest.mjs";
import {
  criticalFunctions,
  publicRelationExpectations,
  publicPolicyExpectations,
  validateBootstrapCatalog
} from "../../scripts/execute-bootstrap-pglite.mjs";

type RemoteMigrationVerifier = {
  fetchRemoteMigrationRowsWithManagementApi: (options: {
    projectRef: string;
    accessToken: string;
    checkpoints: unknown[];
    fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  }) => Promise<unknown[]>;
  fetchRemoteMigrationCheckpointsWithServiceRole: (options: {
    supabaseUrl: string;
    serviceRoleKey: string;
    fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  }) => Promise<unknown[]>;
  fetchRemoteMigrationTruth: (options: Record<string, unknown>) => Promise<{ mode: string; rows: unknown[] }>;
  selectRemoteMigrationVerifier: (options: Record<string, unknown>) => { mode: string };
  verifyRemoteMigrationCheckpoints: (manifest: unknown, rows: unknown[]) => { remoteCheckpoints: number };
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
  assert.match(result.stdout, new RegExp(`Migration manifest verified: ${manifest.migrations.length} SQL files`));
  assert.match(result.stdout, new RegExp(`${manifest.remoteCheckpoints.length} remote checkpoints`));
});

test("Supabase migration comparison canonicalizes only line endings and trailing blank lines", () => {
  assert.equal(normalizeMigrationText("select 1;\r\n\r\n"), "select 1;\n");
  assert.equal(normalizeMigrationText("select 1;\n\n\n"), "select 1;\n");
  assert.equal(normalizeMigrationText("select 1;\nselect 2;\n"), "select 1;\nselect 2;\n");
});

test("repository migration hashes ignore only Windows line endings", () => {
  assert.equal(normalizeRepositoryMigrationText("select 1;\r\n\r\n"), "select 1;\n\n");
  assert.equal(normalizeRepositoryMigrationText("select 1;\n\n"), "select 1;\n\n");
});

const migrationDirectory = new URL("../../supabase/migrations/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("MANIFEST.json", migrationDirectory), "utf8"));
test("remote checkpoints cover only migrations recorded as deployed", () => {
  assert.ok(manifest.remoteCheckpoints.length <= manifest.migrations.length);
  assert.deepEqual(
    manifest.remoteCheckpoints.map((checkpoint: { file: string }) => checkpoint.file).sort(),
    manifest.migrations
      .filter((migration: { file: string }) => manifest.remoteCheckpoints.some(
        (checkpoint: { file: string }) => checkpoint.file === migration.file
      ))
      .map((migration: { file: string }) => migration.file)
      .sort()
  );
});

function remoteCheckpointRows() {
  return manifest.remoteCheckpoints.map((checkpoint: {
    version: string;
    name: string;
    statementCount: number;
    normalizedMd5: string;
    reviewedSourceSha256?: string;
  }) => ({
    version: checkpoint.version,
    name: checkpoint.name,
    statement_count: checkpoint.statementCount,
    normalized_md5: checkpoint.normalizedMd5,
    reviewed_source_sha256: checkpoint.reviewedSourceSha256 ?? null
  }));
}

test("remote migration truth rejects simultaneous local and manifest tampering", async () => {
  const { verifyRemoteMigrationCheckpoints } = await loadRemoteMigrationVerifier();
  const changedManifest = structuredClone(manifest);
  const changedCheckpoint = changedManifest.remoteCheckpoints.find(
    (checkpoint: { matchesLocal?: boolean }) => checkpoint.matchesLocal === false
  );
  changedCheckpoint.reviewedSourceSha256 = "0".repeat(64);
  assert.throws(
    () => verifyRemoteMigrationCheckpoints(changedManifest, remoteCheckpointRows()),
    /reviewed source attestation diverged/
  );
});

test("both remote credential modes reject missing, mismatched, and unexpected checkpoints", async () => {
  const { selectRemoteMigrationVerifier, verifyRemoteMigrationCheckpoints } = await loadRemoteMigrationVerifier();
  assert.throws(() => selectRemoteMigrationVerifier({}), /Remote migration verification requires/);
  assert.throws(() => selectRemoteMigrationVerifier({ projectRef: "invalid", accessToken: "token" }), /Remote migration verification requires/);

  const mismatchedServiceRows = remoteCheckpointRows();
  mismatchedServiceRows[0].normalized_md5 = "00000000000000000000000000000000";
  assert.throws(
    () => verifyRemoteMigrationCheckpoints(manifest, mismatchedServiceRows),
    /remote statement hash diverged/
  );
  assert.throws(
    () => verifyRemoteMigrationCheckpoints(manifest, [...remoteCheckpointRows(), {
      version: "20260724000000",
      name: "unexpected",
      statement_count: 1,
      normalized_md5: "00000000000000000000000000000000"
    }]),
    /remote migration response has an unexpected row count/
  );
});

test("Management API verifier accepts exact rows without exposing its credential", async () => {
  const { fetchRemoteMigrationRowsWithManagementApi, verifyRemoteMigrationCheckpoints } = await loadRemoteMigrationVerifier();
  const rows = remoteCheckpointRows();
  const fetchedRows = await fetchRemoteMigrationRowsWithManagementApi({
    projectRef: "osmjevtynywbkokzejcp",
    accessToken: "management-test-token",
    checkpoints: manifest.remoteCheckpoints,
    fetchImpl: async (url: string, init: RequestInit) => {
      assert.match(url, /database\/query\/read-only$/);
      assert.equal(init.method, "POST");
      assert.equal((init.headers as Record<string, string>).authorization, "Bearer management-test-token");
      const body = JSON.parse(String(init.body));
      assert.match(body.query, /public\.get_applied_migration_checkpoints\(\)/);
      assert.deepEqual(body.parameters, []);
      return new Response(JSON.stringify(rows), { status: 201 });
    }
  });
  assert.deepEqual(fetchedRows, rows);
  assert.deepEqual(verifyRemoteMigrationCheckpoints(manifest, fetchedRows), {
    remoteCheckpoints: manifest.remoteCheckpoints.length
  });
});

test("restricted service-role RPC returns only checkpoint fingerprints and is preferred", async () => {
  const { fetchRemoteMigrationCheckpointsWithServiceRole, fetchRemoteMigrationTruth, verifyRemoteMigrationCheckpoints } = await loadRemoteMigrationVerifier();
  const rows = remoteCheckpointRows();
  const fetchImpl = async (url: string, init: RequestInit) => {
    assert.match(url, /\/rest\/v1\/rpc\/get_applied_migration_checkpoints$/);
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>).apikey, "service-role-test-key");
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer service-role-test-key");
    assert.equal(init.body, "{}");
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  const fetchedRows = await fetchRemoteMigrationCheckpointsWithServiceRole({
    supabaseUrl: "https://osmjevtynywbkokzejcp.supabase.co",
    serviceRoleKey: "service-role-test-key",
    fetchImpl
  });
  assert.deepEqual(verifyRemoteMigrationCheckpoints(manifest, fetchedRows), {
    remoteCheckpoints: manifest.remoteCheckpoints.length
  });
  const preferred = await fetchRemoteMigrationTruth({
    projectRef: "osmjevtynywbkokzejcp",
    accessToken: "management-test-token",
    supabaseUrl: "https://osmjevtynywbkokzejcp.supabase.co",
    serviceRoleKey: "service-role-test-key",
    checkpoints: manifest.remoteCheckpoints,
    fetchImpl
  });
  assert.equal(preferred.mode, "service-role-rpc");
  assert.deepEqual(preferred.rows, rows);
});

test("remote verifier sanitizes credential-bearing failure details", async () => {
  const { fetchRemoteMigrationCheckpointsWithServiceRole } = await loadRemoteMigrationVerifier();
  const secret = "do-not-print-this-service-key";
  await assert.rejects(
    () => fetchRemoteMigrationCheckpointsWithServiceRole({
      supabaseUrl: "https://osmjevtynywbkokzejcp.supabase.co",
      serviceRoleKey: secret,
      fetchImpl: async () => new Response(`upstream mentioned ${secret}`, { status: 403 })
    }),
    (error: Error) => {
      assert.match(error.message, /HTTP 403/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    }
  );
});

test("bootstrap SQL has no patch artifacts and passes lexical statement validation", () => {
  const result = runScript("scripts/validate-bootstrap-sql.mjs");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Bootstrap SQL lexical validation passed/);
});

test("Vercel build owns preflight and compilation in one credential-isolating process", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["production:verify"], "node scripts/production-verify.mjs --release");
  assert.equal(packageJson.scripts["production:verify:local"], "node scripts/production-verify-local.mjs");
  assert.equal(packageJson.scripts["deploy:preflight"], "node scripts/deploy-preflight.mjs");
  assert.equal(vercel.buildCommand, "node scripts/vercel-build.mjs");
  assert.doesNotMatch(vercel.buildCommand, /production:verify:local/);
  assert.doesNotMatch(readFileSync(new URL("../../scripts/deploy-preflight.mjs", import.meta.url), "utf8"), /run\([^\n]+["']build["']/);

  const result = runScript("scripts/production-verify.mjs", ["--release"], {
    EXPECT_PAYMENT_ENABLED: "true",
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_PROJECT_REF: "",
    SUPABASE_ACCESS_TOKEN: ""
  });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /Remote migration verification requires/);
  assert.match(result.stderr, /required release gate failed/);
});

test("Vercel build gives remote credentials only to the preflight child", () => {
  const result = runScript("scripts/vercel-build.mjs", [], {
    NODE_ENV: "test",
    BOXSOFA_VERCEL_BUILD_TEST_ADAPTER: "scripts/test-fixtures/vercel-build-sentinel.mjs",
    NEXT_PUBLIC_SUPABASE_URL: "https://osmjevtynywbkokzejcp.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-sentinel",
    SUPABASE_ACCESS_TOKEN: "management-sentinel",
    DATABASE_URL: "postgres://database-sentinel",
    POSTGRES_PASSWORD: "password-sentinel"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const childEnvironments = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  assert.deepEqual(childEnvironments, [
    {
      phase: "deploy preflight",
      values: {
        SUPABASE_ACCESS_TOKEN: null,
        SUPABASE_SERVICE_ROLE_KEY: "service-role-sentinel",
        DATABASE_URL: null,
        POSTGRES_PASSWORD: null
      }
    },
    {
      phase: "next build",
      values: {
        SUPABASE_ACCESS_TOKEN: null,
        SUPABASE_SERVICE_ROLE_KEY: null,
        DATABASE_URL: null,
        POSTGRES_PASSWORD: null
      }
    }
  ]);
});

function validBootstrapCatalog() {
  return {
    publicRelations: publicRelationExpectations.map(({ relname, relkind }) => ({
      relname,
      relkind,
      relrowsecurity: true,
      reloptions: null as string | null
    })),
    publicPolicies: publicPolicyExpectations.map((policy) => ({
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
      proconfig: fn.searchPath ?? "search_path=public, pg_temp",
      public_execute: false,
      anon_execute: false,
      authenticated_execute: fn.authenticated,
      service_role_execute: fn.serviceRole ?? true,
      postgres_execute: true
    }))
  };
}

test("bootstrap catalog validator rejects an unlisted public relation and disabled RLS", () => {
  const unlisted = validBootstrapCatalog();
  unlisted.publicRelations.push({ relname: "accidental_public_table", relkind: "r", relrowsecurity: false, reloptions: null });
  assert.throws(() => validateBootstrapCatalog(unlisted), /public data relation catalog changed/);

  const noRls = validBootstrapCatalog();
  noRls.publicRelations[0].relrowsecurity = false;
  assert.throws(() => validateBootstrapCatalog(noRls), /RLS is disabled/);
});

test("bootstrap catalog validator rejects unlisted partitioned tables and views", () => {
  for (const relation of [
    { relname: "accidental_partition", relkind: "p", relrowsecurity: true, reloptions: null },
    { relname: "accidental_view", relkind: "v", relrowsecurity: false, reloptions: "security_invoker=true" }
  ]) {
    const catalog = validBootstrapCatalog();
    catalog.publicRelations.push(relation);
    assert.throws(() => validateBootstrapCatalog(catalog), /public data relation catalog changed/);
  }
});

test("a deliberately allowlisted public view must use security_invoker", () => {
  const catalog = validBootstrapCatalog();
  catalog.publicRelations.push({ relname: "reviewed_view", relkind: "v", relrowsecurity: false, reloptions: null });
  assert.throws(() => validateBootstrapCatalog({
    ...catalog,
    relationExpectations: [...publicRelationExpectations, {
      relname: "reviewed_view",
      relkind: "v",
      requiresRls: false,
      securityInvoker: true
    }]
  }), /view is not security_invoker/);
});

test("bootstrap policy closure rejects permissive policies on previously omitted public tables", () => {
  for (const table of ["orders", "profiles", "admin_audit_log", "chat_threads", "newsletter_subscriptions"]) {
    const permissive = validBootstrapCatalog();
    permissive.publicPolicies.push({
      tablename: table,
      policyname: "accidental public USING true",
      cmd: "SELECT",
      roles: "{public}",
      qual: "true",
      with_check: null
    });
    assert.throws(() => validateBootstrapCatalog(permissive), /public policy catalog changed/);
  }

  const wrongRole = validBootstrapCatalog();
  wrongRole.publicPolicies[0].roles = "{anon}";
  assert.throws(() => validateBootstrapCatalog(wrongRole), /public policy catalog changed/);
  const wrongCommand = validBootstrapCatalog();
  wrongCommand.publicPolicies[1].cmd = "ALL";
  assert.throws(() => validateBootstrapCatalog(wrongCommand), /public policy catalog changed/);
});

test("bootstrap catalog validator rejects a changed critical RPC signature", () => {
  const wrongSignature = validBootstrapCatalog();
  wrongSignature.securityDefinerFunctions[0].identity_arguments = "p_notification_id uuid";
  assert.throws(() => validateBootstrapCatalog(wrongSignature), /unexpected or missing SECURITY DEFINER RPC/);
});
