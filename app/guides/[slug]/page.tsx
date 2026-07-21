import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { getProductBySlug, type Product } from "@/lib/catalog";
import { getPublicProductTitle } from "@/lib/catalogMarketing";
import { buildFaqJsonLd } from "@/lib/conversionFaq";
import { getGuideBySlug, getRelatedGuides, getSpanishGuideForEnglishSlug, guides } from "@/lib/guides";
import { buildBreadcrumbJsonLd } from "@/lib/structuredData";

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getGuideBySlug(params.slug);
  if (!guide) return {};
  const spanishGuide = getSpanishGuideForEnglishSlug(guide.slug);

  return {
    title: `${guide.title} | BoxSofa Guide`,
    description: guide.description,
    alternates: {
      canonical: `/guides/${guide.slug}`,
      languages: spanishGuide
        ? {
            en: `/guides/${guide.slug}`,
            es: `/es/guias/${spanishGuide.slug}`
          }
        : undefined
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
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: "https://boxsofa.eu" },
    { name: "Buying Guides", url: "https://boxsofa.eu/guides" },
    { name: guide.title, url: `https://boxsofa.eu/guides/${guide.slug}` }
  ]);
  const relatedGuides = getRelatedGuides(guide.slug, "en", 3);
  const spanishGuide = getSpanishGuideForEnglishSlug(guide.slug);

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="guide-page">
        <section className="guide-hero">
          <p className="eyebrow">BoxSofa buying guide</p>
          <h1>{guide.title}</h1>
          <p>{guide.intro}</p>
          <div className="guide-action-row">
            <Link className="button primary" href="/category/all">
              Shop compressed sofas
            </Link>
            {spanishGuide ? (
              <Link className="button" href={`/es/guias/${spanishGuide.slug}`}>
                Leer en español
              </Link>
            ) : null}
          </div>
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

        <section className="section related-guides-section">
          <div className="section-head">
            <h2>Related buying guides</h2>
            <Link className="button" href="/guides">
              All guides
            </Link>
          </div>
          <div className="guide-content home-guide-grid" aria-label="Related compressed sofa guides">
            {relatedGuides.map((related) => (
              <Link className="guide-card guide-link-card" href={`/guides/${related.slug}`} key={related.slug}>
                <span className="eyebrow">Guide</span>
                <h2>{related.title}</h2>
                <p>{related.description}</p>
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
