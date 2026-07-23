import { NextRequest, NextResponse } from "next/server";
import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  ATTRIBUTION_COOKIE_NAME,
  ATTRIBUTION_TOKEN_MAX_AGE_SECONDS,
  getOwnedAnalyticsHosts,
  resolveAttributionForConsentState
} from "./lib/server/analytics-attribution";
import { createRuntimeAnalyticsSecurity } from "./lib/server/analytics-security";

export async function middleware(request: NextRequest) {
  const security = createRuntimeAnalyticsSecurity();
  if (!security) {
    return NextResponse.next();
  }

  try {
    const resolved = await resolveAttributionForConsentState({
      consentState: request.cookies.get(ANALYTICS_CONSENT_COOKIE_NAME)?.value,
      url: request.url,
      referrer: request.headers.get("referer"),
      existingToken: request.cookies.get(ATTRIBUTION_COOKIE_NAME)?.value ?? null,
      ownHosts: getOwnedAnalyticsHosts(),
      service: security
    });
    const response = NextResponse.next();
    if (resolved.shouldClearAttribution) {
      response.cookies.set({
        name: ATTRIBUTION_COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0
      });
    }
    if (resolved.shouldSetCookie && resolved.token) {
      response.cookies.set({
        name: ATTRIBUTION_COOKIE_NAME,
        value: resolved.token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ATTRIBUTION_TOKEN_MAX_AGE_SECONDS
      });
    }
    return response;
  } catch {
    // Attribution must never make storefront navigation unavailable.
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|assets/|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\.(?:svg|png|jpg|jpeg|webp|avif|gif|ico|css|js|map|woff2?)$).*)"
  ]
};
