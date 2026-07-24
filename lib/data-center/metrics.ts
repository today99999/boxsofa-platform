export type CommerceMetricInput = {
  orders: Array<{ id: string; paymentStatus: string; totalEur: number }>;
  refunds: Array<{ orderId: string; amountEur: number; completed: boolean }>;
  uniqueVisitors: number;
};

export type CommerceMetricCentsInput = {
  paidGmvCents: number;
  succeededRefundCents: number;
  paidOrders: number;
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

const GOOGLE_SEARCH_DOMAINS = new Set([
  "google.com",
  "google.co.uk",
  "google.de",
  "google.fr",
  "google.es",
  "google.it",
  "google.nl",
  "google.be",
  "google.at",
  "google.ch",
  "google.se",
  "google.no",
  "google.dk",
  "google.fi",
  "google.ie",
  "google.pt",
  "google.pl",
  "google.cz",
  "google.hu",
  "google.ro",
  "google.gr",
  "google.bg",
  "google.hr",
  "google.si",
  "google.sk",
  "google.lt",
  "google.lv",
  "google.ee",
  "google.com.au",
  "google.co.nz",
  "google.ca",
  "google.com.br",
  "google.com.mx",
  "google.com.ar",
  "google.co.jp",
  "google.co.in",
  "google.co.za",
  "google.com.tr",
  "google.ae"
]);

export function calculateCommerceMetrics(input: CommerceMetricInput): CommerceMetrics {
  const paidOrders = input.orders.filter((order) => PAID_PAYMENT_STATUSES.has(normalizeStatus(order.paymentStatus)));
  const paidGmvCents = paidOrders.reduce((sum, order) => sum + eurToCents(order.totalEur), 0);
  const succeededRefundCents = input.refunds
    .filter((refund) => refund.completed)
    .reduce((sum, refund) => sum + eurToCents(refund.amountEur), 0);

  return calculateCommerceMetricsFromCents({
    paidGmvCents,
    succeededRefundCents,
    paidOrders: paidOrders.length,
    uniqueVisitors: input.uniqueVisitors
  });
}

export function calculateCommerceMetricsFromCents(input: CommerceMetricCentsInput): CommerceMetrics {
  const paidGmvCents = Math.max(0, Math.trunc(input.paidGmvCents));
  const succeededRefundCents = Math.max(0, Math.trunc(input.succeededRefundCents));
  const paidOrders = Math.max(0, Math.trunc(input.paidOrders));
  const uniqueVisitors = Math.max(0, Math.trunc(input.uniqueVisitors));
  return {
    gmvEur: centsToEur(paidGmvCents),
    netSalesEur: centsToEur(paidGmvCents - succeededRefundCents),
    paidOrders,
    averageOrderValueEur: paidOrders > 0 ? centsToEur(Math.round(paidGmvCents / paidOrders)) : 0,
    conversionRate: uniqueVisitors > 0 ? paidOrders / uniqueVisitors : null
  };
}

function eurToCents(value: number): number {
  return Math.round(value * 100);
}

function centsToEur(value: number): number {
  return value / 100;
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
  return Array.from(GOOGLE_SEARCH_DOMAINS).some((domain) => matchesReferrerHost(host, domain));
}

function hasReferrer(referrer: string | null | undefined): boolean {
  return Boolean(referrer?.trim());
}
