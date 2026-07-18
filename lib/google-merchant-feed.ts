import type { Product } from "./catalog.ts";
import { translateCatalogText } from "./catalogI18n.ts";

const columns = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "availability",
  "price",
  "condition",
  "identifier_exists",
  "item_group_id",
  "color",
  "product_type"
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

export function buildGoogleMerchantFeed(items: Product[], siteUrl: string) {
  const rows = items.map((product) => {
    const values: Record<(typeof columns)[number], string | number> = {
      id: product.sku,
      title: translateCatalogText(product.name, "en"),
      description: translateCatalogText(product.description, "en", "description"),
      link: absoluteUrl(siteUrl, `/product/${product.slug}`),
      image_link: absoluteUrl(siteUrl, product.mainImage),
      availability: product.stock > 0 ? "in_stock" : "out_of_stock",
      price: `${product.priceEur.toFixed(2)} EUR`,
      condition: "new",
      identifier_exists: "no",
      item_group_id: product.styleId,
      color: translateCatalogText(product.color, "en"),
      product_type: categoryName(product)
    };

    return columns.map((column) => cleanCell(values[column])).join("\t");
  });

  return `${columns.join("\t")}\n${rows.join("\n")}\n`;
}
