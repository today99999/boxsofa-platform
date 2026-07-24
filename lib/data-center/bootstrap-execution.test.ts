import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("full bootstrap executes in disposable PGlite with only documented Supabase stubs", () => {
  const result = spawnSync(process.execPath, ["scripts/execute-bootstrap-pglite.mjs"], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
    timeout: 120_000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Bootstrap PGlite execution passed: 26 core tables, 8 core functions, 7 owner policies, 26 RLS tables, 22 critical RPCs/);
});
