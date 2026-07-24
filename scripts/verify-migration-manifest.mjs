import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const migrationDirectory = join(root, "supabase", "migrations");
const manifestPath = join(migrationDirectory, "MANIFEST.json");

function remoteMigrationQuery() {
  return `
    select version, name, statement_count, normalized_md5, reviewed_source_sha256
    from public.get_applied_migration_checkpoints()
    order by version
  `;
}

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function localMigrationText(file) {
  return readFileSync(join(migrationDirectory, file), "utf8");
}

export function normalizeRepositoryMigrationText(sql) {
  return sql.replace(/\r\n/g, "\n");
}

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function normalizeCheckpointText(sql, checkpoint) {
  if (checkpoint.normalization === "trim-final-newlines") {
    return sql.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
  }
  return normalizeMigrationText(sql);
}

function validProjectRef(projectRef) {
  return typeof projectRef === "string" && /^[a-z0-9]{20}$/i.test(projectRef);
}

function validSupabaseUrl(supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function selectRemoteMigrationVerifier({ projectRef, accessToken, supabaseUrl, serviceRoleKey }) {
  if (validSupabaseUrl(supabaseUrl) && typeof serviceRoleKey === "string" && serviceRoleKey.length > 0) {
    return { mode: "service-role-rpc", supabaseUrl, serviceRoleKey };
  }
  if (validProjectRef(projectRef) && typeof accessToken === "string" && accessToken.length > 0) {
    return { mode: "management-api", projectRef, accessToken };
  }
  throw new Error(
    "Remote migration verification requires NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_PROJECT_REF plus SUPABASE_ACCESS_TOKEN."
  );
}

export function verifyMigrationManifest({ manifest = loadManifest(), readMigration = localMigrationText } = {}) {
  assert.equal(manifest.version, 2, "unsupported migration manifest version");
  assert.equal(manifest.algorithm, "sha256", "migration manifest must use sha256");
  assert.ok(Array.isArray(manifest.migrations), "migration manifest must contain migrations");

  const files = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql")).sort();
  const expectedFiles = manifest.migrations.map((entry) => entry.file).sort();
  assert.deepEqual(files, expectedFiles, "migration manifest must include every SQL migration exactly once");

  for (const entry of manifest.migrations) {
    assert.match(entry.file, /^\d{12,}_[a-z0-9_]+\.sql$/i, `invalid migration filename: ${entry.file}`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, `invalid SHA-256 for ${entry.file}`);
    const actual = createHash("sha256")
      .update(normalizeRepositoryMigrationText(readMigration(entry.file)))
      .digest("hex");
    assert.equal(actual, entry.sha256, `migration content changed: ${entry.file}`);
  }

  assert.ok(Array.isArray(manifest.remoteCheckpoints), "migration manifest must contain remote checkpoints");
  const migrationEntries = new Map(manifest.migrations.map((entry) => [entry.file, entry]));
  const checkpointFiles = new Set();
  for (const checkpoint of manifest.remoteCheckpoints) {
    assert.match(checkpoint.file, /^\d{12,}_[a-z0-9_]+\.sql$/i, `invalid checkpoint filename: ${checkpoint.file}`);
    assert.ok(migrationEntries.has(checkpoint.file), `remote checkpoint is not in the migration manifest: ${checkpoint.file}`);
    assert.ok(!checkpointFiles.has(checkpoint.file), `duplicate remote checkpoint: ${checkpoint.file}`);
    checkpointFiles.add(checkpoint.file);
    assert.match(checkpoint.version, /^\d{14}$/, `invalid remote migration version: ${checkpoint.file}`);
    assert.match(checkpoint.name, /^[a-z0-9_]+$/, `invalid remote migration name: ${checkpoint.file}`);
    assert.equal(checkpoint.statementCount, 1, `unexpected remote statement count: ${checkpoint.file}`);
    assert.match(checkpoint.normalizedMd5, /^[a-f0-9]{32}$/, `invalid remote normalized MD5: ${checkpoint.file}`);
    assert.ok(checkpoint.normalization === undefined || checkpoint.normalization === "trim-final-newlines",
      `invalid normalization mode: ${checkpoint.file}`);
    assert.ok(checkpoint.matchesLocal === undefined || typeof checkpoint.matchesLocal === "boolean",
      `invalid matchesLocal flag: ${checkpoint.file}`);
    const sourceEntry = migrationEntries.get(checkpoint.file);
    if (checkpoint.matchesLocal === false) {
      assert.equal(checkpoint.reviewedSourceSha256, sourceEntry.sha256,
        `reviewed source attestation must match the local migration SHA-256: ${checkpoint.file}`);
    } else {
      assert.equal(checkpoint.reviewedSourceSha256, undefined,
        `matching migrations do not need a source attestation: ${checkpoint.file}`);
    }
    if (checkpoint.matchesLocal !== false) {
      assert.equal(md5(normalizeCheckpointText(readMigration(checkpoint.file), checkpoint)), checkpoint.normalizedMd5,
        `migration no longer matches the normalized SQL recorded by Supabase: ${checkpoint.file}`);
    }
  }

  return { migrations: manifest.migrations.length, remoteCheckpoints: manifest.remoteCheckpoints.length };
}

export function verifyRemoteMigrationCoverage(manifest) {
  const checkpointFiles = new Set(manifest.remoteCheckpoints.map((checkpoint) => checkpoint.file));
  const missingCheckpointFiles = manifest.migrations
    .map((migration) => migration.file)
    .filter((file) => !checkpointFiles.has(file));
  assert.equal(
    missingCheckpointFiles.length,
    0,
    `remote checkpoint coverage is incomplete: ${missingCheckpointFiles.join(", ")}`
  );
}

export function verifyRemoteMigrationCheckpoints(manifest, remoteRows) {
  verifyRemoteMigrationCoverage(manifest);
  assert.ok(Array.isArray(remoteRows), "remote migration checkpoint response must be an array");
  const rowsByVersion = new Map();
  for (const row of remoteRows) {
    assert.equal(typeof row?.version, "string", "remote migration version is missing");
    assert.ok(!rowsByVersion.has(row.version), `duplicate remote migration version: ${row.version}`);
    rowsByVersion.set(row.version, row);
  }

  const checkpoints = manifest.remoteCheckpoints;
  assert.equal(rowsByVersion.size, checkpoints.length, "remote migration response has an unexpected row count");
  for (const checkpoint of checkpoints) {
    const row = rowsByVersion.get(checkpoint.version);
    assert.ok(row, `remote migration is missing: ${checkpoint.version}`);
    assert.equal(row.name, checkpoint.name, `remote migration name diverged: ${checkpoint.version}`);
    assert.equal(row.statement_count, checkpoint.statementCount, `remote statement count diverged: ${checkpoint.version}`);
    assert.equal(row.normalized_md5, checkpoint.normalizedMd5, `remote statement hash diverged: ${checkpoint.version}`);
    assert.equal(row.reviewed_source_sha256 ?? undefined, checkpoint.reviewedSourceSha256,
      `reviewed source attestation diverged: ${checkpoint.version}`);
  }
  return { remoteCheckpoints: checkpoints.length };
}

export async function fetchRemoteMigrationRowsWithManagementApi({ projectRef, accessToken, fetchImpl = globalThis.fetch, checkpoints }) {
  assert.ok(validProjectRef(projectRef), "SUPABASE_PROJECT_REF must be a Supabase project ref");
  assert.ok(accessToken, "SUPABASE_ACCESS_TOKEN is required for Management API migration verification");
  assert.equal(typeof fetchImpl, "function", "fetch is unavailable for remote migration verification");
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query: remoteMigrationQuery(), parameters: [] })
  });
  if (!response.ok) throw new Error(`Supabase Management API migration query failed with HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload.result;
  assert.ok(Array.isArray(rows), "Supabase Management API migration query returned no rows");
  return rows;
}

export async function fetchRemoteMigrationCheckpointsWithServiceRole({ supabaseUrl, serviceRoleKey, fetchImpl = globalThis.fetch }) {
  assert.ok(validSupabaseUrl(supabaseUrl), "NEXT_PUBLIC_SUPABASE_URL must be a Supabase HTTPS project URL");
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required for RPC migration verification");
  assert.equal(typeof fetchImpl, "function", "fetch is unavailable for remote migration verification");
  const rpcUrl = new URL("rest/v1/rpc/get_applied_migration_checkpoints", `${supabaseUrl.replace(/\/$/, "")}/`).toString();
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
    },
    body: "{}"
  });
  if (!response.ok) throw new Error(`Supabase migration checkpoint RPC failed with HTTP ${response.status}`);
  const rows = await response.json();
  assert.ok(Array.isArray(rows), "Supabase migration checkpoint RPC returned no rows");
  return rows;
}

export async function fetchRemoteMigrationTruth(options) {
  const verifier = selectRemoteMigrationVerifier(options);
  if (verifier.mode === "service-role-rpc") {
    const rows = await fetchRemoteMigrationCheckpointsWithServiceRole({ ...verifier, fetchImpl: options.fetchImpl });
    return { mode: verifier.mode, rows };
  }
  const rows = await fetchRemoteMigrationRowsWithManagementApi({ ...verifier, checkpoints: options.checkpoints, fetchImpl: options.fetchImpl });
  return { mode: verifier.mode, rows };
}

// Supabase stores migration statements as text. Canonical comparison converts
// Windows line endings to LF and reduces trailing blank lines to one final LF.
export function normalizeMigrationText(sql) {
  return sql.replace(/\r\n/g, "\n").replace(/\n+$/g, "\n");
}

async function main() {
  const manifest = loadManifest();
  const result = verifyMigrationManifest({ manifest });
  const remoteMode = process.argv.includes("--remote") || process.env.SUPABASE_MIGRATION_VERIFY_REMOTE === "1";
  if (!remoteMode) {
    console.log(`Migration manifest verified: ${result.migrations} SQL files; ${result.remoteCheckpoints} remote checkpoints.`);
    return;
  }
  verifyRemoteMigrationCoverage(manifest);
  const remote = await fetchRemoteMigrationTruth({
    projectRef: process.env.SUPABASE_PROJECT_REF,
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    checkpoints: manifest.remoteCheckpoints
  });
  const remoteResult = remote.mode === "service-role-rpc"
    ? verifyRemoteMigrationCheckpoints(manifest, remote.rows)
    : verifyRemoteMigrationCheckpoints(manifest, remote.rows);
  console.log(`Remote migration verification passed via ${remote.mode}: ${result.migrations} SQL files; ${remoteResult.remoteCheckpoints} remote checkpoints.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
