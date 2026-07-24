import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchEmailNotifications,
  type EmailNotificationDispatchRepository
} from "./email-notification-dispatcher.ts";

const EMAIL_NOTIFICATION_MAX_AUTOMATIC_ATTEMPTS = 5;

type Notification = {
  id: string;
  customer_email: string;
  subject: string;
  body_text: string;
  event: string;
  automatic_delivery_eligible: boolean;
  automatic_quarantined_at: string | null;
  attempts: number;
  next_attempt_at: string | null;
  status: string;
  delivery_lease_expires_at: string | null;
  created_at: string;
};

type NotificationOptions = Partial<Pick<
  Notification,
  "event" | "automatic_delivery_eligible" | "automatic_quarantined_at" | "attempts" | "next_attempt_at"
>>;

function notification(
  id: string,
  status: string,
  createdAt: string,
  leaseExpiresAt: string | null = null,
  options: NotificationOptions = {}
): Notification {
  return {
    id,
    customer_email: `${id}@example.test`,
    subject: `Subject ${id}`,
    body_text: `Body ${id}`,
    event: "payment_confirmed",
    automatic_delivery_eligible: true,
    automatic_quarantined_at: null,
    attempts: 0,
    next_attempt_at: null,
    status,
    delivery_lease_expires_at: leaseExpiresAt,
    created_at: createdAt,
    ...options
  };
}

type Outcome =
  | "delivered"
  | "provider_failed"
  | "conflict"
  | "finalization_failed"
  | "claim_transport_error"
  | "finalize_transport_error";

function repository(rows: Notification[], outcomes: Record<string, Outcome> = {}) {
  const query: {
    or?: string;
    equals: Record<string, unknown>;
    nulls: Record<string, unknown>;
    lessThan: Record<string, number>;
    orders: Array<[string, { ascending: boolean } | undefined]>;
    limit?: number;
  } = { equals: {}, nulls: {}, lessThan: {}, orders: [] };
  const delivered: string[] = [];
  const automaticClaims: unknown[] = [];
  const data = {
    from(table: string) {
      assert.equal(table, "email_notifications");
      return {
        select(columns: string) {
          assert.match(columns, /customer_email/);
          return {
            eq(column: string, value: unknown) {
              query.equals[column] = value;
              return this;
            },
            is(column: string, value: unknown) {
              query.nulls[column] = value;
              return this;
            },
            lt(column: string, value: number) {
              query.lessThan[column] = value;
              return this;
            },
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
              const nowMatch = query.or?.match(/next_attempt_at\.lte\.([^,)]+)/);
              const now = nowMatch ? Date.parse(nowMatch[1]) : Number.POSITIVE_INFINITY;
              const selected = rows
                .filter((row) => query.equals.event === undefined || row.event === query.equals.event)
                .filter((row) => query.equals.automatic_delivery_eligible === undefined
                  || row.automatic_delivery_eligible === query.equals.automatic_delivery_eligible)
                .filter((row) => query.nulls.automatic_quarantined_at === undefined
                  || row.automatic_quarantined_at === query.nulls.automatic_quarantined_at)
                .filter((row) => query.lessThan.attempts === undefined || row.attempts < query.lessThan.attempts)
                .filter((row) => {
                  if (query.equals.event === undefined) return true;
                  if (row.status === "queued" || row.status === "failed") {
                    return row.next_attempt_at === null || Date.parse(row.next_attempt_at) <= now;
                  }
                  return row.status === "sending"
                    && row.delivery_lease_expires_at !== null
                    && Date.parse(row.delivery_lease_expires_at) <= now;
                })
                .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
                .slice(0, value);
              return Promise.resolve({ data: selected, error: null });
            }
          };
        }
      };
    },
    async rpc(name: string, input: Record<string, unknown>) {
      if (name === "claim_email_notification_delivery") {
        const id = String(input.p_notification_id);
        const outcome = outcomes[id] ?? "delivered";
        if (outcome === "claim_transport_error") return { data: null, error: new Error("private transport detail") };
        automaticClaims.push(input.p_automatic);
        return { data: [{ claimed: outcome !== "conflict", lease_token: outcome === "conflict" ? null : `lease-${id}` }], error: null };
      }
      if (name === "finalize_email_notification_delivery") {
        const id = String(input.p_notification_id);
        const outcome = outcomes[id] ?? "delivered";
        if (outcome === "finalize_transport_error") return { data: null, error: new Error("private transport detail") };
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
      ? { ok: false, provider: "resend", error: "email_provider_http_error:503" }
      : { ok: true, provider: "resend", providerMessageId: `message-${id}` };
  };
  return { repository: data as unknown as EmailNotificationDispatchRepository, send, query, delivered, automaticClaims };
}

test("dispatcher selects only eligible payment notifications and expired leases", async () => {
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

  assert.deepEqual(summary, { scanned: 3, delivered: 3, failed: 0, conflicted: 0 });
  assert.deepEqual(fixture.delivered, ["queued", "failed", "sending-expired"]);
  assert.equal(fixture.query.equals.event, "payment_confirmed");
  assert.equal(fixture.query.equals.automatic_delivery_eligible, true);
  assert.equal(fixture.query.nulls.automatic_quarantined_at, null);
  assert.equal(fixture.query.lessThan.attempts, EMAIL_NOTIFICATION_MAX_AUTOMATIC_ATTEMPTS);
  assert.deepEqual(fixture.automaticClaims, [true, true, true]);
  assert.match(fixture.query.or ?? "", /status\.in\.\(queued,failed\)/);
  assert.match(fixture.query.or ?? "", /next_attempt_at/);
  assert.match(fixture.query.or ?? "", /status\.eq\.sending/);
  assert.deepEqual(fixture.query.orders, [["created_at", { ascending: true }], ["id", { ascending: true }]]);
  assert.equal(fixture.query.limit, 20);
});

test("twenty exhausted old failures cannot starve a newer eligible payment email", async () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, index) => notification(
      `exhausted-${String(index).padStart(2, "0")}`,
      "failed",
      `2026-07-23T00:${String(index).padStart(2, "0")}:00.000Z`,
      null,
      {
        attempts: EMAIL_NOTIFICATION_MAX_AUTOMATIC_ATTEMPTS,
        automatic_quarantined_at: "2026-07-23T01:00:00.000Z"
      }
    )),
    notification("new-payment", "queued", "2026-07-24T00:00:00.000Z")
  ];
  const fixture = repository(rows);

  const summary = await dispatchEmailNotifications(fixture.repository, fixture.send, new Date("2026-07-24T12:00:00.000Z"));

  assert.deepEqual(summary, { scanned: 1, delivered: 1, failed: 0, conflicted: 0 });
  assert.deepEqual(fixture.delivered, ["new-payment"]);
  assert.equal(fixture.query.limit, 20);
});

test("automatic rollout excludes historical and non-payment snapshots", async () => {
  const fixture = repository([
    notification("order-submitted", "queued", "2026-07-24T00:00:00.000Z", null, { event: "order_submitted" }),
    notification("shipped", "queued", "2026-07-24T00:01:00.000Z", null, { event: "order_shipped" }),
    notification("cancelled", "queued", "2026-07-24T00:02:00.000Z", null, { event: "order_cancelled" }),
    notification("legacy-paid", "queued", "2026-07-24T00:03:00.000Z", null, { automatic_delivery_eligible: false }),
    notification("new-paid", "queued", "2026-07-24T00:04:00.000Z")
  ]);

  const summary = await dispatchEmailNotifications(fixture.repository, fixture.send, new Date("2026-07-24T12:00:00.000Z"));

  assert.deepEqual(summary, { scanned: 1, delivered: 1, failed: 0, conflicted: 0 });
  assert.deepEqual(fixture.delivered, ["new-paid"]);
});

test("dispatcher continues after provider and repository transport failures", async () => {
  const fixture = repository([
    notification("claim-transport", "queued", "2026-07-24T00:00:00.000Z"),
    notification("provider-failure", "queued", "2026-07-24T00:01:00.000Z"),
    notification("finalize-transport", "queued", "2026-07-24T00:02:00.000Z"),
    notification("conflict", "queued", "2026-07-24T00:03:00.000Z"),
    notification("delivered", "queued", "2026-07-24T00:04:00.000Z")
  ], {
    "claim-transport": "claim_transport_error",
    "provider-failure": "provider_failed",
    "finalize-transport": "finalize_transport_error",
    conflict: "conflict",
    delivered: "delivered"
  });

  const summary = await dispatchEmailNotifications(fixture.repository, fixture.send, new Date("2026-07-24T12:00:00.000Z"));

  assert.deepEqual(summary, { scanned: 5, delivered: 1, failed: 3, conflicted: 1 });
  assert.deepEqual(fixture.delivered, ["provider-failure", "finalize-transport", "delivered"]);
});
