import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabasePublicConfig,
  hasSupabaseServiceRoleConfig
} from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

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

function splitReviewBody(body: string) {
  const [country, ...commentParts] = body.split("|").map((part) => part.trim());
  return {
    country: commentParts.length > 0 ? country : "",
    comment: commentParts.length > 0 ? commentParts.join(" | ") : body
  };
}

function mapReview(row: {
  id: string;
  customer_name: string;
  rating: number;
  body: string;
  is_pinned: boolean;
  is_visible: boolean;
  created_at: string;
  deleted_at: string | null;
}, productSlug: string, styleId: string) {
  const body = splitReviewBody(row.body);
  return {
    id: row.id,
    styleId,
    productSlug,
    customerName: row.customer_name,
    country: body.country,
    rating: row.rating,
    comment: body.comment,
    createdAt: row.created_at,
    pinned: row.is_pinned,
    deleted: !row.is_visible || Boolean(row.deleted_at),
    source: "supabase" as const
  };
}

export async function GET(request: Request) {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const productSlug = searchParams.get("productSlug")?.trim();
  const styleId = searchParams.get("styleId")?.trim() || "";
  if (!productSlug) {
    return NextResponse.json({ ok: false, message: "Product slug is required." }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, style_id")
    .eq("slug", productSlug)
    .single();

  if (productError || !product) {
    return NextResponse.json(
      { ok: false, message: "Product not found.", detail: productError?.message },
      { status: 404 }
    );
  }

  const { data: reviews, error: reviewsError } = await supabase
    .from("product_reviews")
    .select("id, customer_name, rating, body, is_pinned, is_visible, created_at, deleted_at")
    .eq("style_id", product.style_id)
    .eq("is_visible", true)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (reviewsError) {
    return NextResponse.json(
      { ok: false, message: "Could not load reviews.", detail: reviewsError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    reviews: reviews.map((review) => mapReview(review, productSlug, styleId))
  });
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, { key: "reviews:create", limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.resetAt);
  }

  const payload = createReviewSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Review information is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const review = payload.data;
  if (!hasSupabasePublicConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
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

  const { data: savedReview, error: reviewError } = await supabase
    .from("product_reviews")
    .insert({
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
    })
    .select("id, customer_name, rating, body, is_pinned, is_visible, created_at, deleted_at")
    .single();

  if (reviewError) {
    return NextResponse.json(
      { ok: false, message: "Could not save review.", detail: reviewError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    review: mapReview(savedReview, review.productSlug, review.styleId)
  });
}
