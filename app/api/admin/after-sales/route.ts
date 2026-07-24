import { NextResponse } from "next/server";
import { z } from "zod";
import { AFTER_SALES_CASE_STATUSES, AFTER_SALES_CASE_TYPES } from "@/lib/data-center/after-sales";
import { requireOwnerAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const createCaseSchema = z.object({
  orderNumber: z.string().trim().min(3).max(80),
  type: z.enum(AFTER_SALES_CASE_TYPES),
  reason: z.string().trim().min(5).max(4000),
  requestedRemedy: z.string().trim().max(1000).optional(),
  dueAt: z.string().datetime({ offset: true }).optional()
}).strict();

function accessFailure(reason: string) {
  const forbidden = reason === "not_authorized";
  return NextResponse.json(
    { ok: false, message: forbidden ? "Owner access is required." : "Merchant login is required." },
    { status: forbidden ? 403 : 401 }
  );
}

function mapCase(row: Record<string, unknown>) {
  return {
    id: row.id,
    caseNumber: row.case_number,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    type: row.case_type,
    status: row.status,
    reason: row.reason,
    responsibility: row.responsibility,
    requestedRemedy: row.requested_remedy,
    dueAt: row.due_at,
    refundAmountEur: row.refund_amount_eur === null ? null : Number(row.refund_amount_eur),
    internalNote: row.internal_note,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}

export async function GET(request: Request) {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const access = await requireOwnerAccess();
  if (!access.ok) return accessFailure(access.reason);

  const url = new URL(request.url);
  const limit = positiveInteger(url.searchParams.get("limit"), 50, 200);
  const offset = positiveInteger(url.searchParams.get("offset"), 0, 1000000);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search")?.trim() ?? "";
  if (limit === null || offset === null || (status !== null && !AFTER_SALES_CASE_STATUSES.includes(status as never)) || search.length > 80) {
    return NextResponse.json({ ok: false, message: "Invalid after-sales filters." }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  let query = supabase
    .from("after_sales_cases")
    .select("id, case_number, case_type, status, responsibility, requested_remedy, reason, due_at, refund_amount_eur, internal_note, version, created_at, updated_at, orders!inner(order_number, customer_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq("status", status);
  if (search) query = query.or(`case_number.ilike.%${search.replace(/[,%()]/g, "")}%`);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ ok: false, message: "Could not load after-sales cases." }, { status: 500 });
  }

  const cases = (data ?? []).map((row) => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    return mapCase({ ...row, order_number: order?.order_number ?? null, customer_name: order?.customer_name ?? null });
  });
  return NextResponse.json({ ok: true, mode: "supabase", cases, page: { offset, limit, total: count ?? 0 } });
}

export async function POST(request: Request) {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const access = await requireOwnerAccess();
  if (!access.ok) return accessFailure(access.reason);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const payload = createCaseSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ ok: false, message: "After-sales case information is incomplete." }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("create_after_sales_case", {
    p_order_number: payload.data.orderNumber,
    p_case_type: payload.data.type,
    p_reason: payload.data.reason,
    p_requested_remedy: payload.data.requestedRemedy ?? null,
    p_due_at: payload.data.dueAt ?? null,
    p_created_by: access.userId
  });
  if (error) {
    return NextResponse.json({ ok: false, message: "Could not create after-sales case." }, { status: 500 });
  }
  const created = data?.[0] as Record<string, unknown> | undefined;
  if (!created) {
    return NextResponse.json({ ok: false, message: "Order not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, mode: "supabase", case: mapCase(created) }, { status: 201 });
}
