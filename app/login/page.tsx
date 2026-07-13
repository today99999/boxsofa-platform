import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { LoginClient } from "@/components/LoginClient";
import { LoginIntro } from "@/components/LoginIntro";

export const metadata: Metadata = {
  title: "登录",
  robots: {
    index: false,
    follow: false
  }
};

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="section login-page">
        <LoginIntro />
        <LoginClient />
      </main>
      <SiteFooter />
    </>
  );
}
