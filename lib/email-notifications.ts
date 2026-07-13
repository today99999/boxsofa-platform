export type OrderEmailEvent = "order_submitted" | "payment_confirmed" | "order_shipped" | "order_cancelled";

export type OrderEmailInput = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalEur?: number;
  carrier?: string | null;
  trackingNumber?: string | null;
};

export type OrderEmailPreview = {
  event: OrderEmailEvent;
  to: string;
  subject: string;
  previewText: string;
  bodyText: string;
  readyToSend: false;
  provider: "pending";
};

function greeting(name: string) {
  return name.trim() ? `Hi ${name.trim()},` : "Hi,";
}

function formatTotal(totalEur?: number) {
  return typeof totalEur === "number" ? `EUR ${totalEur.toFixed(2)}` : "the order total";
}

export function buildOrderEmailPreview(event: OrderEmailEvent, input: OrderEmailInput): OrderEmailPreview {
  const intro = greeting(input.customerName);
  const trackingLine = input.trackingNumber
    ? `Tracking: ${input.carrier ? `${input.carrier} ` : ""}${input.trackingNumber}`
    : "Tracking details will be added once the carrier updates them.";

  const templates: Record<OrderEmailEvent, Omit<OrderEmailPreview, "event" | "to" | "readyToSend" | "provider">> = {
    order_submitted: {
      subject: `BoxSofa order received: ${input.orderNumber}`,
      previewText: "We received your order. BoxSofa will contact you to confirm the payment method.",
      bodyText: [
        intro,
        "",
        `We received your BoxSofa order ${input.orderNumber}.`,
        `Order total: ${formatTotal(input.totalEur)}.`,
        "",
        "Current step: the merchant will contact you to confirm the payment method. Online card payment is not enabled yet.",
        "Estimated cross-border delivery after dispatch: 23-30 days.",
        "",
        "Thank you,",
        "BoxSofa"
      ].join("\n")
    },
    payment_confirmed: {
      subject: `Payment confirmed for BoxSofa order ${input.orderNumber}`,
      previewText: "Your payment has been confirmed. We are preparing your sofa for dispatch.",
      bodyText: [
        intro,
        "",
        `Payment has been confirmed for order ${input.orderNumber}.`,
        "We are preparing your sofa and will update you again once it has shipped.",
        "",
        "Estimated cross-border delivery after dispatch: 23-30 days.",
        "",
        "Thank you,",
        "BoxSofa"
      ].join("\n")
    },
    order_shipped: {
      subject: `BoxSofa order shipped: ${input.orderNumber}`,
      previewText: "Your sofa has shipped. Tracking details are included when available.",
      bodyText: [
        intro,
        "",
        `Your BoxSofa order ${input.orderNumber} has shipped.`,
        trackingLine,
        "",
        "Estimated cross-border delivery: 23-30 days. Carrier tracking can take time to update after dispatch.",
        "",
        "Thank you,",
        "BoxSofa"
      ].join("\n")
    },
    order_cancelled: {
      subject: `BoxSofa order cancelled: ${input.orderNumber}`,
      previewText: "This order has been cancelled. No payment is required for this order.",
      bodyText: [
        intro,
        "",
        `Your BoxSofa order ${input.orderNumber} has been cancelled.`,
        "Reserved stock has been released and no payment is required for this order.",
        "",
        "If this was unexpected, please contact BoxSofa support.",
        "",
        "Thank you,",
        "BoxSofa"
      ].join("\n")
    }
  };

  return {
    event,
    to: input.customerEmail,
    ...templates[event],
    readyToSend: false,
    provider: "pending"
  };
}
