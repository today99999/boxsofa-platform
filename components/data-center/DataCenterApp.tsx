"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Archive, BarChart3, Boxes, CircleHelp, FileWarning, LayoutDashboard, Megaphone,
  MessageSquareText, ReceiptText, Search, Settings, ShoppingBag, Users, type LucideIcon
} from "lucide-react";
import { AfterSalesSection } from "./AfterSalesSection";
import { OverviewSection } from "./OverviewSection";
import { UniversalSearch } from "./UniversalSearch";

export type DataCenterSection = "overview" | "orders" | "products" | "inventory" | "customers" | "traffic" | "social" | "marketing" | "after-sales" | "reviews" | "finance" | "cube" | "system";

type SectionDefinition = {
  id: DataCenterSection;
  label: string;
  icon: LucideIcon;
  href?: string;
  planned?: boolean;
};

const sections: SectionDefinition[] = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "orders", label: "订单", icon: ReceiptText, href: "/admin/orders" },
  { id: "products", label: "产品", icon: ShoppingBag, href: "/admin/products" },
  { id: "inventory", label: "库存", icon: Boxes, href: "/admin/stock" },
  { id: "customers", label: "客户", icon: Users, href: "/admin/customers" },
  { id: "traffic", label: "流量", icon: BarChart3, planned: true },
  { id: "social", label: "社媒", icon: MessageSquareText, planned: true },
  { id: "marketing", label: "营销", icon: Megaphone, planned: true },
  { id: "after-sales", label: "售后", icon: FileWarning },
  { id: "reviews", label: "评价", icon: CircleHelp, href: "/admin/reviews" },
  { id: "finance", label: "财务", icon: Archive, planned: true },
  { id: "cube", label: "数据魔方", icon: Search, planned: true },
  { id: "system", label: "系统", icon: Settings, planned: true }
];

function sectionFromUrl() {
  if (typeof window === "undefined") return "overview";
  const value = new URL(window.location.href).searchParams.get("section");
  return sections.some((section) => section.id === value && !section.href && !section.planned)
    ? value as DataCenterSection
    : "overview";
}

export function DataCenterApp() {
  const [activeSection, setActiveSection] = useState<DataCenterSection>("overview");

  useEffect(() => {
    const syncSection = () => setActiveSection(sectionFromUrl());
    syncSection();
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);

  function selectSection(section: DataCenterSection) {
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const active = sections.find((section) => section.id === activeSection) ?? sections[0];

  return (
    <main className="dc-app">
      <aside className="dc-sidebar" aria-label="数据中心导航">
        <Link className="dc-brand" href="/data-center?section=overview">
          <span className="dc-brand-mark">B</span><span>BoxSofa</span>
        </Link>
        <nav className="dc-nav">
          {sections.map((section) => <SectionButton key={section.id} section={section} active={activeSection === section.id} onSelect={selectSection} />)}
        </nav>
      </aside>

      <section className="dc-content">
        <header className="dc-topbar">
          <div><p>BoxSofa Data Center</p><h1>{active.label}</h1></div>
          <div className="dc-topbar-actions"><UniversalSearch /><Link className="dc-store-link" href="/">查看店铺</Link></div>
        </header>
        {activeSection === "overview"
          ? <OverviewSection />
          : activeSection === "after-sales"
            ? <AfterSalesSection />
            : <SectionContent section={active} />}
      </section>

      <nav className="dc-mobile-nav" aria-label="移动数据中心导航">
        <MobileButton label="总览" icon={LayoutDashboard} active={activeSection === "overview"} onClick={() => selectSection("overview")} />
        <MobileLink label="订单" icon={ReceiptText} href="/admin/orders" />
        <MobileButton label="售后" icon={FileWarning} active={activeSection === "after-sales"} onClick={() => selectSection("after-sales")} />
        <MobileButton label="数据" icon={BarChart3} active={false} planned onClick={() => undefined} />
        <MobileButton label="更多" icon={Settings} active={false} planned onClick={() => undefined} />
      </nav>
    </main>
  );
}

function SectionButton({ section, active, onSelect }: { section: SectionDefinition; active: boolean; onSelect: (section: DataCenterSection) => void }) {
  const Icon = section.icon;
  if (section.href) return <Link className="dc-nav-link" href={section.href}><Icon size={18} /><span>{section.label}</span></Link>;
  if (section.planned) return <button className="dc-nav-link is-planned" type="button" disabled><Icon size={18} /><span>{section.label}</span><small>Planned</small></button>;
  return <button className={`dc-nav-link${active ? " is-active" : ""}`} type="button" aria-pressed={active} onClick={() => onSelect(section.id)}><Icon size={18} /><span>{section.label}</span></button>;
}

function MobileButton({ label, icon: Icon, active, planned = false, onClick }: { label: string; icon: SectionDefinition["icon"]; active: boolean; planned?: boolean; onClick: () => void }) {
  return <button className={`dc-mobile-link${active ? " is-active" : ""}`} type="button" aria-pressed={active} disabled={planned} onClick={onClick}><Icon size={19} /><span>{label}</span>{planned && <small>Planned</small>}</button>;
}

function MobileLink({ label, icon: Icon, href }: { label: string; icon: SectionDefinition["icon"]; href: string }) {
  return <Link className="dc-mobile-link" href={href}><Icon size={19} /><span>{label}</span></Link>;
}

function SectionContent({ section }: { section: SectionDefinition }) {
  const Icon = section.icon;
  return <section className="dc-empty"><Icon size={28} /><h2>{section.label}</h2><span>Planned</span></section>;
}
