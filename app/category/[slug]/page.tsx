import Link from "next/link";
import type { Metadata } from "next";
import { CatalogText } from "@/components/CatalogText";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { TranslatedText } from "@/components/TranslatedText";
import { OptimizedImage } from "@/components/OptimizedImage";
import { categories, getStyleProductsByCategory } from "@/lib/catalog";
import { getPublicProductTitle } from "@/lib/catalogMarketing";
import { guides, spanishGuides } from "@/lib/guides";

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
  const guideLinks = [
    ...guides.slice(0, 2).map((guide) => ({ ...guide, href: `/guides/${guide.slug}`, label: "Guide" })),
    ...spanishGuides.slice(0, 2).map((guide) => ({ ...guide, href: `/es/guias/${guide.slug}`, label: "Guía" }))
  ];

  return (
    <>
      <SiteHeader />
      <main className="collection-page">
        <div className="collection-head">
          <div>
            <p className="eyebrow">BoxSofa Collection</p>
            <h1>{category.slug === "all" ? <TranslatedText id="allSofas" /> : category.name}</h1>
            <p className="collection-intro">
              Compressed foam sofas for small apartments, rental homes, narrow stairs and compact lifts. Free basic
              delivery across Europe, secure Stripe payment and a 14-day return window after delivery.
            </p>
          </div>
          <span className="collection-count">{items.length} <TranslatedText id="stylesCount" /></span>
        </div>
        <div className="product-grid">
          {items.map((product, index) => (
            <Link className="product-card" href={`/product/${product.slug}`} key={product.id}>
              <div className="collection-product-media">
                {product.mainImage ? (
                  <OptimizedImage
                    alt={getPublicProductTitle(product)}
                    priority={index < 4}
                    sizes="(max-width: 430px) calc(100vw - 28px), (max-width: 820px) 50vw, 25vw"
                    src={product.mainImage}
                  />
                ) : (
                  <div className="image-placeholder"><TranslatedText id="mainImagePending" /></div>
                )}
              </div>
              <div className="product-card-body">
                <strong className="product-card-name"><CatalogText text={product.name} kind="name" /></strong>
                <span className="product-card-color"><CatalogText text={product.color} kind="color" /></span>
                <span className="product-card-price">EUR {product.priceEur}</span>
              </div>
            </Link>
          ))}
        </div>
        <section className="collection-guide-band" aria-label="Compressed sofa buying guides">
          <div>
            <p className="eyebrow">Before you choose</p>
            <h2>Measure the delivery route, then choose the sofa.</h2>
          </div>
          <div className="collection-guide-links">
            {guideLinks.map((guide) => (
              <Link href={guide.href} key={guide.href}>
                <span>{guide.label}</span>
                <strong>{guide.title}</strong>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
      <SupportButton />
    </>
  );
}
