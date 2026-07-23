"use client";

import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_KEY,
  getOrCreateVisitorId,
  type AnalyticsConsent,
  trackEvent
} from "@/lib/analytics";
import { products } from "@/lib/catalog";
import { useTranslation } from "@/components/useTranslation";

export function CookieConsent() {
  const { language, t } = useTranslation();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(ANALYTICS_CONSENT_KEY) as AnalyticsConsent | null;
    setConsent(saved);
    if (saved) {
      void persistConsent(saved).finally(() => {
        if (saved === "analytics") {
          trackCurrentPage();
        }
      });
    }
  }, []);

  function trackCurrentPage() {
    trackEvent("page_view");
    const match = window.location.pathname.match(/^\/product\/([^/]+)/);
    if (match) {
      const product = products.find((item) => item.slug === match[1]);
      trackEvent("product_view", {
        productId: product?.id,
        productSlug: match[1],
        productName: product?.name
      });
    }
  }

  async function saveConsent(nextConsent: AnalyticsConsent) {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, nextConsent);
    setConsent(nextConsent);
    await persistConsent(nextConsent);
    if (nextConsent === "analytics") {
      trackCurrentPage();
    }
  }

  async function persistConsent(nextConsent: AnalyticsConsent) {
    await fetch("/api/analytics/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        visitorId: getOrCreateVisitorId(),
        consent: nextConsent,
        locale: language,
        version: "2026-07-23"
      })
    }).catch(() => undefined);
  }

  if (consent) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label={t("privacyTitle")}>
      <div>
        <strong>{t("privacyTitle")}</strong>
        <p>{t("privacyBody")}</p>
      </div>
      <div className="cookie-actions">
        <button className="button" type="button" onClick={() => void saveConsent("necessary")}>
          {t("necessaryOnly")}
        </button>
        <button className="button primary" type="button" onClick={() => void saveConsent("analytics")}>
          {t("acceptAnalytics")}
        </button>
      </div>
    </div>
  );
}
