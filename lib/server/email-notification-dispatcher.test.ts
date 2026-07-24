import assert from "node:assert/strict";
import test from "node:test";
import { dispatchEmailNotifications, type EmailNotificationDispatchRepository } from "./email-notification-dispatcher.ts";

type Notification = {
  id: string;
  customer_email: string;
  subject: string;
  body_text: string;
  status: string;
  delivery_lease_expires_at: string | null;
  created_at: string;
};

function notification(id: string, status: string, createdAt: string, leaseExpiresAt: string | null = null): Notification {
  return {
    id,
    customer_email: `${id}@example.test`,
    subject: `Subject ${id}`,
    body_text: `Body ${id}`,
    status,
    delivery_lease_expires_at: leaseExpiresAt,
    created_at: createdAt
  };
}

function repository(rows: Notification[], outcomes: Record<string, "delivered" | "provider_failed" | "conflict" | "finalization_failed"> = {}) {
  const query: { or?: string; orders: Array<[string, { ascending: boolean } | undefined]>; limit?: number } = { orders: [] };
  const delivered: string[] = [];
  const data = {
    from(table: string) {
      assert.equal(table, "email_notifications");
      return {
        select(columns: string) {
          assert.match(columns, /customer_email/);
          return {
            or(value: string) {
              query.or = value;
              return this;
            },
            order(column: string, options?: { ascending: boolean }) {
              query.orders.push([column, options]);
              return this;
            },
            limit(value: number) {
              query.limit = value;
              return Promise.resolve({ data: rows, error: null });
            }
          };
        }
      };
    },
    async rpc(name: string, input: Record<string, unknown>) {
      if (name === "claim_email_notification_delivery") {
        const id = String(input.p_notification_id);
        const outcome = outcomes[id] ?? "delivered";
        return { data: [{ claimed: outcome !== "conflict", lease_token: outcome === "conflict" ? null : `lease-${id}` }], error: null };
      }
      if (name === "finalize_email_notification_delivery") {
        const id = String(input.p_notification_id);
        const outcome = outcomes[id] ?? "delivered";
        return { data: [{ finalized: outcome !== "finalization_failed", notification: outcome === "finalization_failed" ? null : { id } }], error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    }
  };
  const send = async (input: { to: string; idempotencyKey: string }) => {
    const id = input.to.replace("@example.test", "");
    delivered.push(id);
    assert.equal(input.idempotencyKey, `boxsofa-email/${id}`);
    const outcome = outcomes[id] ?? "delivered";
    return outcome === "provider_failed"
      ? { ok: false, provider: "resend", error: "provider error" }
      : { ok: true, provider: "resend", providerMessageId: `message-${id}` };
  };
  return { repository: data as unknown as EmailNotificationDispatchRepository, send, query, delivered };
}

test("dispatcher delivers only queued, failed, and expired sending snapshots", async () => {
  const now = "2026-07-24T12:00:00.000Z";
  const fixture = repository([
    notification("queued", "queued", "2026-07-24T00:00:00.000Z"),
    notification("failed", "failed", "2026-07-24T00:01:00.000Z"),
    notification("sending-active", "sending", "2026-07-24T00:02:00.000Z", "2026-07-24T12:01:00.000Z"),
    notification("sending-expired", "sending", "2026-07-24T00:03:00.000Z", "2026-07-24T11:59:59.000Z"),
    notification("sent", "sent", "2026-07-24T00:04:00.000Z"),
    notification("skipped", "skipped", "2026-07-24T00:05:00.000Z")
  ]);

  const summary = await dispatchEmailNotifications(fixture.repository, fixture.send, new Date(now));

  assert.deepEqual(summary, { scanned: 6, delivered: 3, failed: 0, conflicted: 0 });
  assert.deepEqual(fixture.delivered, ["queued", "failed", "sending-expired"]);
  assert.match(fixture.query.or ?? "", /status\.in\.\(queued,failed\)/);
  assert.match(fixture.query.or ?? "", /status\.eq\.sending/);
  assert.deepEqual(fixture.query.orders, [["created_at", { ascending: true }], ["id", { ascending: true }]]);
  assert.equal(fixture.query.limit, 20);
});

test("dispatcher caps each batch at twenty oldest snapshots", async () => {
  const rows = Array.from({ length: 20 }, (_, index) => notification(
    `notification-${String(index).padStart(2, "0")}`,
    "queued",
    `2026-07-24T00:${String(index).padStart(2, "0")}:00.000Z`
  ));
  const fixture = repository(rows);

  const summary = await dispatchEmailNotifications(fixture.repository, fixture.send, new Date("2026-07-24T12:00:00.000Z"));

  assert.equal(summary.scanned, 20);
  assert.equal(fixture.delivered.length, 20);
  assert.deepEqual(fixture.delivered, rows.map((row) => row.id));
  assert.equal(fixture.query.limit, 20);
});

test("dispatcher continues after provider failures and aggregates every delivery state", async () => {
  const fixture = repository([
    notification("provider-failure", "queued", "2026-07-24T00:00:00.000Z"),
    notification("conflict", "queued", "2026-07-24T00:01:00.000Z"),
    notification("finalization-failure", "queued", "2026-07-24T00:02:00.000Z"),
    notification("delivered", "queued", "2026-07-24T00:03:00.000Z")
  ], {
    "provider-failure": "provider_failed",
    conflict: "conflict",
    "finalization-failure": "finalization_failed",
    delivered: "delivered"
  });

  const summary = await dispatchEmailNotifications(fixture.repository, fixture.send, new Date("2026-07-24T12:00:00.000Z"));

  assert.deepEqual(summary, { scanned: 4, delivered: 1, failed: 2, conflicted: 1 });
  assert.deepEqual(fixture.delivered, ["provider-failure", "finalization-failure", "delivered"]);
});
