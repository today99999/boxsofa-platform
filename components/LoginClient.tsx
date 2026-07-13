"use client";

import { FormEvent, useState } from "react";
import { useTranslation } from "@/components/useTranslation";
import { AUTH_SESSION_KEY } from "@/lib/auth";
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from "@/lib/supabase/browser";

type AuthProfileResponse = {
  ok: boolean;
  mode: "local" | "supabase";
  message?: string;
  profile?: {
    id: string;
    email: string;
    full_name?: string;
    role: "customer" | "owner" | "service";
  } | null;
};

function getLoginRole(account: string) {
  const normalized = account.trim().toLowerCase();
  const isMerchant =
    normalized.includes("admin") ||
    normalized.includes("merchant") ||
    normalized.includes("seller") ||
    normalized.includes("shop") ||
    normalized.includes("商家");

  return isMerchant ? "merchant" : "customer";
}

function getTargetPath(account: string) {
  return getLoginRole(account) === "merchant" ? "/admin" : "/orders";
}

export function LoginClient() {
  const { t } = useTranslation();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginRole = getLoginRole(account);
  const normalizedPreviewAccount = account.trim();
  const isEmailAccount = normalizedPreviewAccount.includes("@");
  const localAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_LOCAL_AUTH === "true" || process.env.NODE_ENV !== "production";

  function saveSession(input: { account: string; role: "customer" | "merchant"; source: "local" | "supabase" }) {
    localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({
        account: input.account,
        role: input.role,
        source: input.source,
        loggedInAt: new Date().toISOString()
      })
    );
  }

  async function getSupabaseProfile() {
    const response = await fetch("/api/auth/profile");
    return (await response.json()) as AuthProfileResponse;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account.trim() || !password.trim()) return;
    setIsSubmitting(true);
    setLoginMessage("");

    const normalizedAccount = account.trim();
    const canUseSupabase = hasSupabaseBrowserConfig() && normalizedAccount.includes("@");

    if (canUseSupabase) {
      const supabase = createSupabaseBrowserClient();
      const { error } =
        supabase
          ? await supabase.auth.signInWithPassword({
              email: normalizedAccount,
              password
            })
          : { error: new Error("Supabase is not configured.") };

      if (!error) {
        const profileResult = await getSupabaseProfile();
        const profileRole = profileResult.profile?.role;
        const role = profileRole === "owner" || profileRole === "service" ? "merchant" : "customer";
        saveSession({ account: normalizedAccount, role, source: "supabase" });
        window.location.href = role === "merchant" ? "/admin" : "/orders";
        return;
      }

      setLoginMessage(
        localAuthEnabled
          ? "Login failed. Please check the account and password, or use a local test account."
          : "Login failed. Please check the email account and password."
      );
      setIsSubmitting(false);
      return;
    }

    if (!localAuthEnabled) {
      setLoginMessage("Please sign in with a BoxSofa email account. Test shortcut login is disabled for production safety.");
      setIsSubmitting(false);
      return;
    }

    saveSession({ account: normalizedAccount, role: loginRole, source: "local" });
    window.location.href = getTargetPath(account);
  }

  return (
    <form className="panel login-form" onSubmit={handleSubmit}>
      <label>
        {t("account")}
        <input
          autoComplete="username"
          name="account"
          onChange={(event) => setAccount(event.target.value)}
          placeholder={t("accountPlaceholder")}
          value={account}
        />
      </label>
      <label>
        {t("password")}
        <input
          autoComplete="current-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("passwordPlaceholder")}
          type="password"
          value={password}
        />
      </label>
      <div className="login-role-preview">
        <span>{t("loginRolePreview")}</span>
        <strong>
          {isEmailAccount
            ? "Route by account role"
            : loginRole === "merchant"
              ? t("loginAsMerchant")
              : t("loginAsCustomer")}
        </strong>
      </div>
      <button className="button primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Logging in..." : t("login")}
      </button>
      {loginMessage ? <p className="login-note">{loginMessage}</p> : null}
      <p className="login-note">
        {localAuthEnabled
          ? "Email accounts use Supabase roles: owner/service opens the seller dashboard, customer opens the customer dashboard. Local shortcut login is enabled only for development."
          : "Use your BoxSofa email account. Seller or customer access is decided by the account role."}
      </p>
    </form>
  );
}

