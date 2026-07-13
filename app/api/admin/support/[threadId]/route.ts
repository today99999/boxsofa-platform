import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const updateThreadSchema = z.object({
  body: z.string().trim().min(1).max(2000).optional(),
  status: z.enum(["open", "closed"]).optional()
});

type RouteContext = {
  params: {
    threadId: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const payload = updateThreadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Support update is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const patch = payload.data;
  const threadId = decodeURIComponent(params.threadId);
  const supabase = createSupabaseServiceRoleClient();

  if (patch.body) {
    const { error: messageError } = await supabase.from("chat_messages").insert({
      thread_id: threadId,
      sender_type: adminAccess.role === "owner" ? "owner" : "service",
      sender_id: adminAccess.userId,
      body: patch.body
    });

    if (messageError) {
      return NextResponse.json(
        { ok: false, message: "Could not save support reply.", detail: messageError.message },
        { status: 500 }
      );
    }

    const { error: touchError } = await supabase
      .from("chat_threads")
      .update({
        status: "open",
        assigned_to: adminAccess.userId,
        updated_at: new Date().toISOString()
      })
      .eq("id", threadId);

    if (touchError) {
      return NextResponse.json(
        { ok: false, message: "Could not update support conversation.", detail: touchError.message },
        { status: 500 }
      );
    }
  }

  if (patch.status) {
    const { error: threadError } = await supabase
      .from("chat_threads")
      .update({
        status: patch.status,
        assigned_to: adminAccess.userId
      })
      .eq("id", threadId);

    if (threadError) {
      return NextResponse.json(
        { ok: false, message: "Could not update support conversation.", detail: threadError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, mode: "supabase" });
}
