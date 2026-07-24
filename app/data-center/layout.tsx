import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
    notFound();
  }

  return <div lang="zh-CN">{children}</div>;
}
