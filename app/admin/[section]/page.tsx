import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminClient } from "@/components/AdminClient";

const adminSections = ["dashboard", "launch", "traffic", "orders", "products", "reviews", "customers", "stock", "audit", "notifications", "support"] as const;
type AdminSection = (typeof adminSections)[number];
const sectionAliases: Record<string, AdminSection> = {
  members: "customers",
  "low-stock": "stock"
};

const sectionTitles: Record<AdminSection, string> = {
  dashboard: "BoxSofa Admin Dashboard",
  launch: "BoxSofa Admin Launch Checklist",
  traffic: "BoxSofa Admin Traffic",
  orders: "BoxSofa Admin Orders",
  products: "BoxSofa Admin Products",
  reviews: "BoxSofa Admin Reviews",
  customers: "BoxSofa Admin Customers",
  stock: "BoxSofa Admin Stock",
  audit: "BoxSofa Admin Audit Log",
  notifications: "BoxSofa Admin Notifications",
  support: "BoxSofa Admin Support"
};

export function generateStaticParams() {
  return adminSections.map((section) => ({ section }));
}

export function generateMetadata({ params }: { params: { section: string } }): Metadata {
  const section = sectionAliases[params.section] ?? (params.section as AdminSection);
  return {
    title: adminSections.includes(section) ? sectionTitles[section] : "BoxSofa Admin",
    robots: {
      index: false,
      follow: false
    }
  };
}

export default function AdminSectionPage({ params }: { params: { section: string } }) {
  const section = sectionAliases[params.section] ?? (params.section as AdminSection);

  if (!adminSections.includes(section)) {
    notFound();
  }

  return <AdminClient initialSection={section} />;
}
