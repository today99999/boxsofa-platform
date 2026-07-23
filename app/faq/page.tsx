import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Compressed Sofa FAQ",
  description:
    "Frequently asked questions about BoxSofa compressed sofas, delivery, recovery time, payment confirmation and membership discount.",
  alternates: {
    canonical: "/faq"
  }
};

export default function FaqPage() {
  return (
    <PolicyPage
      eyebrow="BoxSofa FAQ"
      title="Compressed sofa questions"
      intro="Short answers for customers comparing compressed sofas for apartments, rentals and European old buildings."
      sections={[
        {
          title: "Why compressed sofas?",
          body: "Compressed sofas reduce delivery volume, making them easier to move through narrow staircases, small lifts and older European apartment buildings."
        },
        {
          title: "How long does recovery take?",
          body: "Most sofas need up to 48 hours after unpacking to recover their full shape and showroom-like sitting feel."
        },
        {
          title: "Is delivery free?",
          body: "Yes. Basic delivery is free for all BoxSofa sofas across Europe. Any optional service or remote-area limitation is shown or agreed before payment."
        },
        {
          title: "Can I pay online now?",
          body: "Yes. Secure card payment is handled through Stripe Checkout. BoxSofa does not store full card details."
        },
        {
          title: "How does membership work?",
          body: "After confirmed paid orders reach EUR 300, the customer becomes a member and future orders receive a 10% discount."
        }
      ]}
    />
  );
}
