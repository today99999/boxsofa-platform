"use client";

import { useEffect, useState } from "react";
import { defaultLanguage, LANGUAGE_KEY, languages, type LanguageCode } from "@/lib/i18n";
import { setStoredLanguage, useTranslation } from "@/components/useTranslation";

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);

  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_KEY) as LanguageCode | null;
    if (saved && languages.some((item) => item.code === saved)) {
      setLanguage(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  function changeLanguage(nextLanguage: LanguageCode) {
    setLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
  }

  const current = languages.find((item) => item.code === language) ?? languages[0];

  return (
    <label className="language-switcher">
      <span>{t("language")}</span>
      <select aria-label="Select language" value={language} onChange={(event) => changeLanguage(event.target.value as LanguageCode)}>
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
      <strong aria-hidden="true">{current.short}</strong>
    </label>
  );
}
