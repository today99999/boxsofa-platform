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
  assert.equal(manifest.version, 1, "unsupported migration manifest version");
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

  return manifest.migrations.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Migration manifest verified: ${verifyMigrationManifest()} SQL files.`);
}
