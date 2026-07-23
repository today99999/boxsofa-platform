import type { Metadata } from "next";
import { OrdersClient } from "@/components/OrdersClient";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";

export const metadata: Metadata = {
  title: "Customer Dashboard | BoxSofa",
  robots: {
    index: false,
    follow: false
  }
};

export default function OrdersPage() {
  return (
    <>
      <SiteHeader />
      <main className="section customer-page">
        <OrdersClient />
      </main>
      <SiteFooter />
      <SupportButton />
    </>
  );
}
