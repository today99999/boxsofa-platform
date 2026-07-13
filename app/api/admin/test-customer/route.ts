import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TEST_CUSTOMER_EMAIL = "buyer-test@boxsofa.eu";
const TEST_CUSTOMER_NAME = "BoxSofa Test Buyer";

function createTemporaryPassword() {
  return `${randomBytes(12).toString("base64url")}Aa1!`;
}

async function findAuthUserByEmail(email: string) {
  const supabase = createSupabaseServiceRoleClient();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(error.message);

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }

  return null;
}

async function upsertCustomerProfile(userId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: TEST_CUSTOMER_EMAIL,
      full_name: TEST_CUSTOMER_NAME,
      role: "customer",
      preferred_locale: "zh"
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(error.message);
}

export async function POST() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json(
      { ok: false, mode: "local", message: "Supabase is not configured." },
      { status: 400 }
    );
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const existingProfile = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("email", TEST_CUSTOMER_EMAIL)
    .maybeSingle();

  if (existingProfile.error) {
    return NextResponse.json(
      { ok: false, message: "Could not check existing customer profile.", detail: existingProfile.error.message },
      { status: 500 }
    );
  }

  if (existingProfile.data) {
    await upsertCustomerProfile(existingProfile.data.id);
    return NextResponse.json({
      ok: true,
      mode: "supabase",
      created: false,
      email: TEST_CUSTOMER_EMAIL,
      message: "Test customer already exists. Use Supabase Auth to reset the password if needed."
    });
  }

  const password = createTemporaryPassword();
  const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
    email: TEST_CUSTOMER_EMAIL,
    password,
    email_confirm: true,
    app_metadata: { role: "customer" },
    user_metadata: { full_name: TEST_CUSTOMER_NAME }
  });

  if (createError) {
    const existingUser = await findAuthUserByEmail(TEST_CUSTOMER_EMAIL);
    if (!existingUser) {
      return NextResponse.json(
        { ok: false, message: "Could not create test customer.", detail: createError.message },
        { status: 500 }
      );
    }

    await upsertCustomerProfile(existingUser.id);
    return NextResponse.json({
      ok: true,
      mode: "supabase",
      created: false,
      email: TEST_CUSTOMER_EMAIL,
      message: "Auth user already existed. Customer profile was repaired. Reset the password in Supabase Auth if needed."
    });
  }

  if (!createdUser.user) {
    return NextResponse.json(
      { ok: false, message: "Supabase did not return the created user." },
      { status: 500 }
    );
  }

  await upsertCustomerProfile(createdUser.user.id);

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    created: true,
    email: TEST_CUSTOMER_EMAIL,
    password,
    message: "Test customer created. The password is shown only in this response."
  });
}
