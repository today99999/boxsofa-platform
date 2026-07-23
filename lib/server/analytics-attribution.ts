import { resolveAttribution } from "../data-center/metrics.ts";

export const ATTRIBUTION_COOKIE_NAME = "boxsofa_attribution_v1";
export const ATTRIBUTION_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const TOKEN_VERSION = 1;
const MAX_SOURCE_LENGTH = 80;
const MAX_MEDIUM_LENGTH = 80;
const MAX_CAMPAIGN_LENGTH = 160;
const MAX_REFERRER_DOMAIN_LENGTH = 255;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type TrustedAttribution = {
  source: string;
  medium: string | null;
  campaign: string | null;
  referrerDomain: string | null;
  rawUtm: Record<string, string>;
  issuedAt: number;
  expiresAt: number;
};

type AttributionPayload = TrustedAttribution & { version: number };

export type AnalyticsAttributionService = {
  issue(input: Omit<TrustedAttribution, "issuedAt" | "expiresAt">, now?: number): Promise<string>;
  verify(token: string | null | undefined, now?: number): Promise<TrustedAttribution | null>;
  hmacHex(purpose: string, value: string): Promise<string>;
};

export function createAnalyticsAttributionService(secret: string): AnalyticsAttributionService {
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error("Analytics signing secret must be at least 32 bytes.");
  }

  const keys = new Map<string, Promise<CryptoKey>>();
  const keyFor = (purpose: string) => {
    const existing = keys.get(purpose);
    if (existing) return existing;

    const created = derivePurposeKey(secret, purpose);
    keys.set(purpose, created);
    return created;
  };

  return {
    async issue(input, now = Date.now()) {
      const payload: AttributionPayload = {
        version: TOKEN_VERSION,
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
        referrerDomain: input.referrerDomain,
        rawUtm: input.rawUtm,
        issuedAt: now,
        expiresAt: now + ATTRIBUTION_TOKEN_MAX_AGE_SECONDS * 1000
      };
      const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
      const signature = await sign(await keyFor("attribution-token:v1"), encodedPayload);
      return `${encodedPayload}.${signature}`;
    },

    async verify(token, now = Date.now()) {
      if (!token || token.length > 4096) return null;
      const parts = token.split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

      const [encodedPayload, encodedSignature] = parts;
      const validSignature = await verifySignature(
        await keyFor("attribution-token:v1"),
        encodedPayload,
        encodedSignature
      );
      if (!validSignature) return null;

      try {
        const parsed = JSON.parse(decoder.decode(decodeBase64Url(encodedPayload))) as unknown;
        return isTrustedAttributionPayload(parsed, now) ? withoutVersion(parsed) : null;
      } catch {
        return null;
      }
    },

    async hmacHex(purpose, value) {
      const signature = await crypto.subtle.sign("HMAC", await keyFor(`hmac:${purpose}`), encoder.encode(value));
      return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  };
}

export async function resolveTrustedAttribution(input: {
  url: string;
  referrer: string | null;
  existingToken: string | null;
  siteOrigin: string;
  service: AnalyticsAttributionService;
  now?: number;
}): Promise<{ attribution: TrustedAttribution; token: string | null; shouldSetCookie: boolean }> {
  const now = input.now ?? Date.now();
  const url = new URL(input.url);
  const rawUtm = extractRawUtm(url);
  const externalReferrer = trustedExternalReferrer(input.referrer, input.siteOrigin);
  const existing = await input.service.verify(input.existingToken, now);

  if (!rawUtm.source && !externalReferrer && existing) {
    return { attribution: existing, token: input.existingToken, shouldSetCookie: false };
  }

  const canonical = resolveAttribution({
    utmSource: rawUtm.source,
    referrer: externalReferrer?.url ?? null
  });
  const attribution: Omit<TrustedAttribution, "issuedAt" | "expiresAt"> = {
    source: canonical.source,
    medium: rawUtm.medium ?? null,
    campaign: rawUtm.campaign ?? null,
    referrerDomain: externalReferrer?.domain ?? null,
    rawUtm
  };
  const token = await input.service.issue(attribution, now);
  const verified = await input.service.verify(token, now);
  if (!verified) {
    throw new Error("Unable to verify analytics attribution token.");
  }
  return { attribution: verified, token, shouldSetCookie: true };
}

function extractRawUtm(url: URL): Record<string, string> {
  const limits = {
    source: MAX_SOURCE_LENGTH,
    medium: MAX_MEDIUM_LENGTH,
    campaign: MAX_CAMPAIGN_LENGTH,
    content: MAX_CAMPAIGN_LENGTH,
    term: MAX_CAMPAIGN_LENGTH
  } as const;
  const raw: Record<string, string> = {};

  for (const [field, max] of Object.entries(limits)) {
    const value = boundedText(url.searchParams.get(`utm_${field}`), max);
    if (value) raw[field] = value;
  }
  return raw;
}

function trustedExternalReferrer(referrer: string | null, siteOrigin: string): { url: string; domain: string } | null {
  if (!referrer || referrer.length > 2000) return null;
  try {
    const parsed = new URL(referrer);
    const site = new URL(siteOrigin);
    if (!isHttpUrl(parsed) || parsed.origin === site.origin || !isSafeDomain(parsed.hostname)) return null;
    return { url: parsed.toString(), domain: parsed.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

function isTrustedAttributionPayload(value: unknown, now: number): value is AttributionPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<AttributionPayload>;
  const issuedAt = payload.issuedAt;
  const expiresAt = payload.expiresAt;
  if (
    payload.version !== TOKEN_VERSION ||
    !isBoundedSource(payload.source) ||
    !isOptionalBoundedText(payload.medium, MAX_MEDIUM_LENGTH) ||
    !isOptionalBoundedText(payload.campaign, MAX_CAMPAIGN_LENGTH) ||
    !isOptionalDomain(payload.referrerDomain) ||
    !isRawUtm(payload.rawUtm) ||
    typeof issuedAt !== "number" ||
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    issuedAt > now + 5 * 60 * 1000 ||
    expiresAt <= now ||
    expiresAt - issuedAt > ATTRIBUTION_TOKEN_MAX_AGE_SECONDS * 1000
  ) {
    return false;
  }
  return true;
}

function withoutVersion(payload: AttributionPayload): TrustedAttribution {
  return {
    source: payload.source,
    medium: payload.medium,
    campaign: payload.campaign,
    referrerDomain: payload.referrerDomain,
    rawUtm: payload.rawUtm,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt
  };
}

function isRawUtm(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.some(([key, text]) => !["source", "medium", "campaign", "content", "term"].includes(key) || typeof text !== "string")) {
    return false;
  }
  return entries.every(([key, text]) => {
    const max = key === "source" ? MAX_SOURCE_LENGTH : key === "medium" ? MAX_MEDIUM_LENGTH : MAX_CAMPAIGN_LENGTH;
    return Boolean(boundedText(text, max));
  });
}

function isBoundedSource(value: unknown): value is string {
  return typeof value === "string" && Boolean(boundedText(value, MAX_SOURCE_LENGTH));
}

function isOptionalBoundedText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === "string" && Boolean(boundedText(value, max)));
}

function isOptionalDomain(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isSafeDomain(value));
}

function isSafeDomain(value: string): boolean {
  return value.length > 0 && value.length <= MAX_REFERRER_DOMAIN_LENGTH && /^[a-z0-9.-]+$/i.test(value);
}

function boundedText(value: string | null, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > max || /[\\\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function isHttpUrl(url: URL) {
  return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
}

async function derivePurposeKey(secret: string, purpose: string): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const material = await crypto.subtle.sign("HMAC", root, encoder.encode(`boxsofa:${purpose}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(key: CryptoKey, value: string): Promise<string> {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function verifySignature(key: CryptoKey, value: string, signature: string): Promise<boolean> {
  try {
    return crypto.subtle.verify("HMAC", key, toArrayBuffer(decodeBase64Url(signature)), encoder.encode(value));
  } catch {
    return false;
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url.");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
