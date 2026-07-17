import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

let stripeClient: Stripe | null = null;

export function hasStripeConfig() {
  return Boolean(stripeSecretKey && process.env.STRIPE_WEBHOOK_SECRET && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function hasStripeCheckoutConfig() {
  return Boolean(stripeSecretKey && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function getStripeClient() {
  if (!stripeSecretKey) {
    throw new Error("Stripe secret key is not configured.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: "2026-06-24.dahlia" as Stripe.LatestApiVersion,
      typescript: true
    });
  }

  return stripeClient;
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://boxsofa.eu").replace(/\/$/, "");
}
