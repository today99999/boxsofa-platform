export const STRIPE_FINANCIAL_PRODUCTION_PROJECT_REF = "osmjevtynywbkokzejcp";

function parseCanonicalSupabaseUrl(url, declaredRef) {
  try {
    const parsed = new URL(url);
    const expected = `https://${declaredRef}.supabase.co/`;
    if (
      (url !== expected && url !== expected.slice(0, -1)) ||
      parsed.href !== expected ||
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.hostname !== `${declaredRef}.supabase.co` ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function assertSafeStripeFinancialIntegrationTarget(environment) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const configuredRef = environment.SUPABASE_TEST_PROJECT_REF?.trim() || "";
  const target = environment.SUPABASE_INTEGRATION_TARGET?.trim().toLowerCase() || "";

  if (!url || !/^[a-z0-9]{20}$/.test(configuredRef) || !["branch", "test"].includes(target)) {
    throw new Error(
      "A non-production Supabase target requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_TEST_PROJECT_REF, and SUPABASE_INTEGRATION_TARGET=branch or test."
    );
  }

  if (
    configuredRef === STRIPE_FINANCIAL_PRODUCTION_PROJECT_REF ||
    !parseCanonicalSupabaseUrl(url, configuredRef)
  ) {
    throw new Error("Stripe financial integration fixtures are permanently blocked on the production Supabase project.");
  }

  return configuredRef;
}
