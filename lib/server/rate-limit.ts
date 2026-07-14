import { createHash } from "crypto";
import { NextResponse } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

declare global {
  // eslint-disable-next-line no-var
  var boxsofaRateLimitStore: Map<string, RateLimitEntry> | undefined;
}

function getStore() {
  if (!globalThis.boxsofaRateLimitStore) {
    globalThis.boxsofaRateLimitStore = new Map<string, RateLimitEntry>();
  }

  return globalThis.boxsofaRateLimitStore;
}

function getClientFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${clientIp}|${userAgent}`).digest("hex");
}

function cleanupExpiredEntries(store: Map<string, RateLimitEntry>, now: number) {
  if (store.size < 5000) return;

  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const store = getStore();
  cleanupExpiredEntries(store, now);

  const fingerprint = getClientFingerprint(request);
  const key = `${options.key}:${fingerprint}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: Math.max(0, options.limit - 1), resetAt: now + options.windowMs };
  }

  if (current.count >= options.limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  store.set(key, current);
  return { ok: true, remaining: Math.max(0, options.limit - current.count), resetAt: current.resetAt };
}

export function rateLimitResponse(resetAt: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { ok: false, message: "Too many requests. Please wait a moment and try again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds)
      }
    }
  );
}
