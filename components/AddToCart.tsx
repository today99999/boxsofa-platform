"use client";

import { useState } from "react";
import { CART_KEY, productToCartItem } from "@/lib/cart";
import type { Product } from "@/lib/catalog";

type Props = {
  product: Product;
};

export function AddToCart({ product }: Props) {
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
    setMessage(`${product.name} 已加入购物车`);
    window.dispatchEvent(new Event("boxsofa-cart-updated"));
    if (goToCart) window.location.href = "/cart";
  }

  return (
    <div className="buy-actions">
      <div className="qty-stepper" aria-label="购买数量">
        <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
          -
        </button>
        <span>{quantity}</span>
        <button type="button" onClick={() => setQuantity(Math.min(99, quantity + 1))}>
          +
        </button>
      </div>
      <button className="button" type="button" onClick={() => addToCart(false)}>
        加入购物车
      </button>
      <button className="button primary" type="button" onClick={() => addToCart(true)}>
        立即下单
      </button>
      {message ? <p className="inline-note">{message}</p> : null}
    </div>
  );
}
