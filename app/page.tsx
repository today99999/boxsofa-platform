import Link from "next/link";
import { categories, products } from "@/lib/catalog";

export default function HomePage() {
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
        </nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <h1>舒适展开，轻松进门。</h1>
            <p>
              BoxSofa 把完整沙发压缩进更小包装，适合欧洲公寓、出租屋和城市家庭。上线初期先支持提交订单，
              商家后台确认付款，Stripe 支付接口保留到欧洲银行账户开通后接入。
            </p>
            <Link className="button primary" href="/category/all">
              选购沙发
            </Link>
          </div>
          <div className="hero-media">
            <img src="/assets/sku/sku-1-blue.jpg" alt="BoxSofa 压缩沙发" />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>热卖款式</h2>
            <Link className="button" href="/category/all">
              更多
            </Link>
          </div>
          <div className="grid">
            {products.map((product) => (
              <Link className="card" href={`/product/${product.slug}`} key={product.id}>
                <div className="product-media">
                  <img src={product.mainImage} alt={product.name} />
                </div>
                <div className="card-body">
                  <strong>{product.name}</strong>
                  <span>{product.color}</span>
                  <span className="price">EUR {product.priceEur}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <button className="chat-button" type="button">
        在线客服
      </button>
    </>
  );
}
