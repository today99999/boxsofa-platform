import Link from "next/link";
import { CatalogText } from "@/components/CatalogText";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { TranslatedText } from "@/components/TranslatedText";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getStyleProductsByCategory } from "@/lib/catalog";
import { getPublicProductTitle } from "@/lib/catalogMarketing";
import { guides } from "@/lib/guides";

export default function HomePage() {
  const hotProducts = getStyleProductsByCategory("all").slice(0, 8);
  const heroProduct = hotProducts[0];
  const featuredGuides = guides.slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero hero-ad">
          <div className="hero-copy">
            <p className="hero-kicker"><TranslatedText id="heroKicker" /></p>
            <h1><TranslatedText id="heroTitle" /></h1>
            <div className="hero-message-stack">
              <p><TranslatedText id="heroMessageOne" /></p>
              <p><TranslatedText id="heroMessageTwo" /></p>
              <p><TranslatedText id="heroMessageThree" /></p>
            </div>
            <div className="hero-actions">
              <Link className="button primary" href="/category/all">
                <TranslatedText id="heroShopAll" />
              </Link>
              <a className="button" href="#home-delivery-notes">
                <TranslatedText id="heroDeliveryLink" />
              </a>
            </div>
            <dl className="hero-proof" id="home-delivery-notes">
              <div>
                <dt><TranslatedText id="heroProofDeliveryLabel" /></dt>
                <dd><TranslatedText id="heroProofDeliveryText" /></dd>
              </div>
              <div>
                <dt><TranslatedText id="heroProofEtaLabel" /></dt>
                <dd><TranslatedText id="heroProofEtaText" /></dd>
              </div>
              <div>
                <dt><TranslatedText id="heroProofPaymentLabel" /></dt>
                <dd><TranslatedText id="heroProofPaymentText" /></dd>
              </div>
            </dl>
          </div>
          <div className="hero-media hero-ad-media">
            <video
              className="hero-video"
              src="/assets/video/boxsofa-blue-bubble-hero.mp4"
              poster="/assets/brand/boxsofa-blue-bubble-hero.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Blue BoxSofa expanding from its compressed delivery package"
            />
            <div className="hero-badge hero-badge-price">
              <span><TranslatedText id="heroBadgeCompressed" /></span>
              <strong><TranslatedText id="heroBadgeFrom" /> EUR {heroProduct?.priceEur ?? 399}</strong>
            </div>
            <div className="hero-badge hero-badge-delivery">
              <span><TranslatedText id="heroBadgeRecovery" /></span>
              <strong><TranslatedText id="heroBadgeRecoveryText" /></strong>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2><TranslatedText id="hotStyles" /></h2>
            <Link className="button" href="/category/all">
              <TranslatedText id="more" />
            </Link>
          </div>
          <div className="grid home-product-grid">
            {hotProducts.map((product, index) => (
              <Link className="card home-product-card" href={`/product/${product.slug}`} key={product.id}>
                <div className="product-media">
                  {product.mainImage ? (
                    <OptimizedImage
                      alt={getPublicProductTitle(product)}
                      priority={index < 2}
                      sizes="(max-width: 430px) calc(100vw - 36px), (max-width: 820px) 50vw, 25vw"
                      src={product.mainImage}
                    />
                  ) : (
                    <div className="image-placeholder"><TranslatedText id="mainImagePending" /></div>
                  )}
                </div>
                <div className="card-body">
                  <strong><CatalogText text={product.styleId} kind="name" /></strong>
                  <span className="price">EUR {product.priceEur}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section home-guides-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Buying help</p>
              <h2>Not sure a compressed sofa will fit your building?</h2>
            </div>
            <Link className="button" href="/guides">
              View guides
            </Link>
            <Link className="button" href="/es/guias">
              Guías ES
            </Link>
          </div>
          <div className="guide-content home-guide-grid" aria-label="Compressed sofa buying guides">
            {featuredGuides.map((guide) => (
              <Link className="guide-card guide-link-card" href={`/guides/${guide.slug}`} key={guide.slug}>
                <span className="eyebrow">Guide</span>
                <h2>{guide.title}</h2>
                <p>{guide.description}</p>
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
