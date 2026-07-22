"use client";

import { FormEvent, useState } from "react";

type LeadCaptureProps = {
  source: "product" | "cart";
  productSlug?: string;
  productName?: string;
  cartSummary?: string;
};

type LeadForm = {
  name: string;
  email: string;
  phone: string;
  preferredContact: "email" | "phone" | "whatsapp" | "messenger";
  intent: "fit_check" | "delivery" | "material" | "price" | "other";
  message: string;
  consent: boolean;
  website: string;
};

const intentOptions = [
  { value: "fit_check", label: "Check stairs / lift fit" },
  { value: "delivery", label: "Delivery timing" },
  { value: "material", label: "Material and comfort" },
  { value: "price", label: "Price and payment" },
  { value: "other", label: "Other question" }
] as const;

const emptyForm: LeadForm = {
  name: "",
  email: "",
  phone: "",
  preferredContact: "email",
  intent: "fit_check",
  message: "",
  consent: false,
  website: ""
};

export function LeadCapture({ source, productSlug, productName, cartSummary }: LeadCaptureProps) {
  const [form, setForm] = useState<LeadForm>({
    ...emptyForm,
    message:
      source === "cart"
        ? "I am interested in these items. Please help me confirm delivery and whether the sofa will fit my home."
        : "Please help me check whether this compressed sofa will fit my stairs, lift or doorway."
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  function update<Field extends keyof LeadForm>(field: Field, value: LeadForm[Field]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    if (!form.email.trim() && !form.phone.trim()) {
      setStatus("error");
      setMessage("Please leave an email or phone number so BoxSofa can reply.");
      return;
    }

    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source,
          productSlug,
          productName,
          cartSummary,
          pageUrl: window.location.href
        })
      });
      const result = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Could not send your request.");
      }

      setStatus("sent");
      setMessage("Thanks. We received your request and will help you check the details.");
      setForm((current) => ({ ...emptyForm, preferredContact: current.preferredContact, intent: current.intent, message: "" }));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not send your request.");
    }
  }

  return (
    <section className="lead-capture-panel" aria-labelledby={`${source}-lead-title`}>
      <div className="lead-capture-copy">
        <span>Need help choosing?</span>
        <h2 id={`${source}-lead-title`}>Check if it fits before you order</h2>
        <p>
          Send your stairs, lift or doorway question. BoxSofa will help confirm fit, delivery and the best model for your home.
        </p>
      </div>
      <form className="lead-capture-form" onSubmit={submitLead}>
        <div className="lead-form-grid">
          <label>
            Name
            <input required value={form.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
          </label>
          <label>
            Phone / WhatsApp
            <input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
          </label>
          <label>
            Preferred contact
            <select value={form.preferredContact} onChange={(event) => update("preferredContact", event.target.value as LeadForm["preferredContact"])}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone</option>
              <option value="messenger">Messenger</option>
            </select>
          </label>
        </div>
        <label>
          Main question
          <select value={form.intent} onChange={(event) => update("intent", event.target.value as LeadForm["intent"])}>
            {intentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Message
          <textarea
            required
            rows={4}
            value={form.message}
            onChange={(event) => update("message", event.target.value)}
          />
        </label>
        <label className="lead-consent">
          <input
            checked={form.consent}
            required
            type="checkbox"
            onChange={(event) => update("consent", event.target.checked)}
          />
          I agree that BoxSofa can contact me about this request.
        </label>
        <input
          aria-hidden="true"
          className="lead-website-field"
          tabIndex={-1}
          value={form.website}
          onChange={(event) => update("website", event.target.value)}
        />
        {message ? <p className={status === "error" ? "form-error" : "inline-note"}>{message}</p> : null}
        <button className="button primary" disabled={status === "sending"} type="submit">
          {status === "sending" ? "Sending..." : "Send fit check"}
        </button>
      </form>
    </section>
  );
}
