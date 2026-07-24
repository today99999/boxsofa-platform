import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  recordStripeRefund,
  recordStripeWebhookFailure
} from "@/lib/server/stripe-refunds";
import { confirmStripeCheckoutPayment } from "@/lib/server/stripe-order-payment";
import { getStripeClient } from "@/lib/server/stripe";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!webhookSecret || !signature || !hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Stripe webhook is not configured." }, { status: 503 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  let handled = false;

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        handled = true;
        const result = await confirmStripeCheckoutPayment(supabase, event, session);
        if (!result.ok) {
          await recordStripeWebhookFailure(supabase, event, "checkout_processing_failed");
          return NextResponse.json({ ok: false, message: "Could not process Stripe webhook." }, { status: 500 });
        }
      }
    }

    if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
      handled = true;
      const result = await recordStripeRefund(supabase, event, event.data.object as Stripe.Refund);
      if (!result.ok) {
        await recordStripeWebhookFailure(supabase, event, result.code);
        return NextResponse.json({ ok: false, message: "Could not process Stripe webhook." }, { status: 500 });
      }
    }

  } catch {
    await recordStripeWebhookFailure(supabase, event, "checkout_processing_failed");
    return NextResponse.json({ ok: false, message: "Could not process Stripe webhook." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
