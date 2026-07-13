export const ADMIN_ORDER_WITH_ITEMS_SELECT =
  "order_number, created_at, status, paid_at, payment_method_note, internal_note, customer_name, customer_phone, customer_email, address_snapshot, subtotal_eur, discount_eur, shipping_eur, total_eur, order_items(sku, slug, name_snapshot, color_snapshot, unit_price_eur, image_snapshot, quantity), shipments(carrier, tracking_number, shipped_at)";

export const CUSTOMER_ORDER_WITH_ITEMS_SELECT =
  "order_number, created_at, status, paid_at, payment_method_note, customer_name, customer_phone, customer_email, address_snapshot, subtotal_eur, discount_eur, shipping_eur, total_eur, order_items(sku, slug, name_snapshot, color_snapshot, unit_price_eur, image_snapshot, quantity), shipments(carrier, tracking_number, shipped_at)";

export type OrderRow = {
  order_number: string;
  created_at: string;
  status: "pending_confirm" | "paid_confirmed" | "processing" | "shipped" | "completed" | "cancelled" | "refunded";
  paid_at?: string | null;
  payment_method_note?: string | null;
  internal_note?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  address_snapshot?: { address?: string } | null;
  subtotal_eur: number;
  discount_eur: number;
  shipping_eur: number;
  total_eur: number;
  order_items?: Array<{
    sku: string;
    slug?: string | null;
    name_snapshot: string;
    color_snapshot?: string | null;
    unit_price_eur: number;
    image_snapshot?: string | null;
    quantity: number;
  }>;
  shipments?: Array<{
    carrier?: string | null;
    tracking_number?: string | null;
    shipped_at?: string | null;
  }>;
};

export function toLocalOrder(row: OrderRow) {
  const shipment = row.shipments?.[0];
  return {
    id: row.order_number,
    createdAt: row.created_at,
    status: row.status === "shipped" ? "shipped" : row.status === "cancelled" ? "cancelled" : row.status === "pending_confirm" ? "pending_confirm" : "paid_confirmed",
    paidConfirmedAt: row.paid_at ?? undefined,
    trackingNumber: shipment?.tracking_number ?? undefined,
    carrier: shipment?.carrier ?? undefined,
    shippedAt: shipment?.shipped_at ?? undefined,
    paymentMethodNote: row.payment_method_note ?? undefined,
    internalNote: row.internal_note ?? undefined,
    customerName: row.customer_name,
    phone: row.customer_phone,
    email: row.customer_email,
    address: row.address_snapshot?.address ?? "",
    items:
      row.order_items?.map((item) => ({
        id: item.sku,
        slug: item.slug ?? item.sku,
        name: item.name_snapshot,
        color: item.color_snapshot ?? "",
        priceEur: item.unit_price_eur,
        image: item.image_snapshot ?? "",
        quantity: item.quantity
      })) ?? [],
    subtotalEur: row.subtotal_eur,
    discountEur: row.discount_eur,
    shippingEur: row.shipping_eur,
    totalEur: row.total_eur
  };
}
