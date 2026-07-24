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
  succeededAt?: string | null;
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

export function normalizeStripeRefundStatus(status: string | null | undefined): StripeRefundStatus {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "succeeded") return "succeeded";
  if (normalized === "failed" || normalized === "failure") return "failed";
  if (normalized === "canceled" || normalized === "cancelled") return "cancelled";
  return "pending";
}

export function isFullRefund(orderTotal: number, succeededRefundTotal: number) {
  return toComparableCents(succeededRefundTotal) >= toComparableCents(orderTotal);
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
        const status = resolveMonotonicRefundStatus(existing?.status, incomingStatus);
        const persisted = !existing || status !== existing.status;

        await repository.upsertRefund({
          orderId: existing?.orderId ?? payment.orderId,
          paymentId: existing?.paymentId ?? payment.id,
          providerRefundId: input.id,
          amountCents: existing?.amountCents ?? input.amountCents,
          currency: "EUR",
          status,
          reason: input.reason,
          rawPayload: input.rawPayload,
          succeededAt: existing?.succeededAt ?? (status === "succeeded" ? new Date().toISOString() : null)
        });

        if (status !== "succeeded") {
          return { ok: true, status, orderRefunded: false, persisted };
        }

        const [succeededRefundCents, orderTotalCents] = await Promise.all([
          repository.getSucceededRefundTotalCents(payment.orderId),
          repository.getOrderTotalCents(payment.orderId)
        ]);
        if (orderTotalCents === null) return { ok: false, code: "order_not_found" };

        const orderRefunded = succeededRefundCents >= orderTotalCents;
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

export async function recordStripeRefund(
  supabase: ServiceClient,
  event: Pick<Stripe.Event, "id" | "type">,
  refund: Stripe.Refund
) {
  const input = toStripeRefundInput(refund);
  const validation = validateRefundInput(input);
  if (validation) return validation;

  const { data, error } = await supabase.rpc("record_stripe_refund", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_provider_refund_id: input.id,
    p_provider_payment_id: input.paymentIntentId,
    p_amount_cents: input.amountCents,
    p_currency: input.currency,
    p_status: input.status ?? "pending",
    p_reason: input.reason,
    p_raw_payload: input.rawPayload
  });

  const outcome = Array.isArray(data) ? data[0] : null;
  if (error || !outcome || outcome.ok !== true) {
    return { ok: false as const, code: "database_error" as const };
  }

  return {
    ok: true as const,
    status: normalizeStripeRefundStatus(input.status),
    orderRefunded: outcome.order_refunded === true,
    persisted: outcome.event_processed === true
  };
}

export async function recordStripeWebhookFailure(
  supabase: ServiceClient,
  event: Pick<Stripe.Event, "id" | "type">,
  _code: StripeRefundFailureCode | "checkout_processing_failed" | "source_health_update_failed"
) {
  const { error } = await supabase.rpc("mark_stripe_webhook_failure", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_error_code: "stripe_webhook_failed"
  });
  return { ok: !error };
}

export function resolveMonotonicRefundStatus(
  existing: StripeRefundStatus | undefined,
  incoming: StripeRefundStatus
): StripeRefundStatus {
  if (!existing || existing === "pending") return incoming;
  if (existing === "succeeded") return "succeeded";
  return existing;
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
