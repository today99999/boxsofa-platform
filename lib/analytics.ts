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

export type QueuedAnalyticsEvent = AnalyticsEvent & {
  eventKey: string;
  sessionId: string;
  deliveryAttempts?: number;
  nextAttemptAt?: number;
};

export const ANALYTICS_CONSENT_KEY = "boxsofa_cookie_consent_v1";
export const ANALYTICS_EVENTS_KEY = "boxsofa_analytics_events_v1";
export const ANALYTICS_QUEUE_KEY = "boxsofa_analytics_queue_v1";
export const ANALYTICS_VISITOR_KEY = "boxsofa_visitor_id_v1";
export const ANALYTICS_SESSION_KEY = "boxsofa_analytics_session_v1";
export const ANALYTICS_ATTRIBUTION_KEY = "boxsofa_analytics_attribution_v1";
export const ANALYTICS_CONSENT_SYNC_KEY = "boxsofa_cookie_consent_server_sync_v1";
export const ANALYTICS_SERVER_READY_KEY = "boxsofa_analytics_server_ready_v1";
export const ANALYTICS_SERVER_READY_EVENT = "boxsofa-analytics-server-ready";
export const ANALYTICS_BEGIN_CHECKOUT_KEY = "boxsofa_analytics_begin_checkout_v1";
export const OPEN_COOKIE_SETTINGS_EVENT = "boxsofa-open-cookie-settings";
export const ANALYTICS_CONSENT_REVALIDATE_EVENT = "boxsofa-analytics-revalidate-consent";

const MAX_QUEUE_SIZE = 200;
const MAX_HISTORY_SIZE = 1000;
const MAX_DELIVERY_ATTEMPTS = 6;
const MAX_DELIVERY_BACKOFF_MS = 60_000;
export const ANALYTICS_REQUEST_TIMEOUT_MS = 12_000;
type ConsentSynchronizationInput = {
  visitorId: string;
  consent: AnalyticsConsent;
  version: string;
  getStatus: () => Promise<AnalyticsConsentServerStatus | null>;
  persist: () => Promise<boolean>;
  isCurrent?: () => boolean;
};

// These flights intentionally carry only network results. Component lifecycle is
// per-caller state, so it must never be captured by a promise that other mounts
// join during Strict Mode or a fast remount.
const consentStatusFlights = new Map<string, Promise<AnalyticsConsentServerStatus | null>>();
const consentPersistFlights = new Map<string, Promise<boolean>>();
type ConsentPersistObservationState = {
  activeStatusObservers: number;
  successEpoch: number;
};

// This state exists only while status reads can observe a concurrent successful
// persist. It is not a cache: once the final observer and relevant flight settle,
// the key is discarded so later missing-cookie checks still read server state.
const consentPersistObservations = new Map<string, ConsentPersistObservationState>();
const consentMutationQueues = new Map<string, Promise<void>>();
let queueRetryTimer: ReturnType<typeof setTimeout> | null = null;
let consentRecoveryHandler: (() => Promise<AnalyticsConsentRecoveryOutcome>) | null = null;

export type AnalyticsConsentServerStatus = {
  consent: AnalyticsConsent | null;
  version: string | null;
};

export type AnalyticsReadinessReason = "initial" | "ready" | "temporary" | "withdrawn";

export type AnalyticsReadinessSnapshot = {
  ready: boolean;
  reason: AnalyticsReadinessReason;
};

export type ConsentSynchronizationResult = "matched" | "resubmitted" | "unavailable";

export type AnalyticsDeliveryDisposition = "success" | "drop" | "retry" | "revalidate";
export type AnalyticsConsentRecoveryResult = "recovered" | "stopped" | "exhausted";
export type AnalyticsConsentRecoveryOutcome = "confirmed" | "withdrawn" | "temporary";

type AnalyticsConsentRecoveryCoordinatorOptions = {
  forceConsentMutation: () => Promise<AnalyticsConsentRecoveryOutcome>;
  retryRetainedEvents: (event: Pick<QueuedAnalyticsEvent, "eventKey">) => void;
  applyOutcome: (outcome: AnalyticsConsentRecoveryOutcome) => void;
  maxAttempts?: number;
};

export class AnalyticsRequestTimeoutError extends Error {
  constructor() {
    super("Analytics request timed out");
    this.name = "AnalyticsRequestTimeoutError";
  }
}

type FetchWithTimeoutOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

// Abort the underlying request and race it against the timer. The race is deliberate:
// a mocked or buggy fetch implementation may ignore AbortSignal, but must never hold a
// consent mutation or analytics delivery queue forever.
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? ANALYTICS_REQUEST_TIMEOUT_MS;
  const externalSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let detachExternalAbort: (() => void) | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new AnalyticsRequestTimeoutError());
    }, timeoutMs);
  });

  const externallyAborted = externalSignal ? new Promise<never>((_, reject) => {
    const abortFromExternalSignal = () => {
      controller.abort();
      reject(externalSignal.reason ?? new Error("Analytics request was aborted"));
    };
    if (externalSignal.aborted) abortFromExternalSignal();
    else {
      externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
      detachExternalAbort = () => externalSignal.removeEventListener("abort", abortFromExternalSignal);
    }
  }) : null;

  try {
    const request = (options.fetcher ?? fetch)(input, { ...init, signal: controller.signal });
    return await Promise.race(externallyAborted ? [request, timeout, externallyAborted] : [request, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    detachExternalAbort?.();
  }
}

export function isAnalyticsConsent(value: unknown): value is AnalyticsConsent {
  return value === "necessary" || value === "analytics";
}

export function readStoredAnalyticsConsent(storage: Pick<Storage, "getItem" | "removeItem">): AnalyticsConsent | null {
  const stored = storage.getItem(ANALYTICS_CONSENT_KEY);
  if (isAnalyticsConsent(stored)) return stored;
  if (stored !== null) storage.removeItem(ANALYTICS_CONSENT_KEY);
  return null;
}

// Every mutation for one visitor shares a tail promise. Rejections are absorbed by
// the tail so a failed earlier request cannot prevent the latest choice from writing.
export function enqueueConsentMutation<T>(visitorId: string, mutation: () => Promise<T>): Promise<T> {
  const previous = consentMutationQueues.get(visitorId) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(mutation);
  const tail = operation.then(() => undefined, () => undefined);
  consentMutationQueues.set(visitorId, tail);
  void tail.finally(() => {
    if (consentMutationQueues.get(visitorId) === tail) consentMutationQueues.delete(visitorId);
  });
  return operation;
}

// A 403 can mean the server has lost or rejected consent while a stale browser
// cookie still says otherwise. Keep exactly one forced, server-backed mutation in
// flight and never create a replacement page-view while the retained event retries.
export function createAnalyticsConsentRecoveryCoordinator(options: AnalyticsConsentRecoveryCoordinatorOptions) {
  const maxAttempts = options.maxAttempts ?? 3;
  let attempts = 0;
  let flight: Promise<AnalyticsConsentRecoveryResult> | null = null;

  return {
    recover(event: Pick<QueuedAnalyticsEvent, "eventKey">): Promise<AnalyticsConsentRecoveryResult> {
      if (flight) return flight;
      if (attempts >= maxAttempts) {
        options.applyOutcome("temporary");
        return Promise.resolve("exhausted");
      }

      attempts += 1;
      flight = (async () => {
        try {
          const outcome = await options.forceConsentMutation();
          options.applyOutcome(outcome);
          if (outcome !== "confirmed") {
            return "stopped" as const;
          }
          options.retryRetainedEvents(event);
          return "recovered" as const;
        } catch {
          options.applyOutcome("temporary");
          return "stopped" as const;
        } finally {
          flight = null;
        }
      })();
      return flight;
    },
    reset() {
      attempts = 0;
    }
  };
}

const consentRecoveryCoordinator = createAnalyticsConsentRecoveryCoordinator({
  forceConsentMutation: async () => consentRecoveryHandler ? consentRecoveryHandler() : "temporary",
  retryRetainedEvents: () => { void flushAnalyticsQueue(); },
  applyOutcome: applyAnalyticsConsentRecoveryOutcome
});

let analyticsReadinessSnapshot: AnalyticsReadinessSnapshot = { ready: false, reason: "initial" };
const analyticsReadinessListeners = new Set<(snapshot: AnalyticsReadinessSnapshot) => void>();

export function registerAnalyticsConsentRecoveryHandler(handler: () => Promise<AnalyticsConsentRecoveryOutcome>) {
  consentRecoveryHandler = handler;
  return () => {
    if (consentRecoveryHandler === handler) consentRecoveryHandler = null;
  };
}

export function revalidateAnalyticsConsentAfterForbidden(event: Pick<QueuedAnalyticsEvent, "eventKey">) {
  return consentRecoveryCoordinator.recover(event);
}

export function resetAnalyticsConsentRecovery() {
  consentRecoveryCoordinator.reset();
}

// Recovery code reports what it learned; this is the only layer that changes
// readiness for a 403 recovery so a real withdrawal cannot be overwritten by a
// generic temporary failure afterwards.
export function applyAnalyticsConsentRecoveryOutcome(outcome: AnalyticsConsentRecoveryOutcome) {
  if (outcome === "confirmed") markAnalyticsServerReady();
  else clearAnalyticsServerReady(outcome);
}

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
    ANALYTICS_VISITOR_KEY,
    ANALYTICS_BEGIN_CHECKOUT_KEY
  ]) {
    target.removeItem(key);
  }
  if (!storage) clearAnalyticsServerReady("withdrawn");
}

export function markAnalyticsServerReady(storage: Pick<Storage, "setItem"> = sessionStorage) {
  storage.setItem(ANALYTICS_SERVER_READY_KEY, "analytics");
  setAnalyticsReadinessSnapshot({ ready: true, reason: "ready" });
}

export function clearAnalyticsServerReady(
  reasonOrStorage: Exclude<AnalyticsReadinessReason, "ready"> | Pick<Storage, "removeItem"> = "temporary",
  storage?: Pick<Storage, "removeItem">
) {
  const reason = typeof reasonOrStorage === "string" ? reasonOrStorage : "temporary";
  const target = typeof reasonOrStorage === "string" ? (storage ?? sessionStorage) : reasonOrStorage;
  target.removeItem(ANALYTICS_SERVER_READY_KEY);
  setAnalyticsReadinessSnapshot({ ready: false, reason });
}

export function isAnalyticsServerReady(storage: Pick<Storage, "getItem"> = sessionStorage) {
  return storage.getItem(ANALYTICS_SERVER_READY_KEY) === "analytics";
}

export function getAnalyticsReadinessSnapshot(): AnalyticsReadinessSnapshot {
  return analyticsReadinessSnapshot;
}

export function subscribeAnalyticsReadiness(listener: (snapshot: AnalyticsReadinessSnapshot) => void) {
  analyticsReadinessListeners.add(listener);
  listener(analyticsReadinessSnapshot);
  return () => {
    analyticsReadinessListeners.delete(listener);
  };
}

export async function readAnalyticsConsentStatus(
  fetcher: typeof fetch = fetch,
  timeoutMs = ANALYTICS_REQUEST_TIMEOUT_MS
): Promise<AnalyticsConsentServerStatus | null> {
  try {
    const response = await fetchWithTimeout("/api/analytics/consent", {
      method: "GET",
      cache: "no-store",
      headers: { "cache-control": "no-store" }
    }, { fetcher, timeoutMs });
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

function isConsentSynchronizationCurrent(input: ConsentSynchronizationInput) {
  return !input.isCurrent || input.isCurrent();
}

function consentSynchronizationKey(input: Pick<ConsentSynchronizationInput, "visitorId" | "consent" | "version">) {
  return `${input.visitorId}:${input.consent}:${input.version}`;
}

type ConsentStatusObservation = {
  key: string;
  state: ConsentPersistObservationState;
  capturedSuccessEpoch: number;
};

function beginConsentStatusObservation(key: string): ConsentStatusObservation {
  const state = consentPersistObservations.get(key) ?? {
    activeStatusObservers: 0,
    successEpoch: 0
  };
  consentPersistObservations.set(key, state);
  state.activeStatusObservers += 1;
  return { key, state, capturedSuccessEpoch: state.successEpoch };
}

function cleanupConsentPersistObservation(key: string, state: ConsentPersistObservationState) {
  if (
    consentPersistObservations.get(key) === state &&
    state.activeStatusObservers === 0 &&
    !consentPersistFlights.has(key)
  ) {
    consentPersistObservations.delete(key);
  }
}

function releaseConsentStatusObservation(observation: ConsentStatusObservation) {
  observation.state.activeStatusObservers = Math.max(0, observation.state.activeStatusObservers - 1);
  cleanupConsentPersistObservation(observation.key, observation.state);
}

function recordSuccessfulConsentPersist(key: string) {
  const state = consentPersistObservations.get(key);
  if (state?.activeStatusObservers) state.successEpoch += 1;
}

export function getConsentPersistObservationStateSizeForTest() {
  return consentPersistObservations.size;
}

function getConsentStatusFlight(input: ConsentSynchronizationInput) {
  const key = consentSynchronizationKey(input);
  const existing = consentStatusFlights.get(key);
  if (existing) return existing;

  const flight = Promise.resolve()
    .then(input.getStatus)
    .catch(() => null);
  consentStatusFlights.set(key, flight);
  void flight.finally(() => {
    if (consentStatusFlights.get(key) === flight) consentStatusFlights.delete(key);
  });
  return flight;
}

function getConsentPersistFlight(input: ConsentSynchronizationInput) {
  const key = consentSynchronizationKey(input);
  const existing = consentPersistFlights.get(key);
  if (existing) return existing;

  const flight = Promise.resolve()
    .then(input.persist)
    .then((persisted) => {
      const succeeded = persisted === true;
      if (succeeded) recordSuccessfulConsentPersist(key);
      return succeeded;
    })
    .catch(() => false);
  consentPersistFlights.set(key, flight);
  void flight.finally(() => {
    if (consentPersistFlights.get(key) === flight) {
      consentPersistFlights.delete(key);
      const state = consentPersistObservations.get(key);
      if (state) cleanupConsentPersistObservation(key, state);
    }
  });
  return flight;
}

export async function synchronizeAnalyticsConsent(input: ConsentSynchronizationInput): Promise<ConsentSynchronizationResult> {
  if (!isConsentSynchronizationCurrent(input)) return "unavailable";

  const key = consentSynchronizationKey(input);
  // A caller that arrives while a raw POST is active must join it before
  // initiating another status request. Its lifecycle guard remains local.
  const activePersist = consentPersistFlights.get(key);
  if (activePersist) {
    const persisted = await activePersist;
    if (!isConsentSynchronizationCurrent(input)) return "unavailable";
    return persisted ? "resubmitted" : "unavailable";
  }

  const observation = beginConsentStatusObservation(key);
  try {
    // Capturing this before the GET lets a stale status response observe a
    // concurrent success without turning the epoch into a permanent cache.
    const status = await getConsentStatusFlight(input);
    if (!isConsentSynchronizationCurrent(input)) return "unavailable";
    if (!status) return "unavailable";
    if (status.consent === input.consent && status.version === input.version) return "matched";

    // First join a POST that began while the GET was running. If it already
    // completed, this observation's epoch still identifies the overlapping
    // success. A later independent caller always starts a fresh observation.
    const overlappingPersist = consentPersistFlights.get(key);
    if (overlappingPersist) {
      const persisted = await overlappingPersist;
      if (!isConsentSynchronizationCurrent(input)) return "unavailable";
      return persisted ? "resubmitted" : "unavailable";
    }
    if (observation.state.successEpoch > observation.capturedSuccessEpoch) {
      return "resubmitted";
    }

    // A needed mutation is also a raw, shared result. Each caller checks its own
    // generation before joining and after awaiting it, so a stale starter cannot
    // turn a current subscriber into an unavailable result.
    const persisted = await getConsentPersistFlight(input);
    if (!isConsentSynchronizationCurrent(input)) return "unavailable";
    return persisted ? "resubmitted" : "unavailable";
  } finally {
    releaseConsentStatusObservation(observation);
  }
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

export function classifyAnalyticsDeliveryStatus(status: number | null): AnalyticsDeliveryDisposition {
  if (status !== null && status >= 200 && status < 300) return "success";
  if (status === 403) return "revalidate";
  if (status !== null && status >= 400 && status < 500 && status !== 429) return "drop";
  return "retry";
}

export function analyticsDeliveryBackoffMs(attempts: number) {
  return Math.min(MAX_DELIVERY_BACKOFF_MS, 1_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6));
}

export function applyAnalyticsDeliveryDisposition(
  queue: QueuedAnalyticsEvent[],
  eventKey: string,
  disposition: AnalyticsDeliveryDisposition,
  now = Date.now()
) {
  const current = queue.find((event) => event.eventKey === eventKey);
  if (!current || disposition === "success" || disposition === "drop") {
    return queue.filter((event) => event.eventKey !== eventKey);
  }

  const attempts = (current.deliveryAttempts ?? 0) + 1;
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return queue.filter((event) => event.eventKey !== eventKey);
  return queue.map((event) => event.eventKey === eventKey
    ? { ...event, deliveryAttempts: attempts, nextAttemptAt: now + analyticsDeliveryBackoffMs(attempts) }
    : event);
}

export type CheckoutFunnelItem = {
  id: string;
  slug: string;
  name: string;
  priceEur: number;
  quantity: number;
};

export function checkoutFunnelStateKey(items: readonly CheckoutFunnelItem[]) {
  return items
    .map((item) => `${item.id}:${item.quantity}`)
    .sort()
    .join("|");
}

export function trackBeginCheckoutOnce(
  items: readonly CheckoutFunnelItem[],
  options: {
    storage?: Pick<Storage, "getItem" | "setItem">;
    track?: (type: AnalyticsEventType, fields?: Partial<AnalyticsEvent>) => boolean;
  } = {}
) {
  if (items.length === 0) return false;
  const storage = options.storage ?? sessionStorage;
  const stateKey = checkoutFunnelStateKey(items);
  const seen = readCheckoutFunnelStates(storage);
  if (seen.includes(stateKey)) return false;

  const primary = items[0];
  const tracked = (options.track ?? trackEvent)("begin_checkout", {
    productId: primary.id,
    productSlug: primary.slug,
    productName: primary.name,
    valueEur: items.reduce((total, item) => total + item.priceEur * item.quantity, 0)
  });
  if (!tracked) return false;

  try {
    storage.setItem(ANALYTICS_BEGIN_CHECKOUT_KEY, JSON.stringify([...seen, stateKey].slice(-100)));
  } catch {
    // Delivery can still proceed when session storage is unavailable.
  }
  return true;
}

export function trackEvent(type: AnalyticsEventType, fields: Partial<AnalyticsEvent> = {}) {
  if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "analytics") return false;
  if (!isAnalyticsServerReady()) return false;

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
  void flushAnalyticsQueue();
  return true;
}

function getSessionId() {
  const existing = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (existing) return existing;
  const next = `s-${crypto.randomUUID()}`;
  sessionStorage.setItem(ANALYTICS_SESSION_KEY, next);
  return next;
}

export type AnalyticsQueueDrainCoordinator = {
  flush: () => Promise<void>;
};

export function createAnalyticsQueueDrainCoordinator(options: {
  isReady: () => boolean;
  hasSendableEvents: () => boolean;
  drainPass: () => Promise<"complete" | "blocked">;
  scheduleRetry: () => void;
}): AnalyticsQueueDrainCoordinator {
  let inFlight: Promise<void> | null = null;
  let pending = false;

  const flush = () => {
    pending = true;
    if (!inFlight) {
      inFlight = (async () => {
        if (!options.isReady()) return;
        while (pending && options.hasSendableEvents()) {
          pending = false;
          if (await options.drainPass() === "blocked") return;
        }
        options.scheduleRetry();
      })().finally(() => {
        inFlight = null;
        const shouldDrain = pending && options.isReady() && options.hasSendableEvents();
        pending = false;
        if (shouldDrain) void flush();
        else options.scheduleRetry();
      });
    }
    return inFlight;
  };

  return { flush };
}

const analyticsQueueDrain = createAnalyticsQueueDrainCoordinator({
  isReady: () => isAnalyticsServerReady(),
  hasSendableEvents: () => readQueue().some((event) => (event.nextAttemptAt ?? 0) <= Date.now()),
  drainPass: flushQueuePass,
  scheduleRetry: scheduleQueueRetry
});

export function flushAnalyticsQueue() {
  return analyticsQueueDrain.flush();
}

async function flushQueuePass(): Promise<"complete" | "blocked"> {
  for (const event of readQueue()) {
    if ((event.nextAttemptAt ?? 0) > Date.now()) continue;
    const disposition = await deliverEvent(event);
    const nextQueue = applyAnalyticsDeliveryDisposition(readQueue(), event.eventKey, disposition);
    writeQueue(nextQueue);
    if (disposition === "revalidate") {
      clearAnalyticsServerReady();
      if (nextQueue.some((queued) => queued.eventKey === event.eventKey)) {
        void revalidateAnalyticsConsentAfterForbidden(event);
      }
      return "blocked";
    }
  }
  return "complete";
}

function scheduleQueueRetry() {
  if (queueRetryTimer !== null) return;
  const nextAttemptAt = readQueue()
    .map((event) => event.nextAttemptAt ?? 0)
    .filter((value) => value > Date.now())
    .sort((left, right) => left - right)[0];
  if (!nextAttemptAt) return;
  queueRetryTimer = setTimeout(() => {
    queueRetryTimer = null;
    void flushAnalyticsQueue();
  }, Math.max(0, nextAttemptAt - Date.now()));
}

async function deliverEvent(event: QueuedAnalyticsEvent): Promise<AnalyticsDeliveryDisposition> {
  try {
    const response = await fetchWithTimeout("/api/analytics/events", {
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
    return classifyAnalyticsDeliveryStatus(response.status);
  } catch {
    return "retry";
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

function writeQueue(events: QueuedAnalyticsEvent[]) {
  localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(events));
}

function writeEventHistory(event: AnalyticsEvent) {
  const events = readStorageArray<AnalyticsEvent>(ANALYTICS_EVENTS_KEY);
  localStorage.setItem(ANALYTICS_EVENTS_KEY, JSON.stringify([event, ...events].slice(0, MAX_HISTORY_SIZE)));
}

function readCheckoutFunnelStates(storage: Pick<Storage, "getItem">): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(ANALYTICS_BEGIN_CHECKOUT_KEY) || "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 2_000)
      : [];
  } catch {
    return [];
  }
}

function setAnalyticsReadinessSnapshot(snapshot: AnalyticsReadinessSnapshot) {
  analyticsReadinessSnapshot = snapshot;
  for (const listener of analyticsReadinessListeners) listener(snapshot);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AnalyticsReadinessSnapshot>(ANALYTICS_SERVER_READY_EVENT, { detail: snapshot }));
  }
}

function readStorageArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}
