import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "BoxSofa terms of service for pre-launch order confirmation, compressed sofa product information and seller-confirmed payment."
};

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Terms of Service"
      title="Pre-launch ordering terms"
      intro="The current website is prepared for order collection and seller confirmation. Real online payment will be enabled later."
      sections={[
        {
          title: "Order status",
          body: "Submitting an order does not complete payment. The order enters pending confirmation and the seller contacts the customer to confirm payment and delivery."
        },
        {
          title: "Product information",
          body: "Product pages include style, color, seat combination, dimensions, package size, weight, material, stock and recovery time based on supplier data."
        },
        {
          title: "Pricing",
          body: "Prices are shown in EUR. Before payment launch, the seller can confirm the final payable amount and delivery details with the customer."
        },
        {
          title: "Membership discount",
          body: "Customers become members after confirmed paid orders reach EUR 300. Member orders receive a 10% discount after eligibility is confirmed."
        },
        {
          title: "Final terms",
          body: "Full legal terms, company identity, tax information and online payment rules will be published before Stripe payment is enabled."
        }
      ]}
    />
  );
}
