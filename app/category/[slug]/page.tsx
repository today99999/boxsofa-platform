import Link from "next/link";
import { categories, getProductsByCategory } from "@/lib/catalog";

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const category = categories.find((item) => item.slug === slug) ?? categories[0];
  const items = getProductsByCategory(category.slug);

  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/">
          BoxSofa
        </Link>
        <nav className="nav" aria-label="产品分类">
          {categories.map((item) => (
            <Link key={item.slug} href={`/category/${item.slug}`}>
              {item.name}
            </Link>
          ))}
        </nav>
      </header>
      <main className="section">
        <div className="section-head">
          <h1>{category.name}</h1>
          <span>{items.length} 个商品</span>
        </div>
        <div className="grid">
          {items.map((product) => (
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
      </main>
      <button className="chat-button" type="button">
        在线客服
      </button>
    </>
  );
}
