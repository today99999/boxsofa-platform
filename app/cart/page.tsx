import type { Metadata } from "next";
import { CartClient } from "@/components/CartClient";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";

export const metadata: Metadata = {
  title: "购物车",
  robots: {
    index: false,
    follow: false
  }
};

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <CartClient />
      </main>
      <SiteFooter />
      <SupportButton />
    </>
  );
}
