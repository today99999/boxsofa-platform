import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Returns and Warranty",
  description:
    "BoxSofa 14-day return policy for compressed sofas, including return costs, faulty items, refunds and exchanges in Spain.",
  alternates: {
    canonical: "/returns"
  }
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      eyebrow="Returns and Warranty"
      title="Returns with clear costs and timelines"
      intro="Customers in Spain may withdraw from an online purchase within 14 calendar days after delivery, without giving a reason. This policy does not limit any statutory consumer rights."
      sections={[
        {
          title: "14-day withdrawal period",
          body: "Notify BoxSofa within 14 calendar days after delivery by email or customer support. After notifying us, return the product without undue delay and within 14 calendar days. We will provide the return instructions and return address."
        },
        {
          title: "Product condition",
          body: "New and slightly used products are accepted. Customers may open and inspect a sofa as they would in a shop. Any refund may be reduced only for loss of value caused by handling beyond what is necessary to establish the product's nature, characteristics and function."
        },
        {
          title: "Change-of-mind return cost",
          body: "For a non-defective change-of-mind return, the customer arranges and pays the direct return transport cost. Because an expanded sofa is bulky, the estimated maximum return cost is 50% of the product purchase price. There is no restocking fee. Contact BoxSofa before dispatching the return."
        },
        {
          title: "Defective, damaged or incorrect items",
          body: "If an item is defective, damaged in transport or incorrect, contact BoxSofa promptly with the order number and clear photos. BoxSofa pays the reasonable return or collection cost for defective, damaged or incorrect items."
        },
        {
          title: "Refunds and exchanges",
          body: "Approved refunds are issued to the original payment method within 14 days after withdrawal notice. We may wait until the product is received or the customer provides evidence of return. Exchanges are accepted subject to product availability and the same return conditions."
        },
        {
          title: "Compressed sofa recovery",
          body: "Compressed sofas normally need up to 48 hours after unpacking to recover their shape. Normal recovery time alone is not a defect; contact support if the product remains materially different from its description after that period."
        }
      ]}
    />
  );
}
