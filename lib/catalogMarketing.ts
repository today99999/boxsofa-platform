import type { Product } from "./catalog.ts";
import { translateCatalogText } from "./catalogI18n.ts";

const seatLabels: Record<Product["category"], string> = {
  single: "single-seat",
  double: "two-seat",
  triple: "three-seat",
  combo: "modular"
};

const productTypeLabels: Record<Product["category"], string> = {
  single: "compressed foam sofa",
  double: "compressed foam sofa",
  triple: "compressed foam sofa",
  combo: "compressed modular sofa"
};

function cleanSpaces(value: string) {
  return value.replace(/\s{2,}/g, " ").trim();
}

function stripDisplayOnlyWords(value: string) {
  return value
    .replace(/\bbackground version\b/gi, "")
    .replace(/\bstandard\b/gi, "")
    .replace(/\bmulti-color display\b/gi, "multi-color")
    .replace(/\s*\/\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getPublicProductName(product: Product) {
  return stripDisplayOnlyWords(translateCatalogText(product.name, "en", "name"));
}

export function getPublicProductColor(product: Product) {
  return stripDisplayOnlyWords(translateCatalogText(product.color, "en", "color"));
}

export function getPublicProductTitle(product: Product) {
  const name = getPublicProductName(product);
  const lowerName = name.toLowerCase();
  const seat = seatLabels[product.category];
  const type = productTypeLabels[product.category];
  const color = getPublicProductColor(product);
  const colorPart = color && !lowerName.includes(color.toLowerCase()) ? `, ${color}` : "";

  return cleanSpaces(`${name} - ${seat} ${type}${colorPart}`);
}

export function getMerchantProductTitle(product: Product) {
  return cleanSpaces(`${getPublicProductTitle(product)} for small apartments in Spain`);
}

export function getSeoProductTitle(product: Product) {
  const baseName = getPublicProductName(product).replace(/\s+\/\s+/g, " ");
  const color = getPublicProductColor(product);
  const colorPart = color && !baseName.toLowerCase().includes(color.toLowerCase()) ? ` ${color}` : "";
  const compactName = cleanSpaces(`${baseName}${colorPart}`).slice(0, 48).trim();

  return `${compactName} | Compressed Sofa | BoxSofa`;
}

export function getPublicProductDescription(product: Product) {
  const name = getPublicProductName(product);
  const compactName = name.length > 44 ? `${name.slice(0, 41).trim()}...` : name;
  return cleanSpaces(
    `${compactName} is a compressed foam sofa for small apartments, rentals, narrow stairs and compact lifts. Free basic delivery across Europe, Stripe payment and 23-30 working day delivery.`
  );
}

export function getPublicItemGroupId(product: Product) {
  return translateCatalogText(product.styleId, "en", "name")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
