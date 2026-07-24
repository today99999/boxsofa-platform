"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Archive, BarChart3, Boxes, CircleHelp, FileWarning, LayoutDashboard, Megaphone,
  MessageSquareText, ReceiptText, Search, Settings, ShoppingBag, Users, type LucideIcon
} from "lucide-react";
import type { DataCenterOverview } from "@/lib/data-center/types";

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
  { id: "after-sales", label: "售后", icon: FileWarning, href: "/admin/support" },
  { id: "reviews", label: "评价", icon: CircleHelp, href: "/admin/reviews" },
  { id: "finance", label: "财务", icon: Archive, planned: true },
  { id: "cube", label: "数据魔方", icon: Search, planned: true },
  { id: "system", label: "系统", icon: Settings, planned: true }
];

type OverviewState = "loading" | "ready" | "login" | "unavailable";

function isOverview(value: unknown): value is DataCenterOverview {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DataCenterOverview>;
  return Boolean(
    candidate.metrics &&
    typeof candidate.metrics.gmvEur === "number" &&
    typeof candidate.metrics.paidOrders === "number" &&
    typeof candidate.visitors === "number" &&
    typeof candidate.openAfterSales === "number"
  );
}

export function DataCenterApp() {
  const [activeSection, setActiveSection] = useState<DataCenterSection>("overview");
  const [overviewState, setOverviewState] = useState<OverviewState>("loading");
  const [overview, setOverview] = useState<DataCenterOverview | null>(null);

  useEffect(() => {
    let current = true;
    fetch("/api/admin/data-center/overview?range=7d", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!current) return;
        if (response.status === 401) {
          setOverviewState("login");
          return;
        }
        if (!response.ok) throw new Error("overview unavailable");
        const payload = await response.json() as { overview?: unknown };
        if (!isOverview(payload.overview)) throw new Error("invalid overview");
        setOverview(payload.overview);
        setOverviewState("ready");
      })
      .catch(() => current && setOverviewState("unavailable"));
    return () => { current = false; };
  }, []);

  const active = sections.find((section) => section.id === activeSection) ?? sections[0];

  return (
    <main className="dc-app">
      <aside className="dc-sidebar" aria-label="数据中心导航">
        <Link className="dc-brand" href="/data-center">
          <span className="dc-brand-mark">B</span><span>BoxSofa</span>
        </Link>
        <nav className="dc-nav">
          {sections.map((section) => <SectionButton key={section.id} section={section} active={activeSection === section.id} onSelect={setActiveSection} />)}
        </nav>
      </aside>

      <section className="dc-content">
        <header className="dc-topbar"><div><p>BoxSofa Data Center</p><h1>{active.label}</h1></div><Link className="dc-store-link" href="/">查看店铺</Link></header>
        {activeSection === "overview" ? <Overview state={overviewState} data={overview} /> : <SectionContent section={active} />}
      </section>

      <nav className="dc-mobile-nav" aria-label="移动数据中心导航">
        <MobileButton label="总览" icon={LayoutDashboard} active={activeSection === "overview"} onClick={() => setActiveSection("overview")} />
        <MobileLink label="订单" icon={ReceiptText} href="/admin/orders" />
        <MobileLink label="售后" icon={FileWarning} href="/admin/support" />
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

function Overview({ state, data }: { state: OverviewState; data: DataCenterOverview | null }) {
  if (state === "login") return <section className="dc-empty"><h2>需要登录</h2><Link href="/login">前往登录</Link></section>;
  if (state === "unavailable") return <section className="dc-empty"><h2>数据暂不可用</h2></section>;
  return <section className="dc-overview" aria-busy={state === "loading"}>
    <div className="dc-metric-grid">
      <Metric label="GMV" value={state === "ready" && data ? `€${data.metrics.gmvEur.toLocaleString("en-IE")}` : "--"} />
      <Metric label="订单" value={state === "ready" && data ? data.metrics.paidOrders.toLocaleString("en-IE") : "--"} />
      <Metric label="访问" value={state === "ready" && data ? data.visitors.toLocaleString("en-IE") : "--"} />
      <Metric label="售后" value={state === "ready" && data ? data.openAfterSales.toLocaleString("en-IE") : "--"} />
    </div>
    <section className="dc-status-line"><span>数据状态</span><strong>{state === "ready" ? "实时" : "同步中"}</strong></section>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <section className="dc-metric"><span>{label}</span><strong>{value}</strong></section>;
}

function SectionContent({ section }: { section: SectionDefinition }) {
  const Icon = section.icon;
  return <section className="dc-empty"><Icon size={28} /><h2>{section.label}</h2><span>Planned</span></section>;
}
