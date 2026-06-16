export type CategorySlug = "single" | "double" | "triple" | "combo";

export type Product = {
  id: string;
  slug: string;
  styleId: string;
  category: CategorySlug;
  name: string;
  color: string;
  priceEur: number;
  stock: number;
  mainImage: string;
  images: string[];
};

export const categories: Array<{ slug: "all" | CategorySlug; name: string }> = [
  { slug: "all", name: "全部沙发" },
  { slug: "single", name: "单人沙发" },
  { slug: "double", name: "双人沙发" },
  { slug: "triple", name: "三人沙发" },
  { slug: "combo", name: "沙发组合" }
];

export const products: Product[] = [
  {
    id: "sku-1",
    slug: "solo-star-blue",
    styleId: "style-solo",
    category: "single",
    name: "Solo 星空蓝",
    color: "星空蓝",
    priceEur: 129,
    stock: 18,
    mainImage: "/assets/sku/sku-1-blue.jpg",
    images: ["/assets/sku/sku-1-blue.jpg"]
  },
  {
    id: "sku-2",
    slug: "solo-coffee",
    styleId: "style-solo",
    category: "single",
    name: "Solo 咖啡色",
    color: "咖啡色",
    priceEur: 129,
    stock: 14,
    mainImage: "/assets/sku/sku-2-coffee.jpg",
    images: ["/assets/sku/sku-2-coffee.jpg"]
  },
  {
    id: "sku-3",
    slug: "lite-beige",
    styleId: "style-lite",
    category: "double",
    name: "Lite 米黄色",
    color: "米黄色",
    priceEur: 199,
    stock: 20,
    mainImage: "/assets/sku/sku-3-beige.jpg",
    images: ["/assets/sku/sku-3-beige.jpg"]
  },
  {
    id: "sku-6",
    slug: "cloud-blue-ottoman",
    styleId: "style-cloud",
    category: "triple",
    name: "Cloud 星空蓝 + 脚蹬",
    color: "星空蓝 + 脚蹬",
    priceEur: 289,
    stock: 12,
    mainImage: "/assets/sku/sku-6-blue-ottoman.jpg",
    images: ["/assets/sku/sku-6-blue-ottoman.jpg"]
  },
  {
    id: "sku-8",
    slug: "flex-beige-modular",
    styleId: "style-flex",
    category: "combo",
    name: "Flex 米黄色组合",
    color: "米黄色 + 脚蹬",
    priceEur: 329,
    stock: 8,
    mainImage: "/assets/sku/sku-8-beige-ottoman.jpg",
    images: ["/assets/sku/sku-8-beige-ottoman.jpg"]
  }
];

export function getProductsByCategory(category: string) {
  return category === "all" ? products : products.filter((product) => product.category === category);
}
