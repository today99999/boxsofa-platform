import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const createThreadSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  body: z.string().trim().min(1).max(2000)
});

const appendMessageSchema = z.object({
  threadId: z.string().trim().min(1),
  accessToken: z.string().trim().min(20).optional(),
  body: z.string().trim().min(1).max(2000)
});

const getThreadSchema = z.object({
  threadId: z.string().trim().min(1),
  accessToken: z.string().trim().min(20)
});

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

function createAccessToken() {
  return randomBytes(32).toString("base64url");
}

function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payload = getThreadSchema.safeParse({
    threadId: searchParams.get("threadId"),
    accessToken: searchParams.get("accessToken")
  });

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Support conversation access is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: true, mode: "local", thread: null });
  }

  const { threadId, accessToken } = payload.data;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, customer_name, customer_email, status, created_at, updated_at, chat_messages(id, sender_type, body, created_at)")
    .eq("id", threadId)
    .eq("customer_access_token_hash", hashAccessToken(accessToken))
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, message: "Could not load support conversation.", detail: error?.message },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, mode: "supabase", thread: mapThread(data as ChatThreadRow) });
}

export async function POST(request: Request) {
  const payload = createThreadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Support message is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const supabase = createSupabaseServiceRoleClient();
  const support = payload.data;
  const accessToken = createAccessToken();
  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .insert({
      customer_name: support.customerName,
      customer_email: support.customerEmail || null,
      customer_access_token_hash: hashAccessToken(accessToken),
      status: "open"
    })
    .select("id")
    .single();

  if (threadError || !thread) {
    return NextResponse.json(
      { ok: false, message: "Could not create support conversation.", detail: threadError?.message },
      { status: 500 }
    );
  }

  const { error: messageError } = await supabase.from("chat_messages").insert({
    thread_id: thread.id,
    sender_type: "customer",
    body: support.body
  });

  if (messageError) {
    return NextResponse.json(
      { ok: false, message: "Could not save support message.", detail: messageError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mode: "supabase", threadId: thread.id, accessToken });
}

export async function PATCH(request: Request) {
  const payload = appendMessageSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Support reply is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { threadId, accessToken, body } = payload.data;
  if (!accessToken) {
    return NextResponse.json({ ok: false, message: "Support conversation access token is required." }, { status: 401 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("customer_access_token_hash", hashAccessToken(accessToken))
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ ok: false, message: "Support conversation access denied." }, { status: 403 });
  }

  const { error } = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    sender_type: "customer",
    body
  });

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not save support reply.", detail: error.message },
      { status: 500 }
    );
  }

  await supabase.from("chat_threads").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", threadId);

  return NextResponse.json({ ok: true, mode: "supabase" });
}
