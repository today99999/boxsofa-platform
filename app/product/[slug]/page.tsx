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
import {
  getPublicProductDescription,
  getPublicProductName,
  getPublicProductTitle,
  getSeoProductTitle
} from "@/lib/catalogMarketing";
import { buildFaqJsonLd, productFaqs } from "@/lib/conversionFaq";
import type { TranslationKey } from "@/lib/i18n";
import { buildBreadcrumbJsonLd } from "@/lib/structuredData";

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
const cleanCategoryLabels: Record<CategorySlug, string> = {
  single: "单人位",
  double: "双人位",
  triple: "三人位",
  combo: "组合位"
};

function getColorOptionLabel(item: Product) {
  const categoryLabel = cleanCategoryLabels[item.category];
  return item.color
    .replace(new RegExp(`^${categoryLabel}\\s*/\\s*`), "")
    .replace(new RegExp(`^${categoryLabel}`), "")
    .trim() || item.color;
}

function isUnknownSpec(value: string) {
  return !value.trim() || value.includes("待确认");
}

function formatWeight(weight: string) {
  if (isUnknownSpec(weight)) return "";
  return /kg$/i.test(weight.trim()) ? weight : `${weight} KG`;
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = getProductBySlug(params.slug) ?? products[0];
  const publicTitle = getPublicProductTitle(product);
  const description = getPublicProductDescription(product);
  const image = product.mainImage || product.images[0];

  return {
    title: getSeoProductTitle(product),
    description,
    alternates: {
      canonical: `/product/${product.slug}`
    },
    openGraph: {
      title: publicTitle,
      description,
      url: `/product/${product.slug}`,
      type: "website",
      images: image
        ? [
            {
              url: image,
              alt: publicTitle
            }
          ]
        : undefined
    }
  };
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug) ?? products[0];
  const publicName = getPublicProductName(product);
  const publicTitle = getPublicProductTitle(product);
  const publicDescription = getPublicProductDescription(product);
  const productImages = (product.images.length ? product.images : [product.mainImage])
    .filter(Boolean)
    .map(absoluteUrl);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: publicTitle,
    description: publicDescription,
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
      itemCondition: "https://schema.org/NewCondition",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "ES"
        },
        shippingRate: {
          "@type": "MonetaryAmount",
          value: 0,
          currency: "EUR"
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 1,
            maxValue: 3,
            unitCode: "d"
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 23,
            maxValue: 30,
            unitCode: "d"
          }
        }
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "ES",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnShippingFees"
      }
    }
  };
  const faqJsonLd = buildFaqJsonLd(productFaqs);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "All Compressed Sofas", url: absoluteUrl("/category/all") },
    { name: publicTitle, url: absoluteUrl(`/product/${product.slug}`) }
  ]);
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
    { key: "sku", label: "SKU", rawValue: product.sku, value: product.sku },
    { key: "finished-size", label: <TranslatedText id="finishedSize" />, rawValue: product.dimensions, value: <CatalogText text={product.dimensions} kind="dimension" /> },
    { key: "package-size", label: <TranslatedText id="packageSize" />, rawValue: product.packageDimensions, value: <CatalogText text={product.packageDimensions} kind="dimension" /> },
    { key: "weight", label: <TranslatedText id="weight" />, rawValue: formatWeight(product.weightKg), value: formatWeight(product.weightKg) },
    { key: "material", label: <TranslatedText id="material" />, rawValue: product.material, value: <CatalogText text={product.material} kind="material" /> },
    { key: "packaging", label: <TranslatedText id="packagingMethod" />, rawValue: product.packagingMethod, value: <CatalogText text={product.packagingMethod} kind="packaging" /> },
    { key: "rebound", label: <TranslatedText id="reboundTime" />, rawValue: product.reboundTime, value: <CatalogText text={product.reboundTime} kind="rebound" /> },
    { key: "stock", label: <TranslatedText id="stock" />, rawValue: String(product.stock), value: <>{product.stock} <TranslatedText id="pieces" /></> }
  ].filter((item) => !isUnknownSpec(item.rawValue));

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="hero product-hero">
        <div>
          <ProductMedia
            name={publicTitle}
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
          <div className="product-trust-strip" aria-label={`Why buy ${publicName} from BoxSofa`}>
            <span>Secure Stripe card payment</span>
            <span>14-day return window in Spain</span>
            <span>Free basic delivery in Spain</span>
            <span>Support: info@boxsofa.eu</span>
          </div>
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

        <div className="panel product-faq-panel">
          <div className="panel-head">
            <h2>Before you order</h2>
            <span className="status">Compressed sofa FAQ</span>
          </div>
          <div className="product-faq-grid">
            {productFaqs.map((item) => (
              <details className="product-faq-item" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
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
