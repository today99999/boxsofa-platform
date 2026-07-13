"use client";

import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_KEY,
  type AnalyticsConsent,
  trackEvent
} from "@/lib/analytics";
import { products } from "@/lib/catalog";
import { useTranslation } from "@/components/useTranslation";

export function CookieConsent() {
  const { t } = useTranslation();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(ANALYTICS_CONSENT_KEY) as AnalyticsConsent | null;
    setConsent(saved);
    if (saved === "analytics") {
      trackCurrentPage();
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

  function saveConsent(nextConsent: AnalyticsConsent) {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, nextConsent);
    setConsent(nextConsent);
    if (nextConsent === "analytics") {
      trackCurrentPage();
    }
  }

  if (consent) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label={t("privacyTitle")}>
      <div>
        <strong>{t("privacyTitle")}</strong>
        <p>{t("privacyBody")}</p>
      </div>
      <div className="cookie-actions">
        <button className="button" type="button" onClick={() => saveConsent("necessary")}>
          {t("necessaryOnly")}
        </button>
        <button className="button primary" type="button" onClick={() => saveConsent("analytics")}>
          {t("acceptAnalytics")}
        </button>
      </div>
    </div>
  );
}
