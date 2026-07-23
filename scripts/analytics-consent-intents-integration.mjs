import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const RUN_FLAG = "RUN_SUPABASE_INTENT_INTEGRATION";
const requiredEnvironment = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

if (process.env[RUN_FLAG] !== "1") {
  throw new Error(`${RUN_FLAG}=1 is required before this live Supabase integration test can run.`);
}

for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required for this live Supabase integration test.`);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Two separately constructed HTTP/RPC clients exercise concurrent requests through
// the deployed Supabase API. No direct database URL is required or inspected.
const clientA = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const clientB = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const visitorIds = new Set();

function newVisitorId() {
  const visitorId = `codex-intent-test-${randomUUID()}`;
  visitorIds.add(visitorId);
  return visitorId;
}

function firstRow(data) {
  const row = Array.isArray(data) ? data[0] : null;
  assert.ok(row && typeof row === "object", "expected one RPC result row");
  return row;
}

async function issue(client, visitorId) {
  const { data, error } = await client.rpc("issue_analytics_consent_intent", { p_visitor_id: visitorId });
  assert.equal(error, null, "intent issuance RPC must succeed");
  const row = firstRow(data);
  assert.equal(typeof row.intent_id, "string", "intent issuance must return an id");
  assert.equal(typeof row.intent_revision, "number", "intent issuance must return a revision");
  return { id: row.intent_id, revision: row.intent_revision };
}

async function record(client, visitorId, consent, intentId) {
  const { data, error } = await client.rpc("record_analytics_consent", {
    p_visitor_id: visitorId,
    p_consent: consent,
    p_locale: "en",
    p_consent_version: "codex-live-integration",
    p_intent_id: intentId
  });
  assert.equal(error, null, "consent recording RPC must return a structured stale/accepted result");
  return firstRow(data);
}

async function cleanup(visitorId) {
  for (const table of ["analytics_consents", "analytics_consent_intents", "analytics_consent_intent_heads"]) {
    const { error } = await clientA.from(table).delete().eq("visitor_id", visitorId);
    assert.equal(error, null, `service-role cleanup must delete ${table}`);
  }

  for (const table of ["analytics_consents", "analytics_consent_intents", "analytics_consent_intent_heads"]) {
    const { count, error } = await clientA.from(table).select("*", { count: "exact", head: true }).eq("visitor_id", visitorId);
    assert.equal(error, null, `service-role cleanup must verify ${table}`);
    assert.equal(count, 0, `cleanup left ${count} ${table} row(s) for a test visitor`);
  }
}

async function testSequentialSupersession() {
  const visitorId = newVisitorId();
  const first = await issue(clientA, visitorId);
  const second = await issue(clientB, visitorId);
  const stale = await record(clientA, visitorId, "analytics", first.id);
  const accepted = await record(clientB, visitorId, "necessary", second.id);

  assert.equal(stale.accepted, false, "A must be rejected after B is issued");
  assert.equal(stale.stale, true, "A must be marked stale after B is issued");
  assert.equal(accepted.accepted, true, "B must be accepted");

  const replay = await record(clientA, visitorId, "analytics", second.id);
  assert.equal(replay.accepted, false, "accepted intents must be one-time");

  const otherVisitor = newVisitorId();
  const crossVisitor = await record(clientB, otherVisitor, "analytics", second.id);
  assert.equal(crossVisitor.accepted, false, "an intent cannot be replayed for a different visitor");
}

async function testConcurrentIssueAndSubmission() {
  const visitorId = newVisitorId();
  const issued = await Promise.all([issue(clientA, visitorId), issue(clientB, visitorId)]);
  const ordered = [...issued].sort((left, right) => left.revision - right.revision);
  assert.notEqual(ordered[0].revision, ordered[1].revision, "concurrent issues must get unique revisions");

  const [oldResult, latestResult] = await Promise.all([
    record(clientA, visitorId, "analytics", ordered[0].id),
    record(clientB, visitorId, "necessary", ordered[1].id)
  ]);
  assert.equal(oldResult.accepted, false, "the older concurrent intent must lose");
  assert.equal(latestResult.accepted, true, "the newest concurrent intent must win");

  const { data: head, error } = await clientA
    .from("analytics_consent_intent_heads")
    .select("latest_intent_revision")
    .eq("visitor_id", visitorId)
    .single();
  assert.equal(error, null, "latest-issued head must be readable by the service role");
  assert.equal(head.latest_intent_revision, ordered[1].revision, "the durable head must retain the newest revision");
}

async function testCleanupKeepsHeadAndRejectsOldIntent() {
  const visitorId = newVisitorId();
  const oldIntent = await issue(clientA, visitorId);
  const latestIntent = await issue(clientB, visitorId);

  const { error: ageError } = await clientA
    .from("analytics_consent_intents")
    .update({
      issued_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    })
    .eq("id", oldIntent.id);
  assert.equal(ageError, null, "test fixture may age only its own intent row");

  const { error: cleanupError } = await clientB.rpc("cleanup_analytics_consent_intents", { p_limit: 25 });
  assert.equal(cleanupError, null, "bounded cleanup RPC must succeed");

  const { data: head, error: headError } = await clientA
    .from("analytics_consent_intent_heads")
    .select("latest_intent_revision")
    .eq("visitor_id", visitorId)
    .single();
  assert.equal(headError, null, "cleanup must preserve the durable intent head");
  assert.equal(head.latest_intent_revision, latestIntent.revision, "cleanup must not erase the latest-issued marker");

  const stale = await record(clientA, visitorId, "analytics", oldIntent.id);
  assert.equal(stale.accepted, false, "an expired or cleaned old intent must remain rejected");
  const accepted = await record(clientB, visitorId, "necessary", latestIntent.id);
  assert.equal(accepted.accepted, true, "cleanup must not prevent the newest intent from succeeding");
}

try {
  await testSequentialSupersession();
  await testConcurrentIssueAndSubmission();
  await testCleanupKeepsHeadAndRejectsOldIntent();
} finally {
  const cleanupResults = await Promise.allSettled([...visitorIds].map(cleanup));
  const failed = cleanupResults.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

console.log(`Supabase consent intent integration passed; cleanup verified for ${visitorIds.size} test visitor(s).`);
