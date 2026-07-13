import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const updateReviewSchema = z.object({
  pinned: z.boolean().optional(),
  deleted: z.boolean().optional()
});

type RouteContext = {
  params: {
    reviewId: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const payload = updateReviewSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Review update information is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const patch = payload.data;
  const reviewUpdate: Record<string, boolean | string | null> = {};
  if (patch.pinned !== undefined) reviewUpdate.is_pinned = patch.pinned;
  if (patch.deleted !== undefined) {
    reviewUpdate.is_visible = !patch.deleted;
    reviewUpdate.deleted_at = patch.deleted ? new Date().toISOString() : null;
  }

  if (Object.keys(reviewUpdate).length === 0) {
    return NextResponse.json({ ok: true, mode: "supabase" });
  }

  const supabase = createSupabaseServiceRoleClient();
  const reviewId = decodeURIComponent(params.reviewId);
  const { data: existingReview, error: reviewLoadError } = await supabase
    .from("product_reviews")
    .select("id, is_pinned, is_visible, deleted_at")
    .eq("id", reviewId)
    .single();

  if (reviewLoadError || !existingReview) {
    return NextResponse.json(
      { ok: false, message: "Review not found.", detail: reviewLoadError?.message },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from("product_reviews")
    .update(reviewUpdate)
    .eq("id", reviewId);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not update review.", detail: error.message },
      { status: 500 }
    );
  }

  await writeAdminAuditLog(supabase, {
    actorId: adminAccess.userId,
    action: patch.deleted ? "review_delete" : patch.pinned !== undefined ? "review_pin_update" : "review_update",
    entityType: "product_review",
    entityId: reviewId,
    beforeData: existingReview,
    afterData: reviewUpdate
  });

  return NextResponse.json({ ok: true, mode: "supabase" });
}
