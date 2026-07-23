"use client";

import { useTranslation } from "@/components/useTranslation";

export function LoginIntro() {
  const { t } = useTranslation();

  return (
    <div className="login-intro">
      <p className="eyebrow">BoxSofa Login</p>
      <h1>{t("login")}</h1>
      <p>{t("loginNote")}</p>
    </div>
  );
}
