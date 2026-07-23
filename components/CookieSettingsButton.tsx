"use client";

import { useTranslation } from "@/components/useTranslation";
import { openCookieSettings } from "@/lib/analytics";

export function CookieSettingsButton() {
  const { t } = useTranslation();

  return (
    <button className="button cookie-settings-button" type="button" onClick={openCookieSettings}>
      {t("cookieSettings")}
    </button>
  );
}
