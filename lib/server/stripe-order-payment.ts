import Stripe from "stripe";
import { buildOrderEmailPreview } from "@/lib/email-notifications";
import { queueOrderEmailPreview } from "@/lib/server/email-notification-queue";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type OrderInventoryItem = {
  product_id: string | null;
  quantity: number;
};

type ProductInventoryRow = {
  id: string;
  stock: number;
  reserved_stock: number;
};

type StripePaymentResult = {
  ok: boolean;
  message?: string;
};

export async function confirmStripeCheckoutPayment(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  session: Stripe.Checkout.Session
): Promise<StripePaymentResult> {
  const orderId = session.metadata?.orderId;
  const orderNumber = session.metadata?.orderNumber;

  if (!orderId || !orderNumber) {
    return { ok: false, message: "Stripe session is missing order metadata." };
  }

  const { data: order, error: orderLoadError } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status, total_eur, customer_name, customer_email")
    .eq("id", orderId)
    .single();

  if (orderLoadError || !order) {
    return { ok: false, message: orderLoadError?.message || "Order not found." };
  }

  if (order.order_number !== orderNumber) {
    return { ok: false, message: "Stripe session order metadata does not match the order." };
  }

  if (session.amount_total !== null && Math.round(Number(order.total_eur) * 100) !== session.amount_total) {
    return { ok: false, message: "Stripe paid amount does not match the order total." };
  }

  if (order.payment_status === "paid" || order.payment_status === "refunded") {
    return { ok: true };
  }

  if (order.payment_status === "confirmed_offline") {
    return { ok: false, message: "Order was already confirmed offline." };
  }

  const now = new Date().toISOString();
  const { data: orderItems, error: itemsLoadError } = await supabase
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", order.id);

  if (itemsLoadError) {
    return { ok: false, message: itemsLoadError.message };
  }

  const quantitiesByProduct = (orderItems as OrderInventoryItem[] | null ?? []).reduce<Record<string, number>>(
    (result, item) => {
      if (!item.product_id) return result;
      result[item.product_id] = (result[item.product_id] ?? 0) + item.quantity;
      return result;
    },
    {}
  );

  const productIds = Object.keys(quantitiesByProduct);
  const committedProducts: ProductInventoryRow[] = [];

  if (productIds.length > 0) {
    const { data: productRows, error: productsLoadError } = await supabase
      .from("products")
      .select("id, stock, reserved_stock")
      .in("id", productIds);

    if (productsLoadError) {
      return { ok: false, message: productsLoadError.message };
    }

    const productsById = new Map((productRows as ProductInventoryRow[] | null ?? []).map((product) => [product.id, product]));
    for (const productId of productIds) {
      const product = productsById.get(productId);
      const quantity = quantitiesByProduct[productId];
      if (!product || product.reserved_stock < quantity || product.stock < quantity) {
        return { ok: false, message: "Reserved stock is no longer enough for this paid order." };
      }
    }

    for (const productId of productIds) {
      const product = productsById.get(productId)!;
      const quantity = quantitiesByProduct[productId];
      const nextStock = product.stock - quantity;
      const nextReservedStock = product.reserved_stock - quantity;
      const { data: updatedRows, error: inventoryUpdateError } = await supabase
        .from("products")
        .update({ stock: nextStock, reserved_stock: nextReservedStock })
        .eq("id", product.id)
        .eq("stock", product.stock)
        .eq("reserved_stock", product.reserved_stock)
        .select("id");

      if (inventoryUpdateError || !updatedRows || updatedRows.length === 0) {
        for (const committedProduct of committedProducts) {
          await supabase
            .from("products")
            .update({ stock: committedProduct.stock, reserved_stock: committedProduct.reserved_stock })
            .eq("id", committedProduct.id);
        }
        return { ok: false, message: inventoryUpdateError?.message || "Could not commit reserved stock." };
      }

      committedProducts.push(product);
      const { error: movementInsertError } = await supabase.from("inventory_movements").insert({
        product_id: product.id,
        movement_type: "payment_confirmed",
        quantity_delta: -quantity,
        stock_after: nextStock,
        reason: `Order ${order.order_number} Stripe payment confirmed`,
        order_id: order.id
      });

      if (movementInsertError) {
        for (const committedProduct of committedProducts) {
          await supabase
            .from("products")
            .update({ stock: committedProduct.stock, reserved_stock: committedProduct.reserved_stock })
            .eq("id", committedProduct.id);
        }
        return { ok: false, message: movementInsertError.message };
      }
    }
  }

  const providerPaymentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? session.id;

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      status: "paid_confirmed",
      payment_status: "paid",
      payment_provider: "stripe",
      payment_reference: session.id,
      payment_method_note: "Stripe Checkout",
      paid_at: now
    })
    .eq("id", order.id);

  if (orderUpdateError) {
    for (const committedProduct of committedProducts) {
      await supabase
        .from("products")
        .update({ stock: committedProduct.stock, reserved_stock: committedProduct.reserved_stock })
        .eq("id", committedProduct.id);
    }
    return { ok: false, message: orderUpdateError.message };
  }

  await supabase.from("payments").insert({
    order_id: order.id,
    provider: "stripe",
    provider_payment_id: providerPaymentId,
    status: "paid",
    amount_eur: Number(order.total_eur),
    currency: (session.currency || "eur").toUpperCase(),
    confirmed_at: now,
    raw_payload: session
  });

  const emailPreview = buildOrderEmailPreview("payment_confirmed", {
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    totalEur: Number(order.total_eur)
  });
  await queueOrderEmailPreview(supabase, order.id, order.order_number, emailPreview);

  return { ok: true };
}
