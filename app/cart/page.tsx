import { CartClient } from "@/components/CartClient";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <CartClient />
      </main>
      <SupportButton />
    </>
  );
}
