import Stripe from "stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type StripePaymentResult = {
  ok: boolean;
  message?: string;
  eventProcessed?: boolean;
  paymentConfirmed?: boolean;
  emailQueued?: boolean;
};

export function getStripePaymentIdentifiers(session: Stripe.Checkout.Session) {
  return {
    providerPaymentId:
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? session.id,
    sessionId: session.id
  };
}

export async function confirmStripeCheckoutPayment(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  event: Pick<Stripe.Event, "id" | "type">,
  session: Stripe.Checkout.Session
): Promise<StripePaymentResult> {
  const orderId = session.metadata?.orderId;
  const orderNumber = session.metadata?.orderNumber;
  const { providerPaymentId, sessionId } = getStripePaymentIdentifiers(session);

  if (!orderId || !orderNumber || session.amount_total === null || !session.currency) {
    return { ok: false, message: "Stripe checkout metadata is incomplete." };
  }

  const { data, error } = await supabase.rpc("record_stripe_checkout_payment", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_order_id: orderId,
    p_order_number: orderNumber,
    p_provider_payment_id: providerPaymentId,
    p_session_id: sessionId,
    p_amount_cents: session.amount_total,
    p_currency: session.currency,
    p_raw_payload: session
  });

  const outcome = Array.isArray(data) ? data[0] : null;
  if (error || !outcome || outcome.ok !== true) {
    return { ok: false, message: "Stripe checkout payment could not be committed." };
  }

  return {
    ok: true,
    eventProcessed: outcome.event_processed === true,
    paymentConfirmed: outcome.payment_confirmed === true,
    emailQueued: outcome.email_queued === true
  };
}
