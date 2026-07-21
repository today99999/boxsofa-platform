import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { getProductBySlug, type Product } from "@/lib/catalog";
import { getPublicProductTitle } from "@/lib/catalogMarketing";
import { buildFaqJsonLd } from "@/lib/conversionFaq";
import { getEnglishGuideForSpanishSlug, getRelatedGuides, getSpanishGuideBySlug, spanishGuides } from "@/lib/guides";

export function generateStaticParams() {
  return spanishGuides.map((guide) => ({ slug: guide.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getSpanishGuideBySlug(params.slug);
  if (!guide) return {};
  const englishGuide = getEnglishGuideForSpanishSlug(guide.slug);

  return {
    title: `${guide.title} | Guía BoxSofa`,
    description: guide.description,
    alternates: {
      canonical: `/es/guias/${guide.slug}`,
      languages: englishGuide
        ? {
            es: `/es/guias/${guide.slug}`,
            en: `/guides/${englishGuide.slug}`
          }
        : undefined
    },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `/es/guias/${guide.slug}`,
      type: "article"
    }
  };
}

export default function SpanishGuidePage({ params }: { params: { slug: string } }) {
  const guide = getSpanishGuideBySlug(params.slug);
  if (!guide) notFound();

  const products = guide.productSlugs.map(getProductBySlug).filter((product): product is Product => Boolean(product));
  const faqJsonLd = buildFaqJsonLd(guide.sections.map((section) => ({ question: section.title, answer: section.body })));
  const relatedGuides = getRelatedGuides(guide.slug, "es", 3);
  const englishGuide = getEnglishGuideForSpanishSlug(guide.slug);

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <main className="guide-page">
        <section className="guide-hero">
          <p className="eyebrow">Guía BoxSofa</p>
          <h1>{guide.title}</h1>
          <p>{guide.intro}</p>
          <div className="guide-action-row">
            <Link className="button primary" href="/category/all">
              Ver sofás comprimidos
            </Link>
            <Link className="button" href="/es/guias">
              Todas las guías
            </Link>
            {englishGuide ? (
              <Link className="button" href={`/guides/${englishGuide.slug}`}>
                Read in English
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
            <h2>Modelos recomendados de sofá comprimido</h2>
            <Link className="button" href="/category/all">
              Ver todos
            </Link>
          </div>
          <div className="grid home-product-grid">
            {products.map((product) => (
              <Link className="card home-product-card" href={`/product/${product.slug}`} key={product.id}>
                <div className="product-media">
                  {product.mainImage ? (
                    <img src={product.mainImage} alt={getPublicProductTitle(product)} />
                  ) : (
                    <div className="image-placeholder">Imagen pendiente</div>
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
            <h2>Más guías de compra</h2>
            <Link className="button" href="/es/guias">
              Todas las guías
            </Link>
          </div>
          <div className="guide-content home-guide-grid" aria-label="Guías relacionadas sobre sofás comprimidos">
            {relatedGuides.map((related) => (
              <Link className="guide-card guide-link-card" href={`/es/guias/${related.slug}`} key={related.slug}>
                <span className="eyebrow">Guía</span>
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
