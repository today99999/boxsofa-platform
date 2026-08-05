import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  recordStripeRefund,
  recordStripeWebhookFailure
} from "@/lib/server/stripe-refunds";
import { sendTransactionalEmail } from "@/lib/server/email-provider";
import { sendPaidOrderMerchantNotification } from "@/lib/server/paid-order-merchant-notification";
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

        const orderId = session.metadata?.orderId;
        if (!orderId) {
          return NextResponse.json({ ok: false, message: "Could not notify the merchant." }, { status: 500 });
        }

        const merchantNotification = await sendPaidOrderMerchantNotification({
          orderId,
          recipient: process.env.ORDER_NOTIFY_EMAIL || "info@boxsofa.eu",
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://boxsofa.eu",
          repository: {
            async loadPaidOrder(id) {
              const { data, error } = await supabase
                .from("orders")
                .select(
                  "id, order_number, customer_name, customer_email, customer_phone, address_snapshot, total_eur, payment_status, order_items(name_snapshot, color_snapshot, quantity)"
                )
                .eq("id", id)
                .eq("payment_status", "paid")
                .maybeSingle();

              if (error) throw error;
              if (!data) return null;

              const addressSnapshot =
                data.address_snapshot && typeof data.address_snapshot === "object"
                  ? data.address_snapshot as { countryCode?: unknown }
                  : null;
              return {
                id: data.id,
                orderNumber: data.order_number,
                customerName: data.customer_name,
                customerEmail: data.customer_email,
                customerPhone: data.customer_phone,
                countryCode:
                  typeof addressSnapshot?.countryCode === "string"
                    ? addressSnapshot.countryCode
                    : "",
                totalEur: Number(data.total_eur),
                items: (data.order_items || []).map((item) => ({
                  name: item.name_snapshot,
                  color: item.color_snapshot,
                  quantity: item.quantity
                }))
              };
            }
          },
          send: sendTransactionalEmail
        });

        if (merchantNotification.state !== "delivered") {
          return NextResponse.json({ ok: false, message: "Could not notify the merchant." }, { status: 500 });
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
