import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

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

function mapThread(thread: ChatThreadRow) {
  return {
    id: thread.id,
    customerName: thread.customer_name || "Guest",
    customerEmail: thread.customer_email || "",
    status: thread.status,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    messages: (thread.chat_messages || [])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((message) => ({
        id: message.id,
        sender: message.sender_type === "owner" ? "service" : message.sender_type,
        body: message.body,
        createdAt: message.created_at
      }))
  };
}

export async function GET() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, customer_name, customer_email, status, created_at, updated_at, chat_messages(id, sender_type, body, created_at)")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not load support conversations.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mode: "supabase", threads: ((data || []) as ChatThreadRow[]).map(mapThread) });
}
