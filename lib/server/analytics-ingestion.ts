import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ATTRIBUTION_COOKIE_NAME,
  type AnalyticsAttributionService,
  type TrustedAttribution
} from "./analytics-attribution.ts";

const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 15 * 60 * 1000;
const MAX_EVENT_VALUE_EUR = 100_000;
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedText = (max: number) => boundedText(max).optional();

const consentSchema = z.object({
  visitorId: boundedText(120),
  consent: z.enum(["necessary", "analytics"]),
  locale: z.enum(["zh", "en", "es", "fr", "de"]).default("en"),
  version: boundedText(40)
});

const eventSchema = z.object({
  eventKey: boundedText(160),
  type: z.enum(["page_view", "product_view", "add_to_cart", "begin_checkout", "order_submit"]),
  createdAt: z.string().datetime({ offset: true }),
  visitorId: boundedText(120),
  sessionId: boundedText(120),
  path: boundedText(500),
  // Unknown legacy attribution fields are intentionally stripped. Canonical
  // source data is read only from the signed HttpOnly attribution cookie.
  deviceType: z.enum(["desktop", "mobile", "tablet"]).optional(),
  productId: boundedText(120).optional(),
  productName: optionalBoundedText(300),
  valueEur: z.number().finite().nonnegative().max(MAX_EVENT_VALUE_EUR).optional()
});

export type IngestedAnalyticsEvent = {
  eventKey: string;
  eventType: z.infer<typeof eventSchema>["type"];
  createdAt: string;
  visitorId: string;
  sessionId: string;
  path: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  referrerDomain: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | null;
  productId: string | null;
  productName: string | null;
  valueEur: number | null;
  rawUtm: Record<string, string>;
  consentId?: string | null;
};

export type AnalyticsIngestionRepository = {
  consumeRateLimit(input: { bucketKey: string; limit: number; windowSeconds: number }): Promise<{
    allowed: boolean;
    retryAfterSeconds: number;
  }>;
  recordConsent(input: {
    visitorId: string;
    consent: "necessary" | "analytics";
    locale: string;
    version: string;
  }): Promise<{ id: string; consent: "necessary" | "analytics"; revision: number }>;
  resolveProductId(identifier: string): Promise<string | null>;
  ingestEvent(input: IngestedAnalyticsEvent): Promise<{
    accepted: boolean;
    inserted: boolean;
    consentId: string | null;
    reason: string;
  }>;
};

type HandlerDependencies = {
  repository: AnalyticsIngestionRepository;
  attributionService: AnalyticsAttributionService | null;
};

export function createAnalyticsConsentHandler({ repository, attributionService }: HandlerDependencies) {
  return async function postAnalyticsConsent(request: Request): Promise<Response> {
    const payload = consentSchema.safeParse(await readJson(request));
    if (!payload.success) {
      return invalidPayloadResponse();
    }

    if (!attributionService) return unavailableResponse();

    const limit = await checkPersistentRateLimit(
      repository,
      request,
      "analytics:consent",
      payload.data.visitorId,
      undefined,
      attributionService
    );
    if (!limit.ok) {
      return limit.response;
    }

    try {
      await repository.recordConsent(payload.data);
      return Response.json({ ok: true });
    } catch {
      return unavailableResponse();
    }
  };
}

export function createAnalyticsEventHandler({ repository, attributionService }: HandlerDependencies) {
  return async function postAnalyticsEvent(request: Request): Promise<Response> {
    const parsed = eventSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return invalidPayloadResponse();
    }

    if (!attributionService) return unavailableResponse();

    const attribution = await attributionService.verify(readCookie(request, ATTRIBUTION_COOKIE_NAME));
    if (!attribution) {
      return invalidPayloadResponse();
    }

    const canonical = canonicalizeEvent(parsed.data, attribution);
    if (!canonical) {
      return invalidPayloadResponse();
    }

    const limit = await checkPersistentRateLimit(
      repository,
      request,
      "analytics:event",
      canonical.visitorId,
      canonical.sessionId,
      attributionService
    );
    if (!limit.ok) {
      return limit.response;
    }

    try {
      const productId = parsed.data.productId
        ? await repository.resolveProductId(parsed.data.productId)
        : null;
      if (parsed.data.productId && !productId) {
        return Response.json({ ok: false, message: "Unknown product." }, { status: 400 });
      }

      const result = await repository.ingestEvent({ ...canonical, productId });
      if (!result.accepted) {
        return Response.json({ ok: false, message: "Analytics consent is required." }, { status: 403 });
      }

      return Response.json({ ok: true });
    } catch {
      return unavailableResponse();
    }
  };
}

export function createSupabaseAnalyticsRepository(client: SupabaseClient): AnalyticsIngestionRepository {
  return {
    async consumeRateLimit(input) {
      const { data, error } = await client.rpc("consume_analytics_rate_limit", {
        p_bucket_key: input.bucketKey,
        p_limit: input.limit,
        p_window_seconds: input.windowSeconds
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row || typeof row.allowed !== "boolean" || typeof row.retry_after_seconds !== "number") {
        throw new Error("Invalid rate limit response.");
      }
      return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
    },

    async recordConsent(input) {
      const { data, error } = await client.rpc("record_analytics_consent", {
        p_visitor_id: input.visitorId,
        p_consent: input.consent,
        p_locale: input.locale,
        p_consent_version: input.version
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] as { id?: string; consent?: "necessary" | "analytics"; revision?: number } : null;
      if (!row || typeof row.id !== "string" || (row.consent !== "necessary" && row.consent !== "analytics") || typeof row.revision !== "number") {
        throw new Error("Invalid consent write response.");
      }
      return { id: row.id, consent: row.consent, revision: row.revision };
    },

    async resolveProductId(identifier) {
      const column = isUuid(identifier) ? "id" : "sku";
      const { data, error } = await client
        .from("products")
        .select("id")
        .eq(column, identifier)
        .maybeSingle();
      if (error) throw error;
      return (data as { id?: string } | null)?.id ?? null;
    },

    async ingestEvent(input) {
      const { data, error } = await client.rpc("ingest_analytics_event", {
        p_event_key: input.eventKey,
        p_event_type: input.eventType,
        p_created_at: input.createdAt,
        p_visitor_id: input.visitorId,
        p_session_id: input.sessionId,
        p_path: input.path,
        p_source: input.source,
        p_medium: input.medium,
        p_campaign: input.campaign,
        p_referrer_domain: input.referrerDomain,
        p_device_type: input.deviceType,
        p_product_id: input.productId,
        p_product_name: input.productName,
        p_value_eur: input.valueEur,
        p_raw_utm: input.rawUtm
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row || typeof row.accepted !== "boolean" || typeof row.inserted !== "boolean") {
        throw new Error("Invalid analytics ingestion response.");
      }
      return {
        accepted: row.accepted,
        inserted: row.inserted,
        consentId: typeof row.consent_id === "string" ? row.consent_id : null,
        reason: typeof row.reason === "string" ? row.reason : "unknown"
      };
    }
  };
}

export function createUnavailableAnalyticsRepository(): AnalyticsIngestionRepository {
  const unavailable = () => {
    throw new Error("Supabase service role configuration is unavailable.");
  };

  return {
    consumeRateLimit: async () => unavailable(),
    recordConsent: async () => unavailable(),
    resolveProductId: async () => unavailable(),
    ingestEvent: async () => unavailable()
  };
}

function canonicalizeEvent(
  event: z.infer<typeof eventSchema>,
  attribution: TrustedAttribution
): Omit<IngestedAnalyticsEvent, "productId" | "consentId"> | null {
  const createdAt = new Date(event.createdAt);
  const skew = createdAt.getTime() - Date.now();
  if (!Number.isFinite(createdAt.getTime()) || skew < -MAX_EVENT_AGE_MS || skew > MAX_FUTURE_SKEW_MS) {
    return null;
  }

  if (!isSafeSameSitePath(event.path)) {
    return null;
  }

  return {
    eventKey: event.eventKey,
    eventType: event.type,
    createdAt: createdAt.toISOString(),
    visitorId: event.visitorId,
    sessionId: event.sessionId,
    path: event.path,
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
    referrerDomain: attribution.referrerDomain,
    deviceType: event.deviceType ?? null,
    productName: event.productName ?? null,
    valueEur: event.valueEur ?? null,
    rawUtm: attribution.rawUtm
  };
}

function isSafeSameSitePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || /[\\\u0000-\u001F\u007F]/.test(value)) {
    return false;
  }

  try {
    const origin = "https://boxsofa.invalid";
    return new URL(value, origin).origin === origin;
  } catch {
    return false;
  }
}

async function checkPersistentRateLimit(
  repository: AnalyticsIngestionRepository,
  request: Request,
  scope: string,
  visitorId: string,
  sessionId: string | undefined,
  attributionService: AnalyticsAttributionService
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const options = scope === "analytics:consent"
    ? { limit: 30, windowSeconds: 60 }
    : { limit: 120, windowSeconds: 60 };

  try {
    const bucketKeys = await createRateLimitBucketKeys(request, scope, visitorId, sessionId, attributionService);
    for (const bucketKey of bucketKeys) {
      const result = await repository.consumeRateLimit({ bucketKey, ...options });
      if (!result.allowed) {
        return {
          ok: false,
          response: Response.json(
            { ok: false, message: "Too many requests. Please wait a moment and try again." },
            { status: 429, headers: { "Retry-After": String(Math.max(1, result.retryAfterSeconds)) } }
          )
        };
      }
    }
  } catch {
    return { ok: false, response: unavailableResponse() };
  }

  return { ok: true };
}

async function createRateLimitBucketKeys(
  request: Request,
  scope: string,
  visitorId: string,
  sessionId: string | undefined,
  attributionService: AnalyticsAttributionService
): Promise<string[]> {
  const address = getTrustedClientAddress(request);
  const identifiers = [
    address ? `address:${address}` : null,
    `visitor:${visitorId}`,
    sessionId ? `session:${sessionId}` : null
  ].filter((value): value is string => Boolean(value));

  const keys = await Promise.all(
    identifiers.map((identifier) => attributionService.hmacHex("analytics-rate-limit:v1", `${scope}:${identifier}`))
  );
  return [...new Set(keys)];
}

function getTrustedClientAddress(request: Request): string | null {
  // This header is injected by the Vercel edge/proxy layer for production traffic.
  // Generic forwarding headers are intentionally ignored because clients can forge them.
  const value = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  return value && value.length <= 120 && !/[\\\u0000-\u001F\u007F]/.test(value) ? value : null;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header || header.length > 8192) return null;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name && value.length) return value.join("=");
  }
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function invalidPayloadResponse() {
  return Response.json({ ok: false, message: "Invalid analytics payload." }, { status: 400 });
}

function unavailableResponse() {
  return Response.json({ ok: false, message: "Analytics is temporarily unavailable." }, { status: 503 });
}
