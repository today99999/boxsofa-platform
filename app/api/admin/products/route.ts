import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const updateProductSchema = z.object({
  productId: z.string().trim().min(1),
  priceEur: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().optional(),
  active: z.boolean().optional()
});

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
    .from("products")
    .select("sku, price_eur, stock, reserved_stock, is_active")
    .order("sku", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not load products.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    products: (data || []).map((product) => ({
      productId: product.sku,
      priceEur: Number(product.price_eur),
      stock: product.stock,
      reservedStock: product.reserved_stock ?? 0,
      availableStock: Math.max(0, product.stock - (product.reserved_stock ?? 0)),
      active: product.is_active
    }))
  });
}

export async function PATCH(request: Request) {
  const payload = updateProductSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Product update information is incomplete.", issues: payload.error.flatten() },
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
  const productUpdate: Record<string, number | boolean> = {};
  if (patch.priceEur !== undefined) productUpdate.price_eur = patch.priceEur;
  if (patch.stock !== undefined) productUpdate.stock = patch.stock;
  if (patch.active !== undefined) productUpdate.is_active = patch.active;

  if (Object.keys(productUpdate).length === 0) {
    return NextResponse.json({ ok: true, mode: "supabase" });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: existingProduct, error: productLoadError } = await supabase
    .from("products")
    .select("id, sku, price_eur, stock, reserved_stock, is_active")
    .eq("sku", patch.productId)
    .single();

  if (productLoadError || !existingProduct) {
    return NextResponse.json(
      { ok: false, message: "Product not found.", detail: productLoadError?.message },
      { status: 404 }
    );
  }

  if (patch.stock !== undefined && patch.stock < (existingProduct.reserved_stock ?? 0)) {
    return NextResponse.json(
      { ok: false, message: "Stock cannot be lower than reserved stock." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase.from("products").update(productUpdate).eq("id", existingProduct.id);

  if (updateError) {
    return NextResponse.json(
      { ok: false, message: "Could not update product.", detail: updateError.message },
      { status: 500 }
    );
  }

  if (patch.stock !== undefined && patch.stock !== existingProduct.stock) {
    const { error: movementError } = await supabase.from("inventory_movements").insert({
      product_id: existingProduct.id,
      movement_type: "manual_adjust",
      quantity_delta: patch.stock - existingProduct.stock,
      stock_after: patch.stock,
      reason: "Admin product operations update",
      created_by: adminAccess.userId
    });

    if (movementError) {
      return NextResponse.json(
        { ok: false, message: "Product updated, but inventory movement could not be saved.", detail: movementError.message },
        { status: 500 }
      );
    }
  }

  await writeAdminAuditLog(supabase, {
    actorId: adminAccess.userId,
    action: "product_update",
    entityType: "product",
    entityId: existingProduct.id,
    beforeData: {
      sku: existingProduct.sku,
      priceEur: existingProduct.price_eur,
      stock: existingProduct.stock,
      reservedStock: existingProduct.reserved_stock ?? 0,
      active: existingProduct.is_active
    },
    afterData: {
      sku: existingProduct.sku,
      ...productUpdate
    }
  });

  return NextResponse.json({ ok: true, mode: "supabase" });
}
