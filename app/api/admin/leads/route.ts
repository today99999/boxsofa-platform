import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ChatMessageRow = {
  id: string;
  sender_type: "customer" | "owner" | "service" | "system";
  body: string;
  created_at: string;
};

type ChatThreadRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  chat_messages: ChatMessageRow[];
};

function extractLine(body: string, label: string) {
  const line = body.split("\n").find((item) => item.toLowerCase().startsWith(label.toLowerCase() + ":"));
  return line?.slice(label.length + 1).trim() || "";
}

function extractMessage(body: string) {
  const marker = "Message:\n";
  const index = body.indexOf(marker);
  return index >= 0 ? body.slice(index + marker.length).trim() : body;
}

function mapLead(thread: ChatThreadRow) {
  const messages = (thread.chat_messages || []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const leadMessage = messages.find((message) => message.body.includes("[Sales lead]"));
  if (!leadMessage) return null;
  const lastMessage = messages.at(-1);

  return {
    id: thread.id,
    customerName: thread.customer_name || extractLine(leadMessage.body, "Name") || "Guest",
    customerEmail: thread.customer_email || extractLine(leadMessage.body, "Email"),
    phone: extractLine(leadMessage.body, "Phone"),
    intent: extractLine(leadMessage.body, "Intent") || "Sales lead",
    preferredContact: extractLine(leadMessage.body, "Preferred contact"),
    productName: extractLine(leadMessage.body, "Product"),
    productSlug: extractLine(leadMessage.body, "Product slug"),
    cartSummary: extractLine(leadMessage.body, "Cart"),
    source: extractLine(leadMessage.body, "Source") || "site",
    pageUrl: extractLine(leadMessage.body, "Page"),
    message: extractMessage(leadMessage.body),
    status: thread.status,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    needsReply: thread.status === "open" && lastMessage?.sender_type === "customer",
    automationNote: messages.find((message) => message.body.includes("[Lead automation]"))?.body || ""
  };
}

export async function GET() {
  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Admin access required." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, customer_name, customer_email, status, created_at, updated_at, chat_messages(id, sender_type, body, created_at)")
    .order("updated_at", { ascending: false })
    .limit(120);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not load sales leads.", detail: error.message },
      { status: 500 }
    );
  }

  const leads = ((data || []) as ChatThreadRow[])
    .map(mapLead)
    .filter((lead): lead is NonNullable<ReturnType<typeof mapLead>> => Boolean(lead));

  return NextResponse.json({ ok: true, mode: "supabase", leads });
}
