import { NextResponse } from "next/server";
import { CUSTOMER_ORDER_WITH_ITEMS_SELECT, type OrderRow, toLocalOrder } from "@/lib/server/orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function hasSupabasePublicConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function GET() {
  if (!hasSupabasePublicConfig()) {
    return NextResponse.json({ ok: true, mode: "local", orders: [] });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, mode: "supabase", message: "Customer login is required.", orders: [] }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select(CUSTOMER_ORDER_WITH_ITEMS_SELECT)
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, message: "Could not load customer orders.", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: "supabase", orders: (data as OrderRow[]).map((order) => {
      const localOrder = toLocalOrder(order);
      delete localOrder.internalNote;
      return localOrder;
    }) });
}
