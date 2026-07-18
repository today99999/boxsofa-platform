import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "BoxSofa ordering, payment, delivery, product, membership and customer support terms for compressed sofa purchases in Spain.",
  alternates: {
    canonical: "/terms"
  }
};

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Terms of Service"
      title="Ordering and payment terms"
      intro="These terms explain the BoxSofa online order process, secure payment, delivery and after-sales support for customers in Spain."
      sections={[
        {
          title: "Orders and payment",
          body: "After submitting delivery details, customers are directed to Stripe Checkout for secure card payment. An order is treated as paid after Stripe confirms the payment. Cancelled or incomplete checkout sessions are not treated as paid orders."
        },
        {
          title: "Product information",
          body: "Product pages include style, color, seat combination, dimensions, package size, weight, material, stock and recovery time based on supplier data."
        },
        {
          title: "Pricing",
          body: "Product prices and the final payable total are shown in EUR before payment. Basic delivery in Spain is free unless an optional service or disclosed delivery limitation applies."
        },
        {
          title: "Membership discount",
          body: "Customers become members after confirmed paid orders reach EUR 300. Member orders receive a 10% discount after eligibility is confirmed."
        },
        {
          title: "Delivery, returns and support",
          body: "Estimated delivery is 23-30 working days. The Shipping and Returns pages form part of these terms. Customers can contact BoxSofa support with their order number for delivery, cancellation, return or product-conformity questions."
        }
      ]}
    />
  );
}
