import { NextResponse } from "next/server";
import Stripe from "stripe";
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
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Invalid Stripe webhook signature." },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      const result = await confirmStripeCheckoutPayment(createSupabaseServiceRoleClient(), session);
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
