"use client";

import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_KEY,
  clearAnalyticsClientState,
  getOrCreateVisitorId,
  OPEN_COOKIE_SETTINGS_EVENT,
  type AnalyticsConsent,
  trackEvent
} from "@/lib/analytics";
import { products } from "@/lib/catalog";
import { useTranslation } from "@/components/useTranslation";

export function CookieConsent() {
  const { language, t } = useTranslation();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(ANALYTICS_CONSENT_KEY) as AnalyticsConsent | null;
    if (saved) {
      void persistConsent(saved).then((persisted) => {
        if (!persisted) {
          localStorage.removeItem(ANALYTICS_CONSENT_KEY);
          return;
        }
        setConsent(saved);
        if (saved === "analytics") trackCurrentPage();
        else clearAnalyticsClientState();
      });
    }

    function openSettings() {
      setSaveError(false);
      setConsent(null);
    }

    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
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
    const persisted = await persistConsent(nextConsent);
    if (!persisted) {
      setSaveError(true);
      return;
    }
    setSaveError(false);
    localStorage.setItem(ANALYTICS_CONSENT_KEY, nextConsent);
    setConsent(nextConsent);
    if (nextConsent === "analytics") {
      trackCurrentPage();
    } else {
      clearAnalyticsClientState();
    }
  }

  async function persistConsent(nextConsent: AnalyticsConsent): Promise<boolean> {
    const response = await fetch("/api/analytics/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        visitorId: getOrCreateVisitorId(),
        consent: nextConsent,
        locale: language,
        version: "2026-07-23"
      })
    }).catch(() => null);
    return response?.ok === true;
  }

  if (consent) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label={t("privacyTitle")}>
      <div>
        <strong>{t("privacyTitle")}</strong>
        <p>{t("privacyBody")}</p>
        {saveError ? <p className="cookie-error" role="status">{t("cookieSettingsError")}</p> : null}
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
