type EmailSendInput = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
};

type EmailSendResult = {
  ok: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
};

type EmailProviderStatus = {
  configured: boolean;
  provider: string;
  issues: string[];
};

function isLikelyEmailAddress(value: string) {
  const emailMatch = value.match(/<([^>]+)>$/);
  const email = (emailMatch?.[1] || value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

export function getEmailProviderStatus(): EmailProviderStatus {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "";
  const from = process.env.EMAIL_FROM?.trim() || "";
  const apiKey = process.env.EMAIL_API_KEY?.trim() || "";
  const issues: string[] = [];

  if (!provider) {
    issues.push("EMAIL_PROVIDER is missing.");
  } else if (provider !== "resend") {
    issues.push(`EMAIL_PROVIDER must be resend. Current value: ${provider}.`);
  }

  if (!from) {
    issues.push("EMAIL_FROM is missing.");
  } else if (!isLikelyEmailAddress(from)) {
    issues.push("EMAIL_FROM must be a valid email address or Sender <email@example.com> value.");
  }

  if (!apiKey) {
    issues.push("EMAIL_API_KEY is missing.");
  } else if (apiKey.length < 20) {
    issues.push("EMAIL_API_KEY looks too short.");
  }

  return {
    configured: issues.length === 0,
    provider: provider || "not_configured",
    issues
  };
}

export function hasEmailProviderConfig() {
  return getEmailProviderStatus().configured;
}

export async function sendTransactionalEmail(input: EmailSendInput): Promise<EmailSendResult> {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const from = process.env.EMAIL_FROM;
  const apiKey = process.env.EMAIL_API_KEY;

  if (!provider || !from || !apiKey) {
    return {
      ok: false,
      provider: provider || "not_configured",
      error: "email_provider_not_configured"
    };
  }

  if (provider !== "resend") {
    return {
      ok: false,
      provider,
      error: "email_provider_unsupported"
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {})
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text
    })
  });

  if (!response.ok) {
    return {
      ok: false,
      provider,
      error: `email_provider_http_error:${response.status}`
    };
  }

  const body = await response.json().catch(() => null) as { id?: string } | null;
  return {
    ok: true,
    provider,
    providerMessageId: body?.id
  };
}
