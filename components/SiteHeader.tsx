"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AUTH_SESSION_KEY, readLocalAuthSession, type LocalAuthSession } from "@/lib/auth";
import { categories } from "@/lib/catalog";
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from "@/lib/supabase/browser";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "@/components/useTranslation";

export function SiteHeader() {
  const { t } = useTranslation();
  const [session, setSession] = useState<LocalAuthSession | null>(null);

  useEffect(() => {
    setSession(readLocalAuthSession());

    function handleStorage(event: StorageEvent) {
      if (event.key === AUTH_SESSION_KEY) {
        setSession(readLocalAuthSession());
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  async function logout() {
    if (hasSupabaseBrowserConfig()) {
      const supabase = createSupabaseBrowserClient();
      await supabase?.auth.signOut();
    }
    localStorage.removeItem(AUTH_SESSION_KEY);
    setSession(null);
  }

  const dashboardHref = session?.role === "merchant" ? "/admin" : "/orders";
  const dashboardLabel = session?.role === "merchant" ? t("loginAsMerchant") : t("loginAsCustomer");

  return (
    <>
      <div className="topbar">{t("freeShippingTopbar")}</div>
      <header className="site-header">
        <div className="header-top">
          <Link className="brand" href="/">
            <img className="brand-mark" src="/assets/brand/boxsofa-mark.svg" alt="" width="42" height="42" />
            <span className="brand-name">BoxSofa</span>
            <span className="brand-region">Europe</span>
          </Link>
          <div className="header-actions">
            <LanguageSwitcher />
            {session ? (
              <div className="account-actions">
                <Link className="login-link" href={dashboardHref}>
                  {dashboardLabel}
                </Link>
                <button className="logout-button" type="button" onClick={logout}>
                  {t("logout")}
                </button>
              </div>
            ) : (
              <Link className="login-link" href="/login">
                {t("loginRegister")}
              </Link>
            )}
          </div>
        </div>
        <nav className="nav" aria-label={t("allSofas")}>
          {categories.map((category) => (
            <Link key={category.slug} href={`/category/${category.slug}`}>
              {category.slug === "all" ? t("allSofas") : category.name}
            </Link>
          ))}
          <Link href="/orders">{t("myOrders")}</Link>
          <Link href="/cart">{t("cart")}</Link>
        </nav>
      </header>
    </>
  );
}
