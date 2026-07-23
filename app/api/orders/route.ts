import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { trackOrderEventFields } from "@/lib/server/analytics";
import { buildOrderEmailPreview } from "@/lib/email-notifications";
import { queueOrderEmailPreview } from "@/lib/server/email-notification-queue";
import { ADMIN_ORDER_WITH_ITEMS_SELECT, type OrderRow, toLocalOrder } from "@/lib/server/orders";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getSiteUrl, getStripeClient, hasStripeCheckoutConfig } from "@/lib/server/stripe";
import { isEuropeDeliveryCountry } from "@/lib/europeShipping";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabasePublicConfig,
  hasSupabaseServiceRoleConfig
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const orderItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  priceEur: z.number().nonnegative(),
  image: z.string().min(1),
  quantity: z.number().int().positive()
});

const createOrderSchema = z.object({
  customerName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .refine(isEuropeDeliveryCountry, "Delivery country must be in Europe."),
  address: z.string().trim().min(1),
  items: z.array(orderItemSchema).min(1),
  subtotalEur: z.number().nonnegative(),
  discountEur: z.number().nonnegative().default(0),
  shippingEur: z.number().nonnegative(),
  totalEur: z.number().nonnegative()
});

function createOrderNumber() {
  return `BX-${Date.now().toString().slice(-8)}`;
}

function calculateSubtotal(items: z.infer<typeof orderItemSchema>[]) {
  return items.reduce((sum, item) => sum + item.priceEur * item.quantity, 0);
}

type ProductStockRow = {
  id: string;
  style_id: string | null;
  sku: string;
  slug: string;
  price_eur: number;
  stock: number;
  reserved_stock: number;
  is_active: boolean;
};

function aggregateOrderQuantities(items: z.infer<typeof orderItemSchema>[]) {
  return items.reduce<Record<string, number>>((result, item) => {
    result[item.id] = (result[item.id] ?? 0) + item.quantity;
    return result;
  }, {});
}
async function saveCustomerCheckoutProfile(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  customerId: string,
  order: z.infer<typeof createOrderSchema>
) {
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: customerId,
      email: order.email,
      full_name: order.customerName,
      phone: order.phone,
      last_login_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return profileError.message;
  }

  const { data: existingAddress, error: addressLoadError } = await supabase
    .from("addresses")
    .select("id")
    .eq("customer_id", customerId)
    .eq("is_default", true)
    .maybeSingle();

  if (addressLoadError) {
    return addressLoadError.message;
  }

  const addressRow = {
    customer_id: customerId,
    country_code: order.countryCode,
    recipient: order.customerName,
    phone: order.phone,
    line1: order.address,
    line2: "",
    city: "",
    province: "",
    postal_code: "",
    is_default: true
  };

  const addressResult = existingAddress
    ? await supabase.from("addresses").update(addressRow).eq("id", existingAddress.id)
    : await supabase.from("addresses").insert(addressRow);

  return addressResult.error?.message ?? null;
}


export async function GET() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ADMIN_ORDER_WITH_ITEMS_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, message: "Could not load orders.", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: "supabase", orders: (data as OrderRow[]).map(toLocalOrder) });
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, { key: "orders:create", limit: 20, windowMs: 15 * 60 * 1000 });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.resetAt);
  }

  const payload = createOrderSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Order information is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  const order = payload.data;
  const subtotal = calculateSubtotal(order.items);
  const expectedShipping = 0;
  const expectedTotal = subtotal - order.discountEur + expectedShipping;

  if (
    Math.abs(subtotal - order.subtotalEur) > 0.01 ||
    Math.abs(expectedShipping - order.shippingEur) > 0.01 ||
    Math.abs(expectedTotal - order.totalEur) > 0.01
  ) {
    return NextResponse.json({ ok: false, message: "Order total does not match the cart." }, { status: 400 });
  }

  const orderNumber = createOrderNumber();
  const createdAt = new Date().toISOString();
  const localOrder = {
    id: orderNumber,
    createdAt,
    status: "pending_confirm" as const,
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    address: order.address,
    items: order.items,
    subtotalEur: order.subtotalEur,
    discountEur: order.discountEur,
    shippingEur: order.shippingEur,
    totalEur: order.totalEur
  };

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const attribution = trackOrderEventFields(request);
  const supabase = createSupabaseServiceRoleClient();
  const quantitiesBySku = aggregateOrderQuantities(order.items);
  const requestedSkus = Object.keys(quantitiesBySku);
  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, style_id, sku, slug, price_eur, stock, reserved_stock, is_active")
    .in("sku", requestedSkus);

  if (productsError) {
    return NextResponse.json(
      { ok: false, message: "Could not verify product stock.", detail: productsError.message },
      { status: 500 }
    );
  }

  const productsBySku = new Map((productRows as ProductStockRow[] | null ?? []).map((product) => [product.sku, product]));
  const missingSku = requestedSkus.find((sku) => !productsBySku.has(sku));
  if (missingSku) {
    return NextResponse.json({ ok: false, message: `Product ${missingSku} is no longer available.` }, { status: 409 });
  }

  const unavailableProduct = requestedSkus
    .map((sku) => productsBySku.get(sku)!)
    .find((product) => !product.is_active);
  if (unavailableProduct) {
    return NextResponse.json(
      { ok: false, message: `Product ${unavailableProduct.sku} is currently unavailable.` },
      { status: 409 }
    );
  }

  const insufficientProduct = requestedSkus
    .map((sku) => productsBySku.get(sku)!)
    .find((product) => product.stock - product.reserved_stock < quantitiesBySku[product.sku]);
  if (insufficientProduct) {
    return NextResponse.json(
      {
        ok: false,
        message: `Product ${insufficientProduct.sku} does not have enough available stock.`,
        availableStock: Math.max(0, insufficientProduct.stock - insufficientProduct.reserved_stock)
      },
      { status: 409 }
    );
  }

  let customerId: string | null = null;

  if (hasSupabasePublicConfig()) {
    const authSupabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await authSupabase.auth.getUser();
    customerId = user?.id ?? null;
  }

  const { data: createdOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_id: customerId,
      customer_email: order.email,
      customer_name: order.customerName,
      customer_phone: order.phone,
      status: "pending_confirm",
      payment_status: "not_started",
      subtotal_eur: order.subtotalEur,
      discount_eur: order.discountEur,
      shipping_eur: order.shippingEur,
      total_eur: order.totalEur,
      recipient: order.customerName,
      phone: order.phone,
      address_snapshot: {
        address: order.address,
        countryCode: order.countryCode,
        recipient: order.customerName,
        phone: order.phone,
        email: order.email
      },
      source: attribution.source,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      referrer: attribution.referrer
    })
    .select("id, order_number, created_at")
    .single();

  if (orderError || !createdOrder) {
    return NextResponse.json(
      { ok: false, message: "Could not save order.", detail: orderError?.message },
      { status: 500 }
    );
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    order.items.map((item) => {
      const product = productsBySku.get(item.id)!;
      return {
        order_id: createdOrder.id,
        product_id: product.id,
        style_id: product.style_id,
        sku: item.id,
        slug: product.slug || item.slug,
        name_snapshot: item.name,
        color_snapshot: item.color,
        image_snapshot: item.image,
        quantity: item.quantity,
        unit_price_eur: item.priceEur,
        line_total_eur: item.priceEur * item.quantity
      };
    })
  );

  if (itemsError) {
    await supabase.from("orders").delete().eq("id", createdOrder.id);
    return NextResponse.json(
      { ok: false, message: "Order was created but items could not be saved.", detail: itemsError.message },
      { status: 500 }
    );
  }

  const reservedProducts: Array<{ productId: string; quantity: number }> = [];
  for (const sku of requestedSkus) {
    const product = productsBySku.get(sku)!;
    const quantity = quantitiesBySku[sku];
    const nextReservedStock = product.reserved_stock + quantity;
    const { data: reservedRows, error: reserveError } = await supabase
      .from("products")
      .update({ reserved_stock: nextReservedStock })
      .eq("id", product.id)
      .eq("reserved_stock", product.reserved_stock)
      .select("id");

    if (reserveError || !reservedRows || reservedRows.length === 0) {
      for (const reservedProduct of reservedProducts) {
        const rollbackProduct = [...productsBySku.values()].find((item) => item.id === reservedProduct.productId);
        if (rollbackProduct) {
          await supabase
            .from("products")
            .update({ reserved_stock: rollbackProduct.reserved_stock })
            .eq("id", reservedProduct.productId);
        }
      }
      await supabase.from("order_items").delete().eq("order_id", createdOrder.id);
      await supabase.from("orders").delete().eq("id", createdOrder.id);
      return NextResponse.json(
        { ok: false, message: "Could not reserve product stock.", detail: reserveError?.message },
        { status: 500 }
      );
    }

    reservedProducts.push({ productId: product.id, quantity });
    await supabase.from("inventory_movements").insert({
      product_id: product.id,
      movement_type: "order_reserved",
      quantity_delta: -quantity,
      stock_after: product.stock - nextReservedStock,
      reason: `Order ${createdOrder.order_number} submitted and reserved`,
      order_id: createdOrder.id
    });
  }

  const profileSaveWarning = customerId
    ? await saveCustomerCheckoutProfile(supabase, customerId, order)
    : null;

  const emailPreview = buildOrderEmailPreview("order_submitted", {
    orderNumber: createdOrder.order_number,
    customerName: order.customerName,
    customerEmail: order.email,
    totalEur: order.totalEur
  });
  const emailQueue = await queueOrderEmailPreview(supabase, createdOrder.id, createdOrder.order_number, emailPreview);
  let checkoutUrl: string | null = null;

  if (hasStripeCheckoutConfig()) {
    const stripe = getStripeClient();
    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: order.email,
      client_reference_id: createdOrder.order_number,
      line_items: order.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(item.priceEur * 100),
          product_data: {
            name: item.name,
            description: item.color || undefined,
            images: item.image.startsWith("http") ? [item.image] : undefined,
            metadata: {
              sku: item.id,
              slug: item.slug
            }
          }
        }
      })),
      metadata: {
        orderId: createdOrder.id,
        orderNumber: createdOrder.order_number
      },
      success_url: `${siteUrl}/checkout/success?order=${encodeURIComponent(createdOrder.order_number)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel?order=${encodeURIComponent(createdOrder.order_number)}`,
      integration_identifier: "boxsofa_checkout_qhwerlmp"
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);

    checkoutUrl = session.url;
    await supabase
      .from("orders")
      .update({
        payment_status: "pending",
        payment_provider: "stripe",
        payment_reference: session.id,
        payment_method_note: "Stripe Checkout pending"
      })
      .eq("id", createdOrder.id);

    await supabase.from("payments").insert({
      order_id: createdOrder.id,
      provider: "stripe",
      provider_payment_id: session.id,
      status: "pending",
      amount_eur: order.totalEur,
      currency: "EUR",
      raw_payload: {
        checkout_session_id: session.id
      }
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    paymentEnabled: Boolean(checkoutUrl),
    checkoutUrl,
    profileSaved: Boolean(customerId && !profileSaveWarning),
    profileSaveWarning,
    emailPreview,
    emailQueued: emailQueue.queued,
    emailQueueWarning: emailQueue.warning,
    order: {
      ...localOrder,
      id: createdOrder.order_number,
      createdAt: createdOrder.created_at ?? createdAt
    }
  });
}
