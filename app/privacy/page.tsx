import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "BoxSofa privacy policy covering essential site operation, customer orders, support messages and optional analytics for GDPR-aware launch preparation.",
  alternates: {
    canonical: "/privacy"
  }
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy Policy"
      title="Privacy-first setup for European customers"
      intro="BoxSofa is being prepared for the European market, so customer data and analytics must stay limited, useful and transparent."
      sections={[
        {
          title: "Essential data",
          body: "We collect the information needed to process an order, including contact details, delivery address, selected products and support messages."
        },
        {
          title: "Analytics consent",
          body: "Traffic source and conversion analytics are optional. They are only recorded after the visitor accepts analytics cookies or tracking in the consent banner."
        },
        {
          title: "Customer account data",
          body: "Customer login is used to show that customer only their own orders, membership status and support history."
        },
        {
          title: "Data processors",
          body: "Supabase is used for database storage during this build. Vercel hosts the website. Payment processing will be added later through Stripe."
        },
        {
          title: "Before launch",
          body: "Company entity details, data retention periods and formal GDPR contact information will be added before the website accepts real online payments."
        }
      ]}
    />
  );
}
