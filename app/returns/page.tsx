import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Returns and Warranty",
  description:
    "BoxSofa returns and warranty information for compressed sofas before online payment launch."
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      eyebrow="Returns and Warranty"
      title="Clear support before and after delivery"
      intro="Before payment is enabled, every order is manually confirmed so product details, address and delivery expectations can be checked first."
      sections={[
        {
          title: "Before payment",
          body: "Customers submit an order first. The seller contacts the customer to confirm product selection, delivery address, payment method and any special delivery needs."
        },
        {
          title: "After delivery",
          body: "Customers should inspect the package and sofa after arrival. If there is visible transport damage or an incorrect item, contact BoxSofa support with photos and the order number."
        },
        {
          title: "Compressed sofa recovery",
          body: "Compressed sofas need time to rebound. Shape recovery normally takes up to 48 hours after the packaging bag is opened."
        },
        {
          title: "Final policy update",
          body: "The final return window, warranty duration and company legal details will be published before real online payment is enabled."
        }
      ]}
    />
  );
}
