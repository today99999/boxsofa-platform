const safeProviders = new Set(["pending", "resend", "not_configured"]);
const safeErrors = new Set([
  "email_provider_failed",
  "email_provider_not_configured",
  "email_provider_timeout",
  "email_provider_ambiguity_window_expired"
]);

function value(input: Record<string, unknown>, snake: string, camel: string) {
  return input[snake] ?? input[camel];
}

function safeError(raw: unknown) {
  if (typeof raw !== "string" || !raw) return undefined;
  return safeErrors.has(raw) ? raw : "email_provider_failed";
}

export function emailNotificationAuditSnapshot(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const provider = value(input, "provider", "provider");
  const snapshot = {
    notificationId: value(input, "id", "notificationId"),
    orderNumber: value(input, "order_number", "orderNumber"),
    event: value(input, "event", "event"),
    status: value(input, "status", "status"),
    attempts: value(input, "attempts", "attempts"),
    provider: typeof provider === "string" && safeProviders.has(provider) ? provider : "unknown",
    lastError: safeError(value(input, "last_error", "lastError")),
    sentAt: value(input, "sent_at", "sentAt"),
    createdAt: value(input, "created_at", "createdAt"),
    updatedAt: value(input, "updated_at", "updatedAt")
  };
  return Object.fromEntries(Object.entries(snapshot).filter(([, item]) => item !== null && item !== undefined));
}
