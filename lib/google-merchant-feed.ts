import type { Product } from "./catalog.ts";
import {
  getMerchantProductTitle,
  getPublicItemGroupId,
  getPublicProductColor,
  getPublicProductDescription
} from "./catalogMarketing.ts";

const columns = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "additional_image_link",
  "availability",
  "price",
  "condition",
  "brand",
  "identifier_exists",
  "item_group_id",
  "color",
  "material",
  "size",
  "product_type",
  "shipping",
  "shipping_label",
  "custom_label_0",
  "custom_label_1"
] as const;

function cleanCell(value: string | number) {
  return String(value).replace(/[\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function absoluteUrl(siteUrl: string, path: string) {
  return new URL(path, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).toString();
}

function categoryName(product: Product) {
  const categories: Record<Product["category"], string> = {
    single: "Furniture > Living Room Furniture > Single-Seat Sofas",
    double: "Furniture > Living Room Furniture > Two-Seat Sofas",
    triple: "Furniture > Living Room Furniture > Three-Seat Sofas",
    combo: "Furniture > Living Room Furniture > Modular Sofas"
  };

  return categories[product.category];
}

function additionalImages(product: Product, siteUrl: string) {
  return product.images
    .filter((image) => image && image !== product.mainImage)
    .slice(0, 10)
    .map((image) => absoluteUrl(siteUrl, image))
    .join(",");
}

function publicMaterial(product: Product) {
  const material = product.material.toLowerCase();
  if (material.includes("foam") || product.material.includes("海绵")) return "high-density compressed foam, fabric";
  return "compressed foam, fabric";
}

function publicSize(product: Product) {
  return product.category === "combo" ? "modular" : product.category;
}

export function buildGoogleMerchantFeed(items: Product[], siteUrl: string) {
  const rows = items.map((product) => {
    const values: Record<(typeof columns)[number], string | number> = {
      id: product.sku,
      title: getMerchantProductTitle(product),
      description: getPublicProductDescription(product),
      link: absoluteUrl(siteUrl, `/product/${product.slug}`),
      image_link: absoluteUrl(siteUrl, product.mainImage),
      additional_image_link: additionalImages(product, siteUrl),
      availability: product.stock > 0 ? "in_stock" : "out_of_stock",
      price: `${product.priceEur.toFixed(2)} EUR`,
      condition: "new",
      brand: "BoxSofa",
      identifier_exists: "no",
      item_group_id: getPublicItemGroupId(product),
      color: getPublicProductColor(product),
      material: publicMaterial(product),
      size: publicSize(product),
      product_type: categoryName(product),
      shipping: "ES:::0 EUR",
      shipping_label: "Free basic delivery in Spain",
      custom_label_0: "compressed sofa",
      custom_label_1: product.category
    };

    return columns.map((column) => cleanCell(values[column])).join("\t");
  });

  return `${columns.join("\t")}\n${rows.join("\n")}\n`;
}
