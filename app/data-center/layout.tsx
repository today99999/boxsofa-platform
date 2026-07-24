import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOwnerAccess } from "@/lib/server/admin-auth";
import "./data-center.css";

export const metadata: Metadata = {
  title: "数据中心",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function DataCenterLayout({ children }: { children: React.ReactNode }) {
  const access = await requireOwnerAccess();

  if (!access.ok) {
    if (access.reason === "not_authenticated") {
      redirect("/login");
    }
    notFound();
  }

  return <div lang="zh-CN">{children}</div>;
}
