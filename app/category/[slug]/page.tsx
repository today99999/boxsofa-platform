import Link from "next/link";
import type { Metadata } from "next";
import { CatalogText } from "@/components/CatalogText";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { TranslatedText } from "@/components/TranslatedText";
import { categories, getStyleProductsByCategory } from "@/lib/catalog";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const category = categories.find((item) => item.slug === params.slug) ?? categories[0];
  const title = category.slug === "all" ? "All Compressed Sofas" : `${category.name} Sofas`;
  const description =
    "Browse BoxSofa compressed sofas for European apartments, rental homes, old buildings, elevators, staircases, and compact living spaces. Free basic delivery and estimated cross-border delivery in 23-30 days.";

  return {
    title,
    description,
    alternates: {
      canonical: `/category/${category.slug}`
    },
    openGraph: {
      title: `${title} | BoxSofa`,
      description,
      url: `/category/${category.slug}`,
      type: "website"
    }
  };
}

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const category = categories.find((item) => item.slug === slug) ?? categories[0];
  const items = getStyleProductsByCategory(category.slug);

  return (
    <>
      <SiteHeader />
      <main className="collection-page">
        <div className="collection-head">
          <div>
            <p className="eyebrow">BoxSofa Collection</p>
            <h1>{category.slug === "all" ? <TranslatedText id="allSofas" /> : category.name}</h1>
          </div>
          <span>{items.length} <TranslatedText id="stylesCount" /></span>
        </div>
        <div className="product-grid">
          {items.map((product) => (
            <Link className="product-card" href={`/product/${product.slug}`} key={product.id}>
              <div className="collection-product-media">
                {product.mainImage ? (
                  <img src={product.mainImage} alt={product.name} />
                ) : (
                  <div className="image-placeholder"><TranslatedText id="mainImagePending" /></div>
                )}
              </div>
              <div className="product-card-body">
                <strong><CatalogText text={product.name} kind="name" /></strong>
                <span><CatalogText text={product.color} kind="color" /></span>
                <span className="product-card-price">EUR {product.priceEur}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
      <SupportButton />
    </>
  );
}
