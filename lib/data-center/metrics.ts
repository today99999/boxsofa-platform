export type CommerceMetricInput = {
  orders: Array<{ id: string; paymentStatus: string; totalEur: number }>;
  refunds: Array<{ orderId: string; amountEur: number; completed: boolean }>;
  uniqueVisitors: number;
};

export type CommerceMetrics = {
  gmvEur: number;
  netSalesEur: number;
  paidOrders: number;
  averageOrderValueEur: number;
  conversionRate: number | null;
};

export type AttributionMethod = "utm" | "referrer" | "last_non_direct" | "inferred";

export type Attribution = {
  source: string;
  method: AttributionMethod;
};

export type AttributionInput = {
  utmSource?: string | null;
  referrer?: string | null;
  priorLastNonDirect?: Attribution | Pick<Attribution, "source"> | null;
  lastNonDirect?: Attribution | Pick<Attribution, "source"> | null;
};

const PAID_PAYMENT_STATUSES = new Set(["paid", "refunded"]);

const SOURCE_ALIASES = new Map([
  ["tik-tok", "tiktok"],
  ["tiktok", "tiktok"],
  ["ig", "instagram"],
  ["instagram", "instagram"],
  ["fb", "facebook"],
  ["facebook", "facebook"],
  ["yt", "youtube"],
  ["youtube", "youtube"],
  ["pin", "pinterest"],
  ["pinterest", "pinterest"],
  ["google", "google"]
]);

const REFERRER_SOURCES: Array<{ source: string; hosts: string[] }> = [
  { source: "tiktok", hosts: ["tiktok.com"] },
  { source: "instagram", hosts: ["instagram.com"] },
  { source: "facebook", hosts: ["facebook.com", "fb.com"] },
  { source: "youtube", hosts: ["youtube.com", "youtu.be"] },
  { source: "pinterest", hosts: ["pinterest.com"] }
];

export function calculateCommerceMetrics(input: CommerceMetricInput): CommerceMetrics {
  const paidOrders = input.orders.filter((order) => PAID_PAYMENT_STATUSES.has(normalizeStatus(order.paymentStatus)));
  const gmvEur = paidOrders.reduce((sum, order) => sum + order.totalEur, 0);
  const refundedEur = input.refunds
    .filter((refund) => refund.completed)
    .reduce((sum, refund) => sum + refund.amountEur, 0);

  return {
    gmvEur,
    netSalesEur: gmvEur - refundedEur,
    paidOrders: paidOrders.length,
    averageOrderValueEur: paidOrders.length > 0 ? gmvEur / paidOrders.length : 0,
    conversionRate: input.uniqueVisitors > 0 ? paidOrders.length / input.uniqueVisitors : null
  };
}

export function resolveAttribution(input: AttributionInput): Attribution {
  const utmSource = normalizeSource(input.utmSource);
  if (utmSource) {
    return { source: utmSource, method: "utm" };
  }

  const referrerSource = resolveReferrerSource(input.referrer);
  if (referrerSource) {
    return { source: referrerSource, method: "referrer" };
  }

  if (!hasReferrer(input.referrer)) {
    const priorSource = normalizeSource(input.priorLastNonDirect?.source ?? input.lastNonDirect?.source);
    if (priorSource && priorSource !== "direct") {
      return { source: priorSource, method: "last_non_direct" };
    }
    return { source: "direct", method: "inferred" };
  }

  return { source: "referral", method: "inferred" };
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function normalizeSource(source: string | null | undefined): string | null {
  const normalized = source?.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  if (!normalized) {
    return null;
  }

  return SOURCE_ALIASES.get(normalized) ?? normalized;
}

function resolveReferrerSource(referrer: string | null | undefined): string | null {
  const host = getReferrerHost(referrer);
  if (!host) {
    return null;
  }

  if (isGoogleSearchHost(host)) {
    return "google";
  }

  for (const { source, hosts } of REFERRER_SOURCES) {
    if (hosts.some((candidate) => matchesReferrerHost(host, candidate))) {
      return source;
    }
  }

  return null;
}

function getReferrerHost(referrer: string | null | undefined): string | null {
  if (!referrer?.trim()) {
    return null;
  }

  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesReferrerHost(host: string, candidate: string): boolean {
  if (candidate.endsWith(".")) {
    return host.startsWith(candidate) || host.includes(`.${candidate}`);
  }

  return host === candidate || host.endsWith(`.${candidate}`);
}

function isGoogleSearchHost(host: string): boolean {
  const labels = host.split(".");
  if (labels[0] === "www") {
    labels.shift();
  }

  if (labels[0] !== "google") {
    return false;
  }

  const suffix = labels.slice(1);
  if (suffix.length === 1) {
    return suffix[0] === "com" || isCountryCodeTld(suffix[0]);
  }

  return suffix.length === 2 && ["co", "com"].includes(suffix[0]) && isCountryCodeTld(suffix[1]);
}

function isCountryCodeTld(label: string | undefined): boolean {
  return Boolean(label && /^[a-z]{2}$/.test(label));
}

function hasReferrer(referrer: string | null | undefined): boolean {
  return Boolean(referrer?.trim());
}
