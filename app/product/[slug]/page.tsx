import Link from "next/link";
import { AddToCart } from "@/components/AddToCart";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { getProductBySlug, products } from "@/lib/catalog";

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug) ?? products[0];
  const siblings = products.filter((item) => item.styleId === product.styleId);

  return (
    <>
      <SiteHeader />
      <main className="hero">
        <div>
          <div className="product-media">
            <img src={product.mainImage} alt={product.name} />
          </div>
        </div>
        <section>
          <p>首页 / {product.name}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <p>跨境物流预估 23-30 天到达。当前版本先提交订单，商家确认付款；Stripe 支付将在银行账户准备好后开启。</p>
          <div className="price">EUR {product.priceEur}</div>
          <h2>颜色 / 组合</h2>
          <div className="nav">
            {siblings.map((item) => (
              <Link className="button" href={`/product/${item.slug}`} key={item.id}>
                {item.color}
              </Link>
            ))}
          </div>
          <AddToCart product={product} />
        </section>
      </main>
      <SupportButton />
    </>
  );
}
