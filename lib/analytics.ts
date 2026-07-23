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

export type StoredAttribution = {
  source: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
  occurredAt: string;
};

type QueuedAnalyticsEvent = AnalyticsEvent & {
  eventKey: string;
  sessionId: string;
};

export const ANALYTICS_CONSENT_KEY = "boxsofa_cookie_consent_v1";
export const ANALYTICS_EVENTS_KEY = "boxsofa_analytics_events_v1";
export const ANALYTICS_QUEUE_KEY = "boxsofa_analytics_queue_v1";
export const ANALYTICS_VISITOR_KEY = "boxsofa_visitor_id_v1";
export const ANALYTICS_SESSION_KEY = "boxsofa_analytics_session_v1";
export const ANALYTICS_ATTRIBUTION_KEY = "boxsofa_analytics_attribution_v1";
export const ANALYTICS_CONSENT_SYNC_KEY = "boxsofa_cookie_consent_server_sync_v1";
export const ANALYTICS_SERVER_READY_KEY = "boxsofa_analytics_server_ready_v1";
export const OPEN_COOKIE_SETTINGS_EVENT = "boxsofa-open-cookie-settings";

const MAX_QUEUE_SIZE = 200;
const MAX_HISTORY_SIZE = 1000;
const consentSyncFlights = new Map<string, Promise<ConsentSynchronizationResult>>();

export type AnalyticsConsentServerStatus = {
  consent: AnalyticsConsent | null;
  version: string | null;
};

export type ConsentSynchronizationResult = "matched" | "resubmitted" | "unavailable";

export function inferTrafficSource(url: URL, referrer = "") {
  const utmSource = url.searchParams.get("utm_source");
  if (utmSource) return utmSource.trim().toLowerCase();

  const text = referrer.toLowerCase();
  if (!text) return "direct";
  if (text.includes("tiktok")) return "tiktok";
  if (text.includes("instagram")) return "instagram";
  if (text.includes("facebook") || text.includes("fb.")) return "facebook";
  if (text.includes("youtube") || text.includes("youtu.be")) return "youtube";
  if (text.includes("pinterest")) return "pinterest";
  if (text.includes("x.com") || text.includes("twitter")) return "x";
  if (text.includes("google")) return "google";
  return "referral";
}

export function inferDeviceType(width: number) {
  return width < 768 ? "mobile" : width < 1200 ? "tablet" : "desktop";
}

export function sanitizeReferrerDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function getOrCreateVisitorId() {
  const existing = localStorage.getItem(ANALYTICS_VISITOR_KEY);
  if (existing) return existing;
  const next = `v-${crypto.randomUUID()}`;
  localStorage.setItem(ANALYTICS_VISITOR_KEY, next);
  return next;
}

export function getStoredAttribution(): StoredAttribution | null {
  try {
    const stored = JSON.parse(localStorage.getItem(ANALYTICS_ATTRIBUTION_KEY) || "null") as StoredAttribution | null;
    return stored?.source ? stored : null;
  } catch {
    return null;
  }
}

export function clearStoredAttribution() {
  localStorage.removeItem(ANALYTICS_ATTRIBUTION_KEY);
}

export function clearAnalyticsClientState(storage?: Pick<Storage, "removeItem">) {
  const target = storage ?? localStorage;
  for (const key of [
    ANALYTICS_ATTRIBUTION_KEY,
    ANALYTICS_EVENTS_KEY,
    ANALYTICS_QUEUE_KEY,
    ANALYTICS_SESSION_KEY,
    ANALYTICS_VISITOR_KEY
  ]) {
    target.removeItem(key);
  }
  if (!storage) clearAnalyticsServerReady();
}

export function markAnalyticsServerReady(storage: Pick<Storage, "setItem"> = sessionStorage) {
  storage.setItem(ANALYTICS_SERVER_READY_KEY, "analytics");
}

export function clearAnalyticsServerReady(storage: Pick<Storage, "removeItem"> = sessionStorage) {
  storage.removeItem(ANALYTICS_SERVER_READY_KEY);
}

export function isAnalyticsServerReady(storage: Pick<Storage, "getItem"> = sessionStorage) {
  return storage.getItem(ANALYTICS_SERVER_READY_KEY) === "analytics";
}

export async function readAnalyticsConsentStatus(fetcher: typeof fetch = fetch): Promise<AnalyticsConsentServerStatus | null> {
  try {
    const response = await fetcher("/api/analytics/consent", {
      method: "GET",
      cache: "no-store",
      headers: { "cache-control": "no-store" }
    });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    if (!value || typeof value !== "object") return null;
    const status = value as Partial<AnalyticsConsentServerStatus>;
    const consent = status.consent === "necessary" || status.consent === "analytics" ? status.consent : null;
    const version = typeof status.version === "string" && status.version.length > 0 && status.version.length <= 40 ? status.version : null;
    return { consent, version };
  } catch {
    return null;
  }
}

export function synchronizeAnalyticsConsent(input: {
  visitorId: string;
  consent: AnalyticsConsent;
  version: string;
  getStatus: () => Promise<AnalyticsConsentServerStatus | null>;
  persist: () => Promise<boolean>;
}): Promise<ConsentSynchronizationResult> {
  const key = `${input.visitorId}:${input.consent}:${input.version}`;
  const existing = consentSyncFlights.get(key);
  if (existing) return existing;

  const flight = (async (): Promise<ConsentSynchronizationResult> => {
    try {
      const status = await input.getStatus();
      if (!status) return "unavailable";
      if (status.consent === input.consent && status.version === input.version) return "matched";
      return await input.persist() ? "resubmitted" : "unavailable";
    } catch {
      return "unavailable";
    }
  })();
  consentSyncFlights.set(key, flight);
  void flight.finally(() => {
    if (consentSyncFlights.get(key) === flight) consentSyncFlights.delete(key);
  });
  return flight;
}

export function consentSyncMarker(consent: AnalyticsConsent, version: string) {
  return `${version}:${consent}`;
}

export function shouldSynchronizeConsent(
  storage: Pick<Storage, "getItem">,
  consent: AnalyticsConsent,
  version: string
) {
  return storage.getItem(ANALYTICS_CONSENT_SYNC_KEY) !== consentSyncMarker(consent, version);
}

export function markConsentSynchronized(
  storage: Pick<Storage, "setItem">,
  consent: AnalyticsConsent,
  version: string
) {
  storage.setItem(ANALYTICS_CONSENT_SYNC_KEY, consentSyncMarker(consent, version));
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

export function trackEvent(type: AnalyticsEventType, fields: Partial<AnalyticsEvent> = {}) {
  if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "analytics") return;
  if (!isAnalyticsServerReady()) return;

  const url = new URL(window.location.href);
  const eventKey = `evt-${crypto.randomUUID()}`;
  const event: AnalyticsEvent = {
    id: eventKey,
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
  const queuedEvent: QueuedAnalyticsEvent = {
    ...event,
    eventKey,
    sessionId: getSessionId()
  };

  writeEventHistory(event);
  writeQueue([queuedEvent, ...readQueue()].slice(0, MAX_QUEUE_SIZE));
  writeAttribution(event);
  window.dispatchEvent(new Event("boxsofa-analytics-updated"));
  void flushQueue();
}

function getSessionId() {
  const existing = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (existing) return existing;
  const next = `s-${crypto.randomUUID()}`;
  sessionStorage.setItem(ANALYTICS_SESSION_KEY, next);
  return next;
}

async function flushQueue() {
  for (const event of readQueue()) {
    try {
      await deliverEvent(event);
      removeFromQueue(event.eventKey);
    } catch {
      return;
    }
  }
}

async function deliverEvent(event: QueuedAnalyticsEvent) {
  const response = await fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventKey: event.eventKey,
      type: event.type,
      createdAt: event.createdAt,
      visitorId: event.visitorId,
      sessionId: event.sessionId,
      path: event.path,
      deviceType: inferDeviceType(window.innerWidth),
      productId: event.productId,
      productName: event.productName,
      valueEur: event.valueEur
    }),
    keepalive: true
  });

  if (!response.ok) {
    throw new Error(`Analytics delivery failed: ${response.status}`);
  }
}

function writeAttribution(event: AnalyticsEvent) {
  if (event.source === "direct") return;

  const attribution: StoredAttribution = {
    source: event.source,
    medium: event.medium,
    campaign: event.campaign,
    referrer: event.referrer,
    occurredAt: event.createdAt
  };
  localStorage.setItem(ANALYTICS_ATTRIBUTION_KEY, JSON.stringify(attribution));
}

function readQueue(): QueuedAnalyticsEvent[] {
  return readStorageArray<QueuedAnalyticsEvent>(ANALYTICS_QUEUE_KEY);
}

function removeFromQueue(eventKey: string) {
  writeQueue(readQueue().filter((event) => event.eventKey !== eventKey));
}

function writeQueue(events: QueuedAnalyticsEvent[]) {
  localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(events));
}

function writeEventHistory(event: AnalyticsEvent) {
  const events = readStorageArray<AnalyticsEvent>(ANALYTICS_EVENTS_KEY);
  localStorage.setItem(ANALYTICS_EVENTS_KEY, JSON.stringify([event, ...events].slice(0, MAX_HISTORY_SIZE)));
}

function readStorageArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}
