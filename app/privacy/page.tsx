import type { Metadata } from "next";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
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
      intro="BoxSofa limits customer data and analytics to what is useful, secure and transparent for European customers."
      sections={[
        {
          title: "Essential data",
          body: "We collect the information needed to process an order, including contact details, delivery address, selected products and support messages."
        },
        {
          title: "Analytics consent",
          body: "Traffic source and conversion analytics are optional. They are only recorded after the visitor accepts analytics cookies or tracking in the consent banner.",
          action: <CookieSettingsButton />
        },
        {
          title: "Customer account data",
          body: "Customer login is used to show that customer only their own orders, membership status and support history."
        },
        {
          title: "Data processors",
          body: "Supabase provides database and account services, Vercel hosts the website, Stripe processes secure card payments and Resend supports transactional email delivery. Each provider processes data only for the relevant service."
        },
        {
          title: "Questions and rights",
          body: "Customers may ask to access, correct or delete eligible personal data by contacting BoxSofa support. Some order and payment records may be retained where required for legal, tax, fraud-prevention or dispute purposes."
        }
      ]}
    />
  );
}
