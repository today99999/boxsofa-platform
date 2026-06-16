import type { Product } from "@/lib/catalog";

export type CartItem = {
  id: string;
  slug: string;
  name: string;
  color: string;
  priceEur: number;
  image: string;
  quantity: number;
};

export type LocalOrder = {
  id: string;
  createdAt: string;
  status: "pending_confirm";
  customerName: string;
  phone: string;
  email: string;
  address: string;
  items: CartItem[];
  subtotalEur: number;
  discountEur: number;
  shippingEur: number;
  totalEur: number;
};

export const CART_KEY = "boxsofa_cart_v1";
export const ORDERS_KEY = "boxsofa_orders_v1";

export function productToCartItem(product: Product, quantity: number): CartItem {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    color: product.color,
    priceEur: product.priceEur,
    image: product.mainImage,
    quantity
  };
}
