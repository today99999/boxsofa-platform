import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Shipping for Compressed Sofas",
  description:
    "BoxSofa shipping information for compressed sofas in Europe, including free basic delivery, estimated cross-border delivery time and delivery preparation.",
  alternates: {
    canonical: "/shipping"
  }
};

export default function ShippingPage() {
  return (
    <PolicyPage
      eyebrow="BoxSofa Shipping"
      title="Shipping built for European homes"
      intro="All sofas use compressed packaging to make delivery easier for apartments, narrow stairs and compact lifts."
      sections={[
        {
          title: "Free basic delivery",
          body: "BoxSofa provides free basic delivery for all sofas across Europe. Any optional service or remote-area limitation is shown or agreed before payment."
        },
        {
          title: "Estimated delivery time",
          body: "Estimated delivery is 23-30 working days. Customers receive an order confirmation after checkout and shipment details when the order leaves the warehouse."
        },
        {
          title: "Compressed packaging",
          body: "Products are vacuum-compressed to reduce volume. Please keep enough room for unpacking and allow up to 48 hours for the sofa to recover its full shape."
        },
        {
          title: "Tracking",
          body: "After shipment, the seller can add a logistics tracking number in the admin dashboard. Customers can view delivery progress from their order page after login."
        }
      ]}
    />
  );
}
