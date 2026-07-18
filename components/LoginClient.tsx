"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "@/components/useTranslation";
import { AUTH_SESSION_KEY, getLoginFeedback } from "@/lib/auth";
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
  const [fullName, setFullName] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const loginRole = getLoginRole(account);
  const normalizedPreviewAccount = account.trim();
  const isEmailAccount = normalizedPreviewAccount.includes("@");
  const localAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_LOCAL_AUTH === "true" || process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("confirmed") === "1") {
      setLoginMessage("Email confirmed. You can now sign in.");
    }
  }, []);

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
    setCanResendConfirmation(false);

    const normalizedAccount = account.trim();
    const canUseSupabase = hasSupabaseBrowserConfig() && normalizedAccount.includes("@");

    if (mode === "register") {
      if (!canUseSupabase) {
        setLoginMessage("Please use an email address to create a customer account.");
        setIsSubmitting(false);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data, error } =
        supabase
          ? await supabase.auth.signUp({
              email: normalizedAccount,
              password,
              options: {
                data: {
                  full_name: fullName.trim()
                },
                emailRedirectTo: `${window.location.origin}/login?confirmed=1`
              }
            })
          : { data: null, error: new Error("Supabase is not configured.") };

      if (error) {
        setLoginMessage(error.message || "Could not create the customer account.");
        setIsSubmitting(false);
        return;
      }

      if (data?.session) {
        saveSession({ account: normalizedAccount, role: "customer", source: "supabase" });
        window.location.href = "/orders";
        return;
      }

      setLoginMessage("Customer account created. Please check your email to confirm the account before signing in.");
      setCanResendConfirmation(true);
      setMode("login");
      setIsSubmitting(false);
      return;
    }

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

      const feedback = getLoginFeedback(error);
      setLoginMessage(
        localAuthEnabled && !feedback.canResendConfirmation
          ? "Login failed. Please check the account and password, or use a local test account."
          : feedback.message
      );
      setCanResendConfirmation(feedback.canResendConfirmation);
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

  async function resendConfirmation() {
    const normalizedAccount = account.trim();
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !normalizedAccount.includes("@")) {
      setLoginMessage("Please enter the email address used to create the account.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalizedAccount,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`
      }
    });

    setLoginMessage(
      error
        ? "The confirmation email could not be sent yet. Please wait a moment and try again."
        : "Confirmation email sent. Please check your inbox and spam folder."
    );
    setIsSubmitting(false);
  }

  return (
    <form className="panel login-form" onSubmit={handleSubmit}>
      <div className="login-mode-toggle" aria-label="Customer account mode">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setLoginMessage("");
            setCanResendConfirmation(false);
          }}
          type="button"
        >
          Sign in
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            setLoginMessage("");
            setCanResendConfirmation(false);
          }}
          type="button"
        >
          Create account
        </button>
      </div>
      <label>
        {t("account")}
        <input
          autoComplete="username"
          name="account"
          onChange={(event) => {
            setAccount(event.target.value);
            setCanResendConfirmation(false);
          }}
          placeholder={t("accountPlaceholder")}
          value={account}
        />
      </label>
      {mode === "register" ? (
        <label>
          Full name
          <input
            autoComplete="name"
            name="fullName"
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your name"
            value={fullName}
          />
        </label>
      ) : null}
      <label>
        {t("password")}
        <input
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("passwordPlaceholder")}
          type="password"
          value={password}
        />
      </label>
      {mode === "login" ? (
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
      ) : (
        <div className="login-role-preview">
          <span>Account type</span>
          <strong>Customer account</strong>
        </div>
      )}
      <button className="button primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? (mode === "register" ? "Creating account..." : "Logging in...") : mode === "register" ? "Create customer account" : t("login")}
      </button>
      {canResendConfirmation ? (
        <button className="button secondary" disabled={isSubmitting} onClick={resendConfirmation} type="button">
          Resend confirmation email
        </button>
      ) : null}
      {loginMessage ? <p className="login-note">{loginMessage}</p> : null}
      <p className="login-note">
        {mode === "register"
          ? "Create account is for customers only. Seller dashboard access is assigned separately by BoxSofa."
          : localAuthEnabled
            ? "Email accounts use Supabase roles: owner/service opens the seller dashboard, customer opens the customer dashboard. Local shortcut login is enabled only for development."
            : "Use your BoxSofa email account. Seller or customer access is decided by the account role."}
      </p>
    </form>
  );
}

