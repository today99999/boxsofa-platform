import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { categories, getProductsByCategory } from "@/lib/catalog";

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const category = categories.find((item) => item.slug === slug) ?? categories[0];
  const items = getProductsByCategory(category.slug);

  return (
    <>
      <SiteHeader />
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
                <span>{product.description}</span>
                <span>{product.color}</span>
                <span className="price">EUR {product.priceEur}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <SupportButton />
    </>
  );
}
