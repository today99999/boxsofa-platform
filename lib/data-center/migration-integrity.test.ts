import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { normalizeMigrationText } from "../../scripts/verify-migration-manifest.mjs";

function runScript(script: string) {
  return spawnSync(process.execPath, [script], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8"
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

test("bootstrap SQL has no patch artifacts and passes lexical statement validation", () => {
  const result = runScript("scripts/validate-bootstrap-sql.mjs");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Bootstrap SQL lexical validation passed/);
});
