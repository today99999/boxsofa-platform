export const STRIPE_FINANCIAL_PRODUCTION_PROJECT_REF = "osmjevtynywbkokzejcp";

function getProjectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

export function assertSafeStripeFinancialIntegrationTarget(environment) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const configuredRef = environment.SUPABASE_TEST_PROJECT_REF?.trim() || "";
  const target = environment.SUPABASE_INTEGRATION_TARGET?.trim().toLowerCase() || "";
  const actualRef = getProjectRef(url);

  if (!url || !configuredRef || !["branch", "test"].includes(target)) {
    throw new Error(
      "A non-production Supabase target requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_TEST_PROJECT_REF, and SUPABASE_INTEGRATION_TARGET=branch or test."
    );
  }

  if (
    actualRef === STRIPE_FINANCIAL_PRODUCTION_PROJECT_REF ||
    configuredRef === STRIPE_FINANCIAL_PRODUCTION_PROJECT_REF ||
    actualRef !== configuredRef
  ) {
    throw new Error("Stripe financial integration fixtures are permanently blocked on the production Supabase project.");
  }

  return actualRef;
}
