import Link from "next/link";
import type { Metadata } from "next";
import { AddToCart } from "@/components/AddToCart";
import { CatalogText } from "@/components/CatalogText";
import { ProductMedia } from "@/components/ProductMedia";
import { ProductReviews } from "@/components/ProductReviews";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { TranslatedText } from "@/components/TranslatedText";
import { getProductBySlug, products, type CategorySlug, type Product } from "@/lib/catalog";
import type { TranslationKey } from "@/lib/i18n";

const siteUrl = "https://boxsofa.eu";

function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}

const categoryLabels: Record<CategorySlug, string> = {
  single: "单人位",
  double: "双人位",
  triple: "三人位",
  combo: "组合位"
};

const categoryLabelKeys: Record<CategorySlug, TranslationKey> = {
  single: "singleSeat",
  double: "doubleSeat",
  triple: "tripleSeat",
  combo: "comboSeat"
};

const categoryOrder: CategorySlug[] = ["single", "double", "triple", "combo"];

function getColorOptionLabel(item: Product) {
  const categoryLabel = categoryLabels[item.category];
  return item.color
    .replace(new RegExp(`^${categoryLabel}\\s*/\\s*`), "")
    .replace(new RegExp(`^${categoryLabel}`), "")
    .trim() || item.color;
}

function formatWeight(weight: string) {
  return /kg$/i.test(weight.trim()) ? weight : `${weight} KG`;
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = getProductBySlug(params.slug) ?? products[0];
  const description = `Compressed sofa for European apartments, rental homes, old buildings, elevators, staircases, and compact spaces. Dimensions: ${product.dimensions}. Price: EUR ${product.priceEur}. Estimated cross-border delivery: 23-30 days.`;
  const image = product.mainImage || product.images[0];

  return {
    title: `${product.name} | Compressed Sofa`,
    description,
    alternates: {
      canonical: `/product/${product.slug}`
    },
    openGraph: {
      title: `${product.name} | BoxSofa`,
      description,
      url: `/product/${product.slug}`,
      type: "website",
      images: image
        ? [
            {
              url: image,
              alt: product.name
            }
          ]
        : undefined
    }
  };
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug) ?? products[0];
  const productImages = (product.images.length ? product.images : [product.mainImage])
    .filter(Boolean)
    .map(absoluteUrl);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    brand: {
      "@type": "Brand",
      name: "BoxSofa"
    },
    image: productImages,
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: "EUR",
      price: product.priceEur,
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition"
    }
  };
  const siblings = products.filter((item) => item.styleId === product.styleId);
  const typeOptions = categoryOrder
    .map((category) => siblings.find((item) => item.category === category))
    .filter((item): item is Product => Boolean(item));
  const colorOptions = siblings.filter((item) => item.category === product.category);
  const currentIndex = Math.max(
    siblings.findIndex((item) => item.slug === product.slug),
    0
  );
  const previousSku = siblings[(currentIndex - 1 + siblings.length) % siblings.length];
  const nextSku = siblings[(currentIndex + 1) % siblings.length];
  const specs = [
    { key: "sku", label: "SKU", value: product.sku },
    { key: "finished-size", label: <TranslatedText id="finishedSize" />, value: <CatalogText text={product.dimensions} kind="dimension" /> },
    { key: "package-size", label: <TranslatedText id="packageSize" />, value: <CatalogText text={product.packageDimensions} kind="dimension" /> },
    { key: "weight", label: <TranslatedText id="weight" />, value: formatWeight(product.weightKg) },
    { key: "material", label: <TranslatedText id="material" />, value: <CatalogText text={product.material} kind="material" /> },
    { key: "packaging", label: <TranslatedText id="packagingMethod" />, value: <CatalogText text={product.packagingMethod} kind="packaging" /> },
    { key: "rebound", label: <TranslatedText id="reboundTime" />, value: <CatalogText text={product.reboundTime} kind="rebound" /> },
    { key: "stock", label: <TranslatedText id="stock" />, value: <>{product.stock} <TranslatedText id="pieces" /></> }
  ];

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <main className="hero product-hero">
        <div>
          <ProductMedia
            name={product.name}
            images={product.images.length ? product.images : [product.mainImage]}
            previousHref={siblings.length > 1 ? `/product/${previousSku.slug}` : undefined}
            nextHref={siblings.length > 1 ? `/product/${nextSku.slug}` : undefined}
          />
        </div>
        <section className="product-summary">
          <p><TranslatedText id="home" /> / <CatalogText text={product.name} kind="name" /></p>
          <h1><CatalogText text={product.name} kind="name" /></h1>
          <p><CatalogText text={product.description} kind="description" /></p>
          <p><TranslatedText id="shippingAndPaymentNote" /></p>
          <div className="price">EUR {product.priceEur}</div>
          <div className="sku-selector">
            <div className="sku-section">
              <h2><TranslatedText id="seatCombo" /></h2>
              <div className="sku-options">
                {typeOptions.map((item) => (
                  <Link
                    className={`button ${item.category === product.category ? "active" : ""}`}
                    href={`/product/${item.slug}`}
                    key={item.id}
                  >
                    <TranslatedText id={categoryLabelKeys[item.category]} />
                  </Link>
                ))}
              </div>
            </div>
            <div className="sku-section">
              <h2><TranslatedText id="color" /></h2>
              <div className="sku-options">
                {colorOptions.map((item) => (
                  <Link
                    className={`button ${item.slug === product.slug ? "active" : ""}`}
                    href={`/product/${item.slug}`}
                    key={item.id}
                  >
                    <CatalogText text={getColorOptionLabel(item)} kind="color" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <AddToCart product={product} />
        </section>
      </main>
      <section className="section product-detail-section">
        <div className="panel">
          <div className="panel-head">
            <h2><TranslatedText id="productSpecs" /></h2>
            <div className="product-panel-actions">
              <ProductReviews productSlug={product.slug} styleId={product.styleId} />
              <span className="status"><TranslatedText id="supplierTemplate" /></span>
            </div>
          </div>
          <dl className="spec-grid">
            {specs.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="detail-media-stack">
          <div className="panel detail-video-panel">
            <div className="panel-head">
              <h2><TranslatedText id="productVideo" /></h2>
              <span className="status"><TranslatedText id="onePerStyle" /></span>
            </div>
            <video className="detail-video" src={product.video} controls muted preload="metadata" />
          </div>
          <div className="panel detail-image-panel">
            <div className="panel-head">
              <h2><TranslatedText id="detailLongImage" /></h2>
              <span className="status"><TranslatedText id="oneDetailImage" /></span>
            </div>
            <img className="detail-image" src={product.detailImage} alt={`${product.name} details`} />
          </div>
        </div>
      </section>
      <SiteFooter />
      <SupportButton />
    </>
  );
}
