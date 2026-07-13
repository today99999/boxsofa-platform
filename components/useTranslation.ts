"use client";

import { useEffect, useState } from "react";
import {
  defaultLanguage,
  LANGUAGE_KEY,
  languages,
  type LanguageCode,
  translations,
  type TranslationKey
} from "@/lib/i18n";

const LANGUAGE_CHANGE_EVENT = "boxsofa-language-change";

function isLanguageCode(value: string | null): value is LanguageCode {
  return Boolean(value && languages.some((item) => item.code === value));
}

export function setStoredLanguage(language: LanguageCode) {
  localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: language }));
}

export function useTranslation() {
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);

  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguageCode(saved)) {
      setLanguage(saved);
      document.documentElement.lang = saved;
    }

    function handleLanguageChange(event: Event) {
      const nextLanguage = (event as CustomEvent<LanguageCode>).detail;
      if (isLanguageCode(nextLanguage)) {
        setLanguage(nextLanguage);
      }
    }

    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
  }, []);

  function t(key: TranslationKey) {
    return translations[language][key] ?? translations[defaultLanguage][key];
  }

  return { language, t };
}
