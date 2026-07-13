import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabasePublicConfig,
  hasSupabaseServiceRoleConfig
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const createReviewSchema = z.object({
  productSlug: z.string().trim().min(1),
  styleId: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  country: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(3),
  locale: z.enum(["zh", "en", "es", "fr", "de"]).default("en")
});

export async function POST(request: Request) {
  const payload = createReviewSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Review information is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const review = payload.data;
  if (!hasSupabasePublicConfig()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const authSupabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await authSupabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, message: "Please sign in before leaving a review." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, style_id")
    .eq("slug", review.productSlug)
    .single();

  if (productError || !product) {
    return NextResponse.json(
      { ok: false, message: "Product not found.", detail: productError?.message },
      { status: 404 }
    );
  }

  const { data: purchasedOrder, error: purchaseError } = await supabase
    .from("orders")
    .select("id, order_items!inner(slug)")
    .eq("customer_id", user.id)
    .eq("order_items.slug", review.productSlug)
    .in("status", ["paid_confirmed", "processing", "shipped", "completed"])
    .limit(1)
    .maybeSingle();

  if (purchaseError) {
    return NextResponse.json(
      { ok: false, message: "Could not verify purchase history.", detail: purchaseError.message },
      { status: 500 }
    );
  }

  if (!purchasedOrder) {
    return NextResponse.json(
      { ok: false, message: "Only customers who have purchased this product can leave a review." },
      { status: 403 }
    );
  }

  const { error: reviewError } = await supabase.from("product_reviews").insert({
    product_id: product.id,
    style_id: product.style_id,
    order_id: purchasedOrder.id,
    customer_id: user.id,
    customer_name: review.customerName,
    rating: review.rating,
    body: `${review.country} | ${review.comment}`,
    locale: review.locale,
    is_pinned: false,
    is_visible: true
  });

  if (reviewError) {
    return NextResponse.json(
      { ok: false, message: "Could not save review.", detail: reviewError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mode: "supabase" });
}
