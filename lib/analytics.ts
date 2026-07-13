export type AnalyticsConsent = "necessary" | "analytics";

export type AnalyticsEventType = "page_view" | "product_view" | "add_to_cart" | "begin_checkout" | "order_submit";

export type AnalyticsEvent = {
  id: string;
  type: AnalyticsEventType;
  createdAt: string;
  path: string;
  source: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
  visitorId: string;
  productId?: string;
  productSlug?: string;
  productName?: string;
  valueEur?: number;
};

export const ANALYTICS_CONSENT_KEY = "boxsofa_cookie_consent_v1";
export const ANALYTICS_EVENTS_KEY = "boxsofa_analytics_events_v1";
export const ANALYTICS_VISITOR_KEY = "boxsofa_visitor_id_v1";

export function inferTrafficSource(url: URL, referrer = "") {
  const utmSource = url.searchParams.get("utm_source");
  if (utmSource) return utmSource.toLowerCase();

  const text = referrer.toLowerCase();
  if (!text) return "direct";
  if (text.includes("tiktok")) return "tiktok";
  if (text.includes("instagram")) return "instagram";
  if (text.includes("facebook") || text.includes("fb.")) return "facebook";
  if (text.includes("youtube") || text.includes("youtu.be")) return "youtube";
  if (text.includes("x.com") || text.includes("twitter")) return "x";
  if (text.includes("google")) return "google";
  return "referral";
}

export function getOrCreateVisitorId() {
  const existing = localStorage.getItem(ANALYTICS_VISITOR_KEY);
  if (existing) return existing;
  const next = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(ANALYTICS_VISITOR_KEY, next);
  return next;
}

export function trackEvent(type: AnalyticsEventType, fields: Partial<AnalyticsEvent> = {}) {
  if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "analytics") return;
  const url = new URL(window.location.href);
  const event: AnalyticsEvent = {
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    createdAt: new Date().toISOString(),
    path: url.pathname,
    source: inferTrafficSource(url, document.referrer),
    medium: url.searchParams.get("utm_medium") ?? undefined,
    campaign: url.searchParams.get("utm_campaign") ?? undefined,
    referrer: document.referrer || undefined,
    visitorId: getOrCreateVisitorId(),
    ...fields
  };
  const events = JSON.parse(localStorage.getItem(ANALYTICS_EVENTS_KEY) || "[]") as AnalyticsEvent[];
  localStorage.setItem(ANALYTICS_EVENTS_KEY, JSON.stringify([event, ...events].slice(0, 1000)));
  window.dispatchEvent(new Event("boxsofa-analytics-updated"));
}
