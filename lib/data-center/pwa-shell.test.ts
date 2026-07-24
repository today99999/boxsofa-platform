import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(
  new URL("../../app/data-center/layout.tsx", import.meta.url),
  "utf8"
);
const app = readFileSync(
  new URL("../../components/data-center/DataCenterApp.tsx", import.meta.url),
  "utf8"
);
const overview = readFileSync(
  new URL("../../components/data-center/OverviewSection.tsx", import.meta.url),
  "utf8"
);
const manifest = readFileSync(
  new URL("../../app/manifest.ts", import.meta.url),
  "utf8"
);
const registrar = readFileSync(
  new URL("../../components/data-center/PwaRegistrar.tsx", import.meta.url),
  "utf8"
);
const serviceWorker = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8"
);

test("data center shell authenticates the owner before rendering private HTML", () => {
  assert.match(layout, /await requireOwnerAccess\(\)/);
  assert.ok(layout.indexOf("await requireOwnerAccess()") < layout.indexOf("return <div"));
  assert.match(layout, /redirect\("\/login"\)/);
  assert.match(layout, /notFound\(\)/);
  assert.match(layout, /dynamic = "force-dynamic"/);
});

test("data center overview reads the real owner API response shape", () => {
  assert.match(app, /<OverviewSection \/>/);
  assert.match(overview, /payload\.overview/);
  assert.match(overview, /overview\.metrics\.gmvEur/);
  assert.match(overview, /overview\.metrics\.paidOrders/);
  assert.match(overview, /overview\.visitors/);
  assert.match(overview, /overview\.openAfterSales/);
});

test("data center PWA stays scoped to the private application", () => {
  assert.match(manifest, /scope: "\/data-center"/);
  assert.match(registrar, /scope: "\/data-center"/);
  assert.match(registrar, /getRegistrations\(\)/);
  assert.match(registrar, /registration\.scope === legacyScope/);
  assert.match(registrar, /new URL\(worker\.scriptURL\)\.pathname === "\/sw\.js"/);
  assert.ok(registrar.indexOf("registration.unregister()") < registrar.indexOf("serviceWorker.register"));
  assert.doesNotMatch(serviceWorker, /caches\.open|CacheStorage|cache\.put/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
});

test("planned modules are disabled and existing support remains reachable", () => {
  assert.match(app, /href: "\/admin\/support"/);
  assert.match(app, /section\.planned/);
  assert.match(app, /disabled=\{planned\}/);
  assert.match(app, /aria-pressed=\{active\}/);
});
