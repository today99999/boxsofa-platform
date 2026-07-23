"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_CONSENT_REVALIDATE_EVENT,
  clearAnalyticsClientState,
  clearAnalyticsServerReady,
  enqueueConsentMutation,
  getOrCreateVisitorId,
  markAnalyticsServerReady,
  markConsentSynchronized,
  readStoredAnalyticsConsent,
  OPEN_COOKIE_SETTINGS_EVENT,
  readAnalyticsConsentStatus,
  synchronizeAnalyticsConsent,
  type AnalyticsConsent,
  trackEvent
} from "@/lib/analytics";
import { products } from "@/lib/catalog";
import { useTranslation } from "@/components/useTranslation";

const CONSENT_VERSION = "2026-07-23";
const COOKIE_DIALOG_TITLE_ID = "cookie-consent-title";
const COOKIE_DIALOG_DESCRIPTION_ID = "cookie-consent-description";

export function CookieConsent() {
  const { language, t } = useTranslation();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [shouldFocusSettings, setShouldFocusSettings] = useState(false);
  const necessaryButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const consentSyncGenerationRef = useRef(0);
  const userOperationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const synchronize = async (saved: AnalyticsConsent, syncGeneration: number) => {
      if (cancelled || syncGeneration !== consentSyncGenerationRef.current) return;
      const result = await synchronizeAnalyticsConsent({
        visitorId: getOrCreateVisitorId(),
        consent: saved,
        version: CONSENT_VERSION,
        getStatus: () => readAnalyticsConsentStatus(),
        persist: () => persistConsent(saved)
      });
      if (cancelled || syncGeneration !== consentSyncGenerationRef.current) return;
      if (result === "unavailable") {
        clearAnalyticsServerReady();
        setConsent(saved);
        retryTimer = window.setTimeout(() => void synchronize(saved, syncGeneration), 60_000);
        return;
      }
      applyConfirmedConsent(saved);
    };

    const synchronizeStoredConsent = () => {
      const saved = readStoredAnalyticsConsent(localStorage);
      if (!saved) {
        clearAnalyticsServerReady();
        setConsent(null);
        return;
      }
      void synchronize(saved, consentSyncGenerationRef.current);
    };

    function openSettings() {
      consentSyncGenerationRef.current += 1;
      const activeElement = document.activeElement;
      restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      setSaveError(false);
      setShouldFocusSettings(true);
      setConsent(null);
    }

    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    window.addEventListener(ANALYTICS_CONSENT_REVALIDATE_EVENT, synchronizeStoredConsent);
    synchronizeStoredConsent();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
      window.removeEventListener(ANALYTICS_CONSENT_REVALIDATE_EVENT, synchronizeStoredConsent);
    };
  }, []);

  useEffect(() => {
    if (consent !== null || !shouldFocusSettings) return;
    const frame = window.requestAnimationFrame(() => necessaryButtonRef.current?.focus());
    setShouldFocusSettings(false);
    return () => window.cancelAnimationFrame(frame);
  }, [consent, shouldFocusSettings]);

  useEffect(() => {
    if (consent === null || !restoreFocusRef.current) return;
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => target.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [consent]);

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
    // A user decision always wins over a pending mount-time resynchronization.
    consentSyncGenerationRef.current += 1;
    const operation = ++userOperationRef.current;
    const persisted = await persistConsent(nextConsent);
    if (operation !== userOperationRef.current) return;
    if (!persisted) {
      setSaveError(true);
      return;
    }
    setSaveError(false);
    localStorage.setItem(ANALYTICS_CONSENT_KEY, nextConsent);
    markConsentSynchronized(localStorage, nextConsent, CONSENT_VERSION);
    setConsent(nextConsent);
    if (nextConsent === "analytics") {
      markAnalyticsServerReady();
      trackCurrentPage();
    } else {
      clearAnalyticsClientState();
    }
  }

  async function persistConsent(nextConsent: AnalyticsConsent): Promise<boolean> {
    const visitorId = getOrCreateVisitorId();
    return enqueueConsentMutation(visitorId, async () => {
      const response = await fetch("/api/analytics/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visitorId,
          consent: nextConsent,
          locale: language,
          version: CONSENT_VERSION
        })
      }).catch(() => null);
      return response?.ok === true;
    });
  }

  function applyConfirmedConsent(nextConsent: AnalyticsConsent) {
    markConsentSynchronized(localStorage, nextConsent, CONSENT_VERSION);
    setConsent(nextConsent);
    if (nextConsent === "analytics") {
      markAnalyticsServerReady();
      trackCurrentPage();
    } else {
      clearAnalyticsClientState();
    }
  }

  if (consent) return null;

  return (
    <div
      className="cookie-banner"
      role="dialog"
      aria-labelledby={COOKIE_DIALOG_TITLE_ID}
      aria-describedby={COOKIE_DIALOG_DESCRIPTION_ID}
    >
      <div>
        <strong id={COOKIE_DIALOG_TITLE_ID}>{t("privacyTitle")}</strong>
        <p id={COOKIE_DIALOG_DESCRIPTION_ID}>{t("privacyBody")}</p>
        {saveError ? <p className="cookie-error" role="status" aria-live="polite">{t("cookieSettingsError")}</p> : null}
      </div>
      <div className="cookie-actions">
        <button ref={necessaryButtonRef} className="button" type="button" onClick={() => void saveConsent("necessary")}>
          {t("necessaryOnly")}
        </button>
        <button className="button primary" type="button" onClick={() => void saveConsent("analytics")}>
          {t("acceptAnalytics")}
        </button>
      </div>
    </div>
  );
}
