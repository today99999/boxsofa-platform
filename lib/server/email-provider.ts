type EmailSendInput = {
  to: string;
  subject: string;
  text: string;
};

type EmailSendResult = {
  ok: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
};

export function hasEmailProviderConfig() {
  return Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_FROM && process.env.EMAIL_API_KEY);
}

export async function sendTransactionalEmail(input: EmailSendInput): Promise<EmailSendResult> {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const from = process.env.EMAIL_FROM;
  const apiKey = process.env.EMAIL_API_KEY;

  if (!provider || !from || !apiKey) {
    return {
      ok: false,
      provider: provider || "not_configured",
      error: "Email provider is not configured."
    };
  }

  if (provider !== "resend") {
    return {
      ok: false,
      provider,
      error: `Unsupported email provider: ${provider}.`
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text
    })
  });

  const body = await response.json().catch(() => null) as { id?: string; message?: string; error?: string } | null;

  if (!response.ok) {
    return {
      ok: false,
      provider,
      error: body?.message || body?.error || `Email provider returned ${response.status}.`
    };
  }

  return {
    ok: true,
    provider,
    providerMessageId: body?.id
  };
}
