import { NextResponse } from "next/server";
import { getEmailProviderStatus, hasEmailProviderConfig } from "@/lib/server/email-provider";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>
) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
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
  const emailProviderStatus = getEmailProviderStatus();

  try {
    const [
      customerProfiles,
      merchantProfiles,
      pendingOrders,
      lowStockProducts,
      queuedEmailNotifications,
      failedEmailNotifications,
      openSupportThreads
    ] = await Promise.all([
      countRows(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer")),
      countRows(supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["owner", "service"])),
      countRows(supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_confirm")),
      countRows(supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).lte("stock", 10)),
      countRows(supabase.from("email_notifications").select("id", { count: "exact", head: true }).eq("status", "queued")),
      countRows(supabase.from("email_notifications").select("id", { count: "exact", head: true }).eq("status", "failed")),
      countRows(supabase.from("chat_threads").select("id", { count: "exact", head: true }).eq("status", "open"))
    ]);

    return NextResponse.json({
      ok: true,
      mode: "supabase",
      readiness: {
        customerProfiles,
        merchantProfiles,
        pendingOrders,
        lowStockProducts,
        queuedEmailNotifications,
        failedEmailNotifications,
        openSupportThreads,
        needsReplySupportThreads: openSupportThreads,
        customerOrdersProtected: true,
        adminApisProtected: true,
        emailProviderConfigured: hasEmailProviderConfig(),
        emailProviderStatus,
        emailProviderIssues: emailProviderStatus.issues
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "Could not load launch readiness summary.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
