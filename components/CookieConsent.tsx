"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANALYTICS_CONSENT_KEY,
  clearAnalyticsClientState,
  clearAnalyticsServerReady,
  enqueueConsentMutation,
  fetchWithTimeout,
  getOrCreateVisitorId,
  markAnalyticsServerReady,
  markConsentSynchronized,
  readStoredAnalyticsConsent,
  OPEN_COOKIE_SETTINGS_EVENT,
  readAnalyticsConsentStatus,
  registerAnalyticsConsentRecoveryHandler,
  resetAnalyticsConsentRecovery,
  synchronizeAnalyticsConsent,
  type AnalyticsConsent
} from "@/lib/analytics";
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
    // A prior session marker cannot authorize tracking until this mount has
    // confirmed the HttpOnly server consent state again.
    clearAnalyticsServerReady("temporary");

    const synchronize = async (saved: AnalyticsConsent, syncGeneration: number) => {
      const intent = userOperationRef.current;
      const isCurrent = () => !cancelled
        && syncGeneration === consentSyncGenerationRef.current
        && intent === userOperationRef.current;
      if (!isCurrent()) return;
      const result = await synchronizeAnalyticsConsent({
        visitorId: getOrCreateVisitorId(),
        consent: saved,
        version: CONSENT_VERSION,
        getStatus: () => readAnalyticsConsentStatus(),
        persist: () => persistConsent(saved, isCurrent),
        isCurrent
      });
      if (!isCurrent()) return;
      if (result === "unavailable") {
        clearAnalyticsServerReady("temporary");
        setConsent(saved);
        retryTimer = window.setTimeout(() => void synchronize(saved, syncGeneration), 60_000);
        return;
      }
      applyConfirmedConsent(saved);
    };

    const synchronizeStoredConsent = () => {
      const saved = readStoredAnalyticsConsent(localStorage);
      if (!saved) {
        clearAnalyticsServerReady("withdrawn");
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

    const unregisterRecoveryHandler = registerAnalyticsConsentRecoveryHandler(async () => {
      const saved = readStoredAnalyticsConsent(localStorage);
      if (saved !== "analytics") {
        clearAnalyticsServerReady("withdrawn");
        return false;
      }

      const recoveryGeneration = consentSyncGenerationRef.current;
      const recoveryOperation = userOperationRef.current;
      const isCurrent = () => !cancelled
        && recoveryGeneration === consentSyncGenerationRef.current
        && recoveryOperation === userOperationRef.current
        && readStoredAnalyticsConsent(localStorage) === "analytics";
      const persisted = await persistConsent("analytics", isCurrent);
      if (!persisted || !isCurrent()) {
        clearAnalyticsServerReady("temporary");
        return false;
      }

      markConsentSynchronized(localStorage, "analytics", CONSENT_VERSION);
      setConsent("analytics");
      markAnalyticsServerReady();
      // Deliberately do not track the current page here. The 403 coordinator
      // retains and retries its original event after the forced mutation.
      return true;
    });

    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    synchronizeStoredConsent();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
      unregisterRecoveryHandler();
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

  async function saveConsent(nextConsent: AnalyticsConsent) {
    // A user decision always wins over a pending mount-time resynchronization.
    consentSyncGenerationRef.current += 1;
    const operation = ++userOperationRef.current;
    resetAnalyticsConsentRecovery();
    const persisted = await persistConsent(nextConsent, () => operation === userOperationRef.current);
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
    } else {
      clearAnalyticsClientState();
    }
  }

  async function persistConsent(nextConsent: AnalyticsConsent, isCurrent: () => boolean = () => true): Promise<boolean> {
    const visitorId = getOrCreateVisitorId();
    return enqueueConsentMutation(visitorId, async () => {
      // A queued mount-time sync can become stale while a user choice is waiting
      // ahead of it. Do not let that stale write run after the explicit choice.
      if (!isCurrent()) return false;
      try {
        const intentResponse = await fetchWithTimeout("/api/analytics/consent/intent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ visitorId })
        });
        if (!intentResponse.ok || !isCurrent()) return false;
        const intentPayload = await intentResponse.json() as { intentId?: unknown };
        if (typeof intentPayload.intentId !== "string") return false;
        const response = await fetchWithTimeout("/api/analytics/consent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            visitorId,
            consent: nextConsent,
            locale: language,
            version: CONSENT_VERSION,
            intentId: intentPayload.intentId
          })
        });
        return response.ok;
      } catch {
        return false;
      }
    });
  }

  function applyConfirmedConsent(nextConsent: AnalyticsConsent) {
    markConsentSynchronized(localStorage, nextConsent, CONSENT_VERSION);
    setConsent(nextConsent);
    if (nextConsent === "analytics") {
      markAnalyticsServerReady();
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
