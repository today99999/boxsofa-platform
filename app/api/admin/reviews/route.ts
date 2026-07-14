import { NextResponse } from "next/server";
import { products } from "@/lib/catalog";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  product_id: string | null;
  customer_name: string;
  rating: number;
  body: string;
  is_pinned: boolean;
  is_visible: boolean;
  created_at: string;
  deleted_at: string | null;
  products?: { slug: string | null } | Array<{ slug: string | null }> | null;
};

function splitReviewBody(body: string) {
  const [country, ...commentParts] = body.split("|").map((part) => part.trim());
  return {
    country: commentParts.length > 0 ? country : "",
    comment: commentParts.length > 0 ? commentParts.join(" | ") : body
  };
}

function productSlugFromRow(row: ReviewRow) {
  const relation = Array.isArray(row.products) ? row.products[0] : row.products;
  return relation?.slug || "";
}

function mapReview(row: ReviewRow) {
  const productSlug = productSlugFromRow(row);
  const product = products.find((item) => item.slug === productSlug);
  const body = splitReviewBody(row.body);

  return {
    id: row.id,
    styleId: product?.styleId || productSlug || row.product_id || row.id,
    productSlug: productSlug || product?.slug || "",
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
    .from("product_reviews")
    .select("id, product_id, customer_name, rating, body, is_pinned, is_visible, created_at, deleted_at, products(slug)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not load reviews.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mode: "supabase", reviews: (data as ReviewRow[]).map(mapReview) });
}
