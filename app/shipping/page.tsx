import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Shipping for Compressed Sofas",
  description:
    "BoxSofa shipping information for compressed sofas in Europe, including free basic delivery, estimated cross-border delivery time and delivery preparation."
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
          body: "BoxSofa plans free basic delivery for all sofas. Extra services such as appointment handling, special floor delivery or remote-area adjustments will be confirmed by the seller before final payment."
        },
        {
          title: "Estimated delivery time",
          body: "Cross-border delivery is currently estimated at 23-30 days. The seller will confirm the order, payment method and delivery details before shipment."
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
