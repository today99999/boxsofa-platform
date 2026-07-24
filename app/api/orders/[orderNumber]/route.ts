import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { buildOrderEmailPreview, type OrderEmailEvent } from "@/lib/email-notifications";
import { queueOrderEmailPreview } from "@/lib/server/email-notification-queue";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const updateOrderSchema = z.object({
  status: z.enum(["pending_confirm", "paid_confirmed", "shipped", "cancelled"]).optional(),
  carrier: z.string().trim().optional(),
  trackingNumber: z.string().trim().optional(),
  paymentMethodNote: z.string().trim().max(1000).optional(),
  internalNote: z.string().trim().max(2000).optional()
});

type RouteContext = {
  params: {
    orderNumber: string;
  };
};

type OrderInventoryItem = {
  product_id: string | null;
  quantity: number;
};

type ProductInventoryRow = {
  id: string;
  stock: number;
  reserved_stock: number;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const payload = updateOrderSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Order update information is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const orderNumber = decodeURIComponent(params.orderNumber);
  const patch = payload.data;

  const isPaymentConfirmation = patch.status === "paid_confirmed" || patch.status === "shipped";
  const isCancellation = patch.status === "cancelled";

  if (patch.status === "shipped" && (!patch.carrier || !patch.trackingNumber)) {
    return NextResponse.json(
      { ok: false, message: "Carrier and tracking number are required before marking an order as shipped." },
      { status: 400 }
    );
  }

  const { data: order, error: orderLoadError } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status, paid_at, total_eur, customer_name, customer_email, payment_method_note, internal_note")
    .eq("order_number", orderNumber)
    .single();

  if (orderLoadError || !order) {
    return NextResponse.json(
      { ok: false, message: "Order not found.", detail: orderLoadError?.message },
      { status: 404 }
    );
  }

  if (isCancellation && order.status !== "pending_confirm" && order.status !== "cancelled") {
    return NextResponse.json(
      { ok: false, message: "Only pending unpaid orders can be cancelled here. Paid orders need a refund workflow." },
      { status: 409 }
    );
  }

  if (isCancellation && (order.payment_status === "confirmed_offline" || order.payment_status === "paid")) {
    return NextResponse.json(
      { ok: false, message: "This order has already been paid. Please use a refund workflow instead of cancellation." },
      { status: 409 }
    );
  }

  const shouldConfirmOfflinePayment =
    isPaymentConfirmation && order.payment_status !== "confirmed_offline" && order.payment_status !== "paid";
  const shouldReleaseReservedInventory = isCancellation && order.status === "pending_confirm";
  let offlinePayment: {
    ok?: boolean;
    error_code?: string | null;
    payment_confirmed?: boolean;
    email_queued?: boolean;
    member_welcome?: boolean;
  } | null = null;

  if (shouldConfirmOfflinePayment) {
    const { data: offlinePaymentRows, error: offlinePaymentError } = await supabase.rpc(
      "record_offline_order_payment",
      {
        p_order_id: order.id,
        p_order_number: orderNumber,
        p_confirmed_by: adminAccess.userId,
        p_payment_method_note: patch.paymentMethodNote ?? order.payment_method_note ?? null,
        p_target_status: patch.status,
        p_carrier: patch.carrier ?? null,
        p_tracking_number: patch.trackingNumber ?? null
      }
    );
    offlinePayment = Array.isArray(offlinePaymentRows) ? offlinePaymentRows[0] ?? null : null;

    if (offlinePaymentError || !offlinePayment) {
      return NextResponse.json(
        { ok: false, message: "Could not confirm the offline payment." },
        { status: 500 }
      );
    }
    if (offlinePayment.ok !== true) {
      const status = offlinePayment.error_code === "order_not_found" ? 404
        : offlinePayment.error_code === "offline_payment_state_incomplete" ? 500
          : 409;
      return NextResponse.json(
        { ok: false, message: "The order cannot be confirmed as paid in its current state." },
        { status }
      );
    }
  }

  const orderUpdate: Record<string, string> = {};
  if (patch.status && !shouldConfirmOfflinePayment) orderUpdate.status = patch.status;
  if (patch.paymentMethodNote !== undefined && !shouldConfirmOfflinePayment) {
    orderUpdate.payment_method_note = patch.paymentMethodNote;
  }
  if (patch.internalNote !== undefined) orderUpdate.internal_note = patch.internalNote;

  const emailEvent: OrderEmailEvent | null =
    patch.status === "cancelled" && order.status !== "cancelled"
      ? "order_cancelled"
      : patch.status === "shipped" && order.status !== "shipped" && !shouldConfirmOfflinePayment
        ? "order_shipped"
        : null;

  const releasedProducts: ProductInventoryRow[] = [];
  if (shouldReleaseReservedInventory) {
    const { data: orderItems, error: itemsLoadError } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", order.id);

    if (itemsLoadError) {
      return NextResponse.json(
        { ok: false, message: "Could not load order inventory items.", detail: itemsLoadError.message },
        { status: 500 }
      );
    }

    const quantitiesByProduct = (orderItems as OrderInventoryItem[] | null ?? []).reduce<Record<string, number>>((result, item) => {
      if (!item.product_id) return result;
      result[item.product_id] = (result[item.product_id] ?? 0) + item.quantity;
      return result;
    }, {});

    const productIds = Object.keys(quantitiesByProduct);
    if (productIds.length > 0) {
      const { data: productRows, error: productsLoadError } = await supabase
        .from("products")
        .select("id, stock, reserved_stock")
        .in("id", productIds);

      if (productsLoadError) {
        return NextResponse.json(
          { ok: false, message: "Could not verify reserved stock.", detail: productsLoadError.message },
          { status: 500 }
        );
      }

      const productsById = new Map((productRows as ProductInventoryRow[] | null ?? []).map((product) => [product.id, product]));
      for (const productId of productIds) {
        const product = productsById.get(productId);
        const quantity = quantitiesByProduct[productId];
        if (!product || product.reserved_stock < quantity) {
          return NextResponse.json(
            { ok: false, message: "Reserved stock is no longer enough to release this order. Please review inventory manually." },
            { status: 409 }
          );
        }
      }

      for (const productId of productIds) {
        const product = productsById.get(productId)!;
        const quantity = quantitiesByProduct[productId];
        const nextReservedStock = product.reserved_stock - quantity;
        const { data: updatedRows, error: inventoryUpdateError } = await supabase
          .from("products")
          .update({ reserved_stock: nextReservedStock })
          .eq("id", product.id)
          .eq("reserved_stock", product.reserved_stock)
          .select("id");

        if (inventoryUpdateError || !updatedRows || updatedRows.length === 0) {
          for (const releasedProduct of releasedProducts) {
            await supabase
              .from("products")
              .update({ reserved_stock: releasedProduct.reserved_stock })
              .eq("id", releasedProduct.id);
          }
          return NextResponse.json(
            { ok: false, message: "Could not release reserved stock. Please try again.", detail: inventoryUpdateError?.message },
            { status: 500 }
          );
        }

        releasedProducts.push(product);
        const { error: movementInsertError } = await supabase.from("inventory_movements").insert({
          product_id: product.id,
          movement_type: "order_cancelled",
          quantity_delta: quantity,
          stock_after: product.stock - nextReservedStock,
          reason: `Order ${orderNumber} cancelled and reserved stock released`,
          order_id: order.id,
          created_by: adminAccess.userId
        });

        if (movementInsertError) {
          for (const releasedProduct of releasedProducts) {
            await supabase
              .from("products")
              .update({ reserved_stock: releasedProduct.reserved_stock })
              .eq("id", releasedProduct.id);
          }
          return NextResponse.json(
            { ok: false, message: "Could not record inventory movement.", detail: movementInsertError.message },
            { status: 500 }
          );
        }
      }
    }
  }

  if (Object.keys(orderUpdate).length > 0) {
    const { error: orderUpdateError } = await supabase.from("orders").update(orderUpdate).eq("id", order.id);
    if (orderUpdateError) {
      for (const releasedProduct of releasedProducts) {
        await supabase
          .from("products")
          .update({ reserved_stock: releasedProduct.reserved_stock })
          .eq("id", releasedProduct.id);
      }
      return NextResponse.json(
        { ok: false, message: "Could not update order.", detail: orderUpdateError.message },
        { status: 500 }
      );
    }
  }

  if (!shouldConfirmOfflinePayment && (patch.carrier || patch.trackingNumber || patch.status === "shipped")) {
    const shipment = {
      order_id: order.id,
      status: patch.status === "shipped" ? "shipped" : "booked",
      carrier: patch.carrier || null,
      tracking_number: patch.trackingNumber || null,
      shipped_at: patch.status === "shipped" ? now : null,
      created_by: adminAccess.userId
    };

    const { data: existingShipment } = await supabase
      .from("shipments")
      .select("id")
      .eq("order_id", order.id)
      .limit(1)
      .maybeSingle();

    const shipmentResult = existingShipment?.id
      ? await supabase.from("shipments").update(shipment).eq("id", existingShipment.id)
      : await supabase.from("shipments").insert(shipment);

    if (shipmentResult.error) {
      return NextResponse.json(
        { ok: false, message: "Could not save shipment.", detail: shipmentResult.error.message },
        { status: 500 }
      );
    }
  }

  await writeAdminAuditLog(supabase, {
    actorId: adminAccess.userId,
    action: "order_update",
    entityType: "order",
    entityId: order.id,
    beforeData: {
      orderNumber,
      status: order.status,
      paymentStatus: order.payment_status,
      paidAt: order.paid_at,
      paymentMethodNote: order.payment_method_note,
      internalNote: order.internal_note
    },
    afterData: {
      patch,
      orderUpdate,
      emailEvent,
      offlinePayment: offlinePayment
        ? {
            paymentConfirmed: offlinePayment.payment_confirmed === true,
            emailQueued: offlinePayment.email_queued === true,
            memberWelcome: offlinePayment.member_welcome === true
          }
        : null
    }
  });

  const emailPreview = emailEvent
    ? buildOrderEmailPreview(emailEvent, {
        orderNumber: orderNumber,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        totalEur: order.total_eur,
        carrier: patch.carrier ?? null,
        trackingNumber: patch.trackingNumber ?? null
      })
    : null;
  const emailQueue = await queueOrderEmailPreview(supabase, order.id, orderNumber, emailPreview);

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    emailPreview,
    emailQueued: offlinePayment?.email_queued === true || emailQueue.queued,
    emailQueueWarning: emailQueue.warning,
    memberWelcome: offlinePayment?.member_welcome === true
  });
}
