import { NextResponse } from "next/server";
import { normalizeOwnerSearchQuery, quotePostgrestIlikeValue } from "@/lib/data-center/universal-search";
import { requireOwnerAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchResult = {
  id: string;
  kind: "order" | "customer" | "product" | "after-sales";
  title: string;
  subtitle: string;
  href: string;
};

function accessFailure(cause: string) {
  if (cause === "supabase_not_configured") {
    return NextResponse.json({ ok: false, message: "Search is not configured." }, { status: 503 });
  }
  const forbidden = cause === "not_authorized";
  return NextResponse.json(
    { ok: false, message: forbidden ? "Owner access is required." : "Merchant login is required." },
    { status: forbidden ? 403 : 401 }
  );
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function GET(request: Request) {
  const access = await requireOwnerAccess();
  if (!access.ok) return accessFailure(access.reason);

  const query = normalizeOwnerSearchQuery(new URL(request.url).searchParams.get("q"));
  if (!query.ok) {
    return NextResponse.json({ ok: false, message: "Search query must contain 2 to 100 characters." }, { status: 400 });
  }

  const pattern = quotePostgrestIlikeValue(query.value);
  const supabase = createSupabaseServiceRoleClient();
  const [orders, customers, products, afterSales] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, customer_name, status")
      .or(`order_number.ilike.${pattern},customer_name.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "customer")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("products")
      .select("id, sku, slug, name_en, name_zh")
      .or(`sku.ilike.${pattern},slug.ilike.${pattern},name_en.ilike.${pattern},name_zh.ilike.${pattern}`)
      .order("sku", { ascending: true })
      .limit(8),
    supabase
      .from("after_sales_cases")
      .select("id, case_number, status")
      .or(`case_number.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  if (orders.error || customers.error || products.error || afterSales.error) {
    return NextResponse.json({ ok: false, message: "Search is temporarily unavailable." }, { status: 503 });
  }

  const results: SearchResult[] = [
    ...(orders.data ?? []).map((item) => ({
      id: String(item.id),
      kind: "order" as const,
      title: text(item.order_number, "Order"),
      subtitle: [text(item.customer_name), text(item.status)].filter(Boolean).join(" · "),
      href: "/data-center?section=orders"
    })),
    ...(customers.data ?? []).map((item) => ({
      id: String(item.id),
      kind: "customer" as const,
      title: text(item.full_name, text(item.email, "Customer")),
      subtitle: text(item.email),
      href: "/data-center?section=customers"
    })),
    ...(products.data ?? []).map((item) => ({
      id: String(item.id),
      kind: "product" as const,
      title: text(item.sku, "Product"),
      subtitle: text(item.name_en, text(item.name_zh, text(item.slug))),
      href: "/data-center?section=products"
    })),
    ...(afterSales.data ?? []).map((item) => ({
      id: String(item.id),
      kind: "after-sales" as const,
      title: text(item.case_number, "After-sales case"),
      subtitle: text(item.status),
      href: "/data-center?section=after-sales"
    }))
  ];

  return NextResponse.json({ ok: true, results });
}
