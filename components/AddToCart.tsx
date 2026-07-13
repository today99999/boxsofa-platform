"use client";

import { useState } from "react";
import { CART_KEY, productToCartItem } from "@/lib/cart";
import type { Product } from "@/lib/catalog";
import { trackEvent } from "@/lib/analytics";
import { translateCatalogText } from "@/lib/catalogI18n";
import { useTranslation } from "@/components/useTranslation";

type Props = {
  product: Product;
};

export function AddToCart({ product }: Props) {
  const { language, t } = useTranslation();
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");

  function addToCart(goToCart = false) {
    const existing = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    const index = existing.findIndex((item: { id: string }) => item.id === product.id);
    if (index >= 0) {
      existing[index].quantity += quantity;
    } else {
      existing.push(productToCartItem(product, quantity));
    }
    localStorage.setItem(CART_KEY, JSON.stringify(existing));
    trackEvent(goToCart ? "begin_checkout" : "add_to_cart", {
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      valueEur: product.priceEur * quantity
    });
    setMessage(`${translateCatalogText(product.name, language, "name")} ${t("addedToCart")}`);
    window.dispatchEvent(new Event("boxsofa-cart-updated"));
    if (goToCart) window.location.href = "/cart";
  }

  return (
    <div className="buy-actions">
      <div className="qty-stepper" aria-label={t("quantity")}>
        <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
          -
        </button>
        <span>{quantity}</span>
        <button type="button" onClick={() => setQuantity(Math.min(99, quantity + 1))}>
          +
        </button>
      </div>
      <button className="button" type="button" onClick={() => addToCart(false)}>
        {t("addToCart")}
      </button>
      <button className="button primary" type="button" onClick={() => addToCart(true)}>
        {t("buyNow")}
      </button>
      {message ? <p className="inline-note">{message}</p> : null}
    </div>
  );
}
