export const AUTH_SESSION_KEY = "boxsofa_auth_session_v1";

export type LocalAuthSession = {
  account: string;
  role: "customer" | "merchant";
  loggedInAt: string;
  source?: "local" | "supabase";
};

type AuthErrorLike = {
  code?: string;
  message?: string;
};

export function getLoginFeedback(error: AuthErrorLike) {
  const isEmailUnconfirmed =
    error.code === "email_not_confirmed" || error.message?.toLowerCase().includes("email not confirmed");

  if (isEmailUnconfirmed) {
    return {
      message: "Please confirm your email before signing in. Check your inbox and spam folder.",
      canResendConfirmation: true
    };
  }

  return {
    message: "Login failed. Please check the email account and password.",
    canResendConfirmation: false
  };
}

export function readLocalAuthSession(): LocalAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as LocalAuthSession;
    if (session.role !== "customer" && session.role !== "merchant") return null;
    return session;
  } catch {
    return null;
  }
}
