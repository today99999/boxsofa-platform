import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { getProductBySlug, type Product } from "@/lib/catalog";
import { getPublicProductTitle } from "@/lib/catalogMarketing";
import { buildFaqJsonLd } from "@/lib/conversionFaq";
import { getGuideBySlug, guides } from "@/lib/guides";

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getGuideBySlug(params.slug);
  if (!guide) return {};

  return {
    title: `${guide.title} | BoxSofa Guide`,
    description: guide.description,
    alternates: {
      canonical: `/guides/${guide.slug}`
    },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `/guides/${guide.slug}`,
      type: "article"
    }
  };
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = getGuideBySlug(params.slug);
  if (!guide) notFound();

  const products = guide.productSlugs.map(getProductBySlug).filter((product): product is Product => Boolean(product));
  const faqJsonLd = buildFaqJsonLd(guide.sections.map((section) => ({ question: section.title, answer: section.body })));

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <main className="guide-page">
        <section className="guide-hero">
          <p className="eyebrow">BoxSofa buying guide</p>
          <h1>{guide.title}</h1>
          <p>{guide.intro}</p>
          <Link className="button primary" href="/category/all">
            Shop compressed sofas
          </Link>
        </section>

        <section className="guide-content" aria-label={guide.title}>
          {guide.sections.map((section) => (
            <article className="guide-card" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <section className="section guide-products">
          <div className="section-head">
            <h2>Recommended compressed sofa styles</h2>
            <Link className="button" href="/category/all">
              View all
            </Link>
          </div>
          <div className="grid home-product-grid">
            {products.map((product) => (
              <Link className="card home-product-card" href={`/product/${product.slug}`} key={product.id}>
                <div className="product-media">
                  {product.mainImage ? (
                    <img src={product.mainImage} alt={getPublicProductTitle(product)} />
                  ) : (
                    <div className="image-placeholder">Image pending</div>
                  )}
                </div>
                <div className="card-body">
                  <strong>{getPublicProductTitle(product)}</strong>
                  <span className="price">EUR {product.priceEur}</span>
                </div>
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
