import Link from "next/link";
import { categories } from "@/lib/catalog";

export function SiteHeader() {
  return (
    <>
      <div className="topbar">订单满 EUR 999 免基础配送 | 跨境物流预估 23-30 天到达</div>
      <header className="site-header">
        <Link className="brand" href="/">
          BoxSofa
        </Link>
        <nav className="nav" aria-label="产品分类">
          {categories.map((category) => (
            <Link key={category.slug} href={`/category/${category.slug}`}>
              {category.name}
            </Link>
          ))}
          <Link href="/orders">我的订单</Link>
          <Link href="/cart">购物车</Link>
          <Link href="/admin">商家后台</Link>
        </nav>
      </header>
    </>
  );
}
