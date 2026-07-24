import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const migrationDirectory = join(root, "supabase", "migrations");
const manifestPath = join(migrationDirectory, "MANIFEST.json");

export function verifyMigrationManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.version, 2, "unsupported migration manifest version");
  assert.equal(manifest.algorithm, "sha256", "migration manifest must use sha256");
  assert.ok(Array.isArray(manifest.migrations), "migration manifest must contain migrations");

  const files = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql")).sort();
  const expectedFiles = manifest.migrations.map((entry) => entry.file).sort();
  assert.deepEqual(files, expectedFiles, "migration manifest must include every SQL migration exactly once");

  for (const entry of manifest.migrations) {
    assert.match(entry.file, /^\d{12,}_[a-z0-9_]+\.sql$/i, `invalid migration filename: ${entry.file}`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, `invalid SHA-256 for ${entry.file}`);
    const actual = createHash("sha256").update(readFileSync(join(migrationDirectory, entry.file))).digest("hex");
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
    const actualNormalizedMd5 = createHash("md5")
      .update(normalizeMigrationText(readFileSync(join(migrationDirectory, checkpoint.file), "utf8")))
      .digest("hex");
    assert.equal(
      actualNormalizedMd5,
      checkpoint.normalizedMd5,
      `migration no longer matches the normalized SQL recorded by Supabase: ${checkpoint.file}`
    );
  }

  return { migrations: manifest.migrations.length, remoteCheckpoints: manifest.remoteCheckpoints.length };
}

// Supabase stores migration statements as text. Canonical comparison converts
// Windows line endings to LF and reduces trailing blank lines to one final LF.
export function normalizeMigrationText(sql) {
  return sql.replace(/\r\n/g, "\n").replace(/\n+$/g, "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyMigrationManifest();
  console.log(`Migration manifest verified: ${result.migrations} SQL files; ${result.remoteCheckpoints} remote checkpoints.`);
}
