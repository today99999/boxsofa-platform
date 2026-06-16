export type CategorySlug = "single" | "double" | "triple" | "combo";

export type Product = {
  id: string;
  slug: string;
  styleId: string;
  category: CategorySlug;
  name: string;
  color: string;
  description: string;
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
    description: "清爽蓝色单人款，适合书房、卧室和小户型角落。",
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
    description: "沉稳咖啡色，适合温暖木色和简约空间。",
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
    description: "柔和明亮的双人位，适合出租屋和小客厅。",
    priceEur: 199,
    stock: 20,
    mainImage: "/assets/sku/sku-3-beige.jpg",
    images: ["/assets/sku/sku-3-beige.jpg"]
  },
  {
    id: "sku-4",
    slug: "lite-yellow",
    styleId: "style-lite",
    category: "double",
    name: "Lite 柠檬黄",
    color: "柠檬黄",
    description: "更活泼的双人款颜色，适合年轻化客厅。",
    priceEur: 199,
    stock: 9,
    mainImage: "/assets/sku/sku-4-yellow.jpg",
    images: ["/assets/sku/sku-4-yellow.jpg"]
  },
  {
    id: "sku-5",
    slug: "lite-grey",
    styleId: "style-lite",
    category: "double",
    name: "Lite 神秘灰",
    color: "神秘灰",
    description: "耐看灰色双人款，容易搭配多数家居风格。",
    priceEur: 199,
    stock: 16,
    mainImage: "/assets/sku/sku-5-grey.jpg",
    images: ["/assets/sku/sku-5-grey.jpg"]
  },
  {
    id: "sku-6",
    slug: "cloud-blue-ottoman",
    styleId: "style-cloud",
    category: "triple",
    name: "Cloud 星空蓝 + 脚蹬",
    color: "星空蓝 + 脚蹬",
    description: "三人位加脚蹬，适合客厅主位和观影区。",
    priceEur: 289,
    stock: 12,
    mainImage: "/assets/sku/sku-6-blue-ottoman.jpg",
    images: ["/assets/sku/sku-6-blue-ottoman.jpg"]
  },
  {
    id: "sku-7",
    slug: "cloud-coffee-ottoman",
    styleId: "style-cloud",
    category: "triple",
    name: "Cloud 咖啡色 + 脚蹬",
    color: "咖啡色 + 脚蹬",
    description: "温暖沉稳的三人位方案，适合家庭客厅。",
    priceEur: 289,
    stock: 10,
    mainImage: "/assets/sku/sku-7-coffee-ottoman.jpg",
    images: ["/assets/sku/sku-7-coffee-ottoman.jpg"]
  },
  {
    id: "sku-8",
    slug: "flex-beige-modular",
    styleId: "style-flex",
    category: "combo",
    name: "Flex 米黄色组合",
    color: "米黄色 + 脚蹬",
    description: "模块化脚蹬组合，适合会客和临时休息。",
    priceEur: 329,
    stock: 8,
    mainImage: "/assets/sku/sku-8-beige-ottoman.jpg",
    images: ["/assets/sku/sku-8-beige-ottoman.jpg"]
  },
  {
    id: "sku-9",
    slug: "flex-yellow-modular",
    styleId: "style-flex",
    category: "combo",
    name: "Flex 柠檬黄组合",
    color: "柠檬黄 + 脚蹬",
    description: "更醒目的组合方案，为客厅增加亮点。",
    priceEur: 329,
    stock: 7,
    mainImage: "/assets/sku/sku-9-yellow-ottoman.jpg",
    images: ["/assets/sku/sku-9-yellow-ottoman.jpg"]
  },
  {
    id: "sku-10",
    slug: "flex-grey-modular",
    styleId: "style-flex",
    category: "combo",
    name: "Flex 神秘灰组合",
    color: "神秘灰 + 脚蹬",
    description: "经典灰色组合款，兼顾耐脏和百搭。",
    priceEur: 329,
    stock: 11,
    mainImage: "/assets/sku/sku-10-grey-ottoman.jpg",
    images: ["/assets/sku/sku-10-grey-ottoman.jpg"]
  }
];

export function getProductsByCategory(category: string) {
  return category === "all" ? products : products.filter((product) => product.category === category);
}

export function getProductBySlug(slug: string) {
  return products.find((product) => product.slug === slug);
}
