import type Stripe from "stripe";
import type { createSupabaseServiceRoleClient } from "../supabase/server.ts";

export type StripeRefundStatus = "pending" | "succeeded" | "failed" | "cancelled";

export type StripeRefundInput = {
  id: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  status: string | null | undefined;
  reason: string | null;
  rawPayload: unknown;
};

export type StoredStripeRefund = {
  orderId: string;
  paymentId: string;
  providerRefundId: string;
  amountCents: number;
  currency: "EUR";
  status: StripeRefundStatus;
  reason: string | null;
  rawPayload: unknown;
};

export type StripeRefundRepository = {
  findPaidStripePayment(paymentIntentId: string): Promise<{ id: string; orderId: string } | null>;
  findRefund(providerRefundId: string): Promise<StoredStripeRefund | null>;
  upsertRefund(refund: StoredStripeRefund): Promise<void>;
  getSucceededRefundTotalCents(orderId: string): Promise<number>;
  getOrderTotalCents(orderId: string): Promise<number | null>;
  markOrderRefunded(orderId: string): Promise<void>;
};

export type StripeRefundProcessingResult =
  | { ok: true; status: StripeRefundStatus; orderRefunded: boolean; persisted: boolean }
  | { ok: false; code: "missing_payment_intent" | "unsupported_currency" | "invalid_amount" | "payment_not_found" | "order_not_found" | "database_error" };

export type StripeRefundFailureCode = Extract<StripeRefundProcessingResult, { ok: false }> ["code"];

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

const STATUS_RANK: Record<StripeRefundStatus, number> = {
  pending: 1,
  failed: 2,
  cancelled: 2,
  succeeded: 3
};

export function normalizeStripeRefundStatus(status: string | null | undefined): StripeRefundStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "canceled") return "cancelled";
  return "pending";
}

export function isFullRefund(orderTotalEur: number, succeededRefundEur: number) {
  return toComparableCents(succeededRefundEur) >= toComparableCents(orderTotalEur);
}

export function toStripeRefundInput(refund: Stripe.Refund): StripeRefundInput {
  const paymentIntent = refund.payment_intent;
  return {
    id: refund.id,
    paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null,
    amountCents: refund.amount,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason ?? null,
    rawPayload: refund
  };
}

export function createStripeRefundProcessor(repository: StripeRefundRepository) {
  return {
    async record(input: StripeRefundInput): Promise<StripeRefundProcessingResult> {
      const validation = validateRefundInput(input);
      if (validation) return validation;

      try {
        const payment = await repository.findPaidStripePayment(input.paymentIntentId!);
        if (!payment) return { ok: false, code: "payment_not_found" };

        const incomingStatus = normalizeStripeRefundStatus(input.status);
        const existing = await repository.findRefund(input.id);
        const status = existing && STATUS_RANK[existing.status] >= STATUS_RANK[incomingStatus]
          ? existing.status
          : incomingStatus;
        const persisted = !existing || status !== existing.status;

        if (persisted) {
          await repository.upsertRefund({
            orderId: payment.orderId,
            paymentId: payment.id,
            providerRefundId: input.id,
            amountCents: input.amountCents,
            currency: "EUR",
            status,
            reason: input.reason,
            rawPayload: input.rawPayload
          });
        }

        if (status !== "succeeded") {
          return { ok: true, status, orderRefunded: false, persisted };
        }

        const [succeededRefundCents, orderTotalCents] = await Promise.all([
          repository.getSucceededRefundTotalCents(payment.orderId),
          repository.getOrderTotalCents(payment.orderId)
        ]);
        if (orderTotalCents === null) return { ok: false, code: "order_not_found" };

        const orderRefunded = isFullRefund(centsToEur(orderTotalCents), centsToEur(succeededRefundCents));
        if (orderRefunded) {
          await repository.markOrderRefunded(payment.orderId);
        }

        return { ok: true, status, orderRefunded, persisted };
      } catch {
        return { ok: false, code: "database_error" };
      }
    }
  };
}

export async function recordStripeRefund(supabase: ServiceClient, refund: Stripe.Refund) {
  return createStripeRefundProcessor(createSupabaseStripeRefundRepository(supabase)).record(toStripeRefundInput(refund));
}

export async function recordStripeWebhookSuccess(supabase: ServiceClient, eventType: string) {
  return updateStripeWebhookHealth(supabase, {
    eventType,
    state: "current",
    lastError: null,
    succeeded: true
  });
}

export async function recordStripeWebhookFailure(
  supabase: ServiceClient,
  eventType: string,
  code: StripeRefundFailureCode | "checkout_processing_failed" | "source_health_update_failed"
) {
  return updateStripeWebhookHealth(supabase, {
    eventType,
    state: code === "payment_not_found" || code === "order_not_found" ? "delayed" : "failed",
    lastError: code,
    succeeded: false
  });
}

function validateRefundInput(input: StripeRefundInput): Extract<StripeRefundProcessingResult, { ok: false }> | null {
  if (!input.paymentIntentId) return { ok: false, code: "missing_payment_intent" };
  if (input.currency.trim().toUpperCase() !== "EUR") return { ok: false, code: "unsupported_currency" };
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) return { ok: false, code: "invalid_amount" };
  return null;
}

function toComparableCents(value: number): number {
  return Math.round(value * 100);
}

function centsToEur(cents: number): number {
  return cents / 100;
}

function createSupabaseStripeRefundRepository(supabase: ServiceClient): StripeRefundRepository {
  return {
    async findPaidStripePayment(paymentIntentId) {
      const { data, error } = await supabase
        .from("payments")
        .select("id, order_id")
        .eq("provider", "stripe")
        .eq("provider_payment_id", paymentIntentId)
        .eq("status", "paid")
        .maybeSingle();
      if (error) throw new Error("stripe_payment_lookup_failed");
      return data ? { id: data.id, orderId: data.order_id } : null;
    },

    async findRefund(providerRefundId) {
      const { data, error } = await supabase
        .from("payment_refunds")
        .select("order_id, payment_id, provider_refund_id, amount_eur, currency, status, reason, raw_payload")
        .eq("provider_refund_id", providerRefundId)
        .maybeSingle();
      if (error) throw new Error("stripe_refund_lookup_failed");
      if (!data) return null;
      return {
        orderId: data.order_id,
        paymentId: data.payment_id ?? "",
        providerRefundId: data.provider_refund_id,
        amountCents: toComparableCents(Number(data.amount_eur)),
        currency: "EUR",
        status: normalizeStripeRefundStatus(data.status),
        reason: data.reason,
        rawPayload: data.raw_payload
      };
    },

    async upsertRefund(refund) {
      const { error } = await supabase.from("payment_refunds").upsert(
        {
          order_id: refund.orderId,
          payment_id: refund.paymentId,
          provider: "stripe",
          provider_refund_id: refund.providerRefundId,
          amount_eur: centsToEur(refund.amountCents),
          currency: refund.currency,
          status: refund.status,
          reason: refund.reason,
          raw_payload: refund.rawPayload
        },
        { onConflict: "provider_refund_id" }
      );
      if (error) throw new Error("stripe_refund_write_failed");
    },

    async getSucceededRefundTotalCents(orderId) {
      const { data, error } = await supabase
        .from("payment_refunds")
        .select("amount_eur")
        .eq("order_id", orderId)
        .eq("status", "succeeded");
      if (error) throw new Error("stripe_refund_total_failed");
      return (data ?? []).reduce((total, row) => total + toComparableCents(Number(row.amount_eur)), 0);
    },

    async getOrderTotalCents(orderId) {
      const { data, error } = await supabase.from("orders").select("total_eur").eq("id", orderId).maybeSingle();
      if (error) throw new Error("order_total_lookup_failed");
      return data ? toComparableCents(Number(data.total_eur)) : null;
    },

    async markOrderRefunded(orderId) {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "refunded", status: "refunded" })
        .eq("id", orderId)
        .neq("payment_status", "refunded");
      if (error) throw new Error("order_refund_status_update_failed");
    }
  };
}

async function updateStripeWebhookHealth(
  supabase: ServiceClient,
  input: { eventType: string; state: "current" | "delayed" | "failed"; lastError: string | null; succeeded: boolean }
) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("data_source_health").upsert(
    {
      source_key: "stripe",
      source_type: "stripe",
      state: input.state,
      last_attempt_at: now,
      ...(input.succeeded ? { last_success_at: now } : {}),
      last_error: input.lastError,
      metadata: { lastEventType: input.eventType, lastOutcome: input.succeeded ? "success" : "failure" }
    },
    { onConflict: "source_key" }
  );
  return { ok: !error };
}
