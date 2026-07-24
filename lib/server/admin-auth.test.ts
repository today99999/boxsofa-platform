import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isOwnerAdminRole } from "./admin-roles.ts";

const adminRoutesRoot = new URL("../../app/api/admin/", import.meta.url);

function routeFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    return entry.isDirectory() ? routeFiles(child) : entry.name === "route.ts" ? [child] : [];
  });
}

test("only owner profiles qualify for every first-release admin route", () => {
  assert.equal(isOwnerAdminRole("owner"), true);
  assert.equal(isOwnerAdminRole("service"), false);
  assert.equal(isOwnerAdminRole("admin"), false);
  assert.equal(isOwnerAdminRole(null), false);

  const files = routeFiles(adminRoutesRoot);
  assert.ok(files.length >= 10);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /require(?:Admin|Owner)Access|from "\.\.\/readiness\/route"/,
      `Admin route ${join(file.pathname)} must use owner-only access control or re-export the protected readiness route.`
    );
  }
});
