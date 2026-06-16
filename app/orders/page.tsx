import { OrdersClient } from "@/components/OrdersClient";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";

export default function OrdersPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <OrdersClient />
      </main>
      <SupportButton />
    </>
  );
}
