import { NextResponse } from "next/server";
import { z } from "zod";
import { AFTER_SALES_CASE_STATUSES, eurToCents } from "@/lib/data-center/after-sales";
import { requireOwnerAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const centsNumber = z.number().finite().nonnegative().refine((value) => eurToCents(value) !== null, "Amount must have at most two decimal places.");
const patchSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(AFTER_SALES_CASE_STATUSES).optional(),
  responsibility: z.enum(["customer", "boxsofa", "carrier", "supplier", "unknown"]).nullable().optional(),
  refundAmountEur: centsNumber.nullable().optional(),
  internalNote: z.string().trim().max(4000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional()
}).strict().refine((value) => Object.keys(value).some((key) => key !== "version"), "At least one change is required.");

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

export async function PATCH(request: Request, { params }: { params: { caseId: string } }) {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const access = await requireOwnerAccess();
  if (!access.ok) return accessFailure(access.reason);
  if (!uuidSchema.safeParse(params.caseId).success) {
    return NextResponse.json({ ok: false, message: "Invalid after-sales case ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const payload = patchSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ ok: false, message: "Invalid after-sales case update." }, { status: 400 });
  }

  const update = payload.data;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("update_after_sales_case", {
    p_case_id: params.caseId,
    p_actor_id: access.userId,
    p_expected_version: update.version,
    p_status: update.status ?? null,
    p_responsibility: update.responsibility ?? null,
    p_responsibility_set: Object.hasOwn(update, "responsibility"),
    p_refund_amount_cents: update.refundAmountEur === null ? null : eurToCents(update.refundAmountEur ?? 0),
    p_refund_amount_set: Object.hasOwn(update, "refundAmountEur"),
    p_internal_note: update.internalNote ?? null,
    p_internal_note_set: Object.hasOwn(update, "internalNote"),
    p_due_at: update.dueAt ?? null,
    p_due_at_set: Object.hasOwn(update, "dueAt")
  });
  if (error) {
    return NextResponse.json({ ok: false, message: "Could not update after-sales case." }, { status: 500 });
  }
  const result = data?.[0] as Record<string, unknown> | undefined;
  if (!result) return NextResponse.json({ ok: false, message: "Could not update after-sales case." }, { status: 500 });
  if (result.ok !== true) {
    const status = result.error_code === "not_found" ? 404 : result.error_code === "conflict" ? 409 : 400;
    return NextResponse.json({ ok: false, message: "After-sales case update was rejected.", code: result.error_code }, { status });
  }
  return NextResponse.json({ ok: true, mode: "supabase", case: mapCase(result) });
}
