export const AUTH_SESSION_KEY = "boxsofa_auth_session_v1";

export type LocalAuthSession = {
  account: string;
  role: "customer" | "merchant";
  loggedInAt: string;
  source?: "local" | "supabase";
};

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
