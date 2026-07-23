import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { sendTransactionalEmail } from "@/lib/server/email-provider";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(80).optional().or(z.literal("")),
  preferredContact: z.enum(["email", "phone", "whatsapp", "messenger"]),
  intent: z.enum(["fit_check", "delivery", "material", "price", "other"]),
  message: z.string().trim().min(1).max(2000),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  pageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  productSlug: z.string().trim().max(160).optional().or(z.literal("")),
  productName: z.string().trim().max(220).optional().or(z.literal("")),
  cartSummary: z.string().trim().max(1200).optional().or(z.literal("")),
  consent: z.literal(true),
  website: z.string().trim().max(0).optional().or(z.literal(""))
}).refine((lead) => Boolean(lead.email || lead.phone), {
  message: "Please leave an email or phone number so BoxSofa can reply.",
  path: ["email"]
});

const intentLabels: Record<z.infer<typeof leadSchema>["intent"], string> = {
  fit_check: "Fit check",
  delivery: "Delivery",
  material: "Material",
  price: "Price",
  other: "Other"
};

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function buildLeadBody(lead: z.infer<typeof leadSchema>) {
  return [
    "[Sales lead]",
    `Intent: ${intentLabels[lead.intent]}`,
    `Preferred contact: ${lead.preferredContact}`,
    `Name: ${lead.name}`,
    `Email: ${lead.email || "-"}`,
    `Phone: ${lead.phone || "-"}`,
    `Product: ${lead.productName || "-"}`,
    `Product slug: ${lead.productSlug || "-"}`,
    `Cart: ${lead.cartSummary || "-"}`,
    `Source: ${lead.source || "site"}`,
    `Page: ${lead.pageUrl || "-"}`,
    "Message:",
    lead.message
  ].join("\n");
}

function buildOwnerEmail(lead: z.infer<typeof leadSchema>, threadId: string) {
  return [
    "New BoxSofa sales lead",
    "",
    `Name: ${lead.name}`,
    `Email: ${lead.email || "-"}`,
    `Phone: ${lead.phone || "-"}`,
    `Preferred contact: ${lead.preferredContact}`,
    `Intent: ${intentLabels[lead.intent]}`,
    `Product: ${lead.productName || "-"}`,
    `Cart: ${lead.cartSummary || "-"}`,
    `Source: ${lead.source || "site"}`,
    `Page: ${lead.pageUrl || "-"}`,
    `Thread ID: ${threadId}`,
    "",
    "Customer message:",
    lead.message,
    "",
    "Suggested first reply:",
    "Hi, thanks for checking BoxSofa. If stairs, lift or doorway size is your main concern, send us the width and height and we will help confirm whether this compressed sofa is a good fit."
  ].join("\n");
}

function buildCustomerEmail(lead: z.infer<typeof leadSchema>) {
  return [
    `Hi ${lead.name},`,
    "",
    "Thanks for contacting BoxSofa. We received your request and will help you check the details before you order.",
    "",
    "If stairs, lift or doorway size is your main concern, you can reply with the width, height and any tight turns. We will help confirm fit.",
    "",
    "Useful details:",
    "- Free basic delivery across Europe",
    "- Secure Stripe card payment",
    "- Estimated delivery: 23-30 working days",
    "- Support: info@boxsofa.eu",
    "",
    "BoxSofa Europe",
    "https://boxsofa.eu"
  ].join("\n");
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, { key: "leads:create", limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.resetAt);
  }

  const payload = leadSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Lead details are incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  const lead = payload.data;
  if (lead.website) {
    return NextResponse.json({ ok: true, mode: "ignored" });
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .insert({
      customer_name: lead.name,
      customer_email: cleanOptional(lead.email),
      status: "open"
    })
    .select("id")
    .single();

  if (threadError || !thread) {
    return NextResponse.json(
      { ok: false, message: "Could not save the lead.", detail: threadError?.message },
      { status: 500 }
    );
  }

  const { error: messageError } = await supabase.from("chat_messages").insert({
    thread_id: thread.id,
    sender_type: "customer",
    body: buildLeadBody(lead)
  });

  if (messageError) {
    return NextResponse.json(
      { ok: false, message: "Could not save the lead message.", detail: messageError.message },
      { status: 500 }
    );
  }

  const ownerEmail = process.env.LEAD_NOTIFY_EMAIL || process.env.SUPPORT_EMAIL || "info@boxsofa.eu";
  const ownerEmailResult = await sendTransactionalEmail({
    to: ownerEmail,
    subject: `New BoxSofa lead: ${intentLabels[lead.intent]}${lead.productName ? ` - ${lead.productName}` : ""}`,
    text: buildOwnerEmail(lead, thread.id)
  });

  const customerEmailResult = lead.email
    ? await sendTransactionalEmail({
        to: lead.email,
        subject: "BoxSofa received your request",
        text: buildCustomerEmail(lead)
      })
    : null;

  await supabase.from("chat_messages").insert({
    thread_id: thread.id,
    sender_type: "system",
    body: [
      "[Lead automation]",
      `Owner email: ${ownerEmailResult.ok ? "sent" : `failed - ${ownerEmailResult.error || "unknown"}`}`,
      `Customer follow-up: ${
        customerEmailResult ? (customerEmailResult.ok ? "sent" : `failed - ${customerEmailResult.error || "unknown"}`) : "skipped - no email"
      }`
    ].join("\n")
  });

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    leadId: thread.id,
    ownerEmailSent: ownerEmailResult.ok,
    customerEmailSent: customerEmailResult?.ok ?? false
  });
}
