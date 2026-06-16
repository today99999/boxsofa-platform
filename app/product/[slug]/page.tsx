import Link from "next/link";
import { categories, products } from "@/lib/catalog";

export default function ProductPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const product = products.find((item) => item.slug === slug) ?? products[0];
  const siblings = products.filter((item) => item.styleId === product.styleId);

  return (
    <>
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
        </nav>
      </header>
      <main className="hero">
        <div>
          <div className="product-media">
            <img src={product.mainImage} alt={product.name} />
          </div>
        </div>
        <section>
          <p>首页 / {product.name}</p>
          <h1>{product.name}</h1>
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
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button className="button" type="button">
              加入购物车
            </button>
            <button className="button primary" type="button">
              提交订单
            </button>
          </div>
        </section>
      </main>
      <button className="chat-button" type="button">
        在线客服
      </button>
    </>
  );
}
