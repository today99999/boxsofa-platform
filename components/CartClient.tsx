"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CART_KEY, ORDERS_KEY, type CartItem, type LocalOrder } from "@/lib/cart";

function money(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

export function CartClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<LocalOrder | null>(null);

  useEffect(() => {
    setItems(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.priceEur * item.quantity, 0), [items]);
  const shipping = subtotal >= 999 || subtotal === 0 ? 0 : 39;
  const total = subtotal + shipping;

  function saveCart(nextItems: CartItem[]) {
    setItems(nextItems);
    localStorage.setItem(CART_KEY, JSON.stringify(nextItems));
    window.dispatchEvent(new Event("boxsofa-cart-updated"));
  }

  function updateQuantity(id: string, quantity: number) {
    saveCart(items.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item)));
  }

  function removeItem(id: string) {
    saveCart(items.filter((item) => item.id !== id));
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const order: LocalOrder = {
      id: `BX-${Date.now().toString().slice(-8)}`,
      createdAt: new Date().toISOString(),
      status: "pending_confirm",
      customerName: String(form.get("customerName") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      address: String(form.get("address") || ""),
      items,
      subtotalEur: subtotal,
      discountEur: 0,
      shippingEur: shipping,
      totalEur: total
    };
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
    localStorage.setItem(ORDERS_KEY, JSON.stringify([order, ...orders]));
    localStorage.removeItem(CART_KEY);
    setItems([]);
    setSubmittedOrder(order);
  }

  if (submittedOrder) {
    return (
      <div className="panel success-panel">
        <h1>订单已提交</h1>
        <p>订单号：{submittedOrder.id}</p>
        <p>商家会联系你确认付款方式。当前版本暂不接真实支付，后续开通欧洲银行账户后再接 Stripe。</p>
        <a className="button primary" href="/orders">
          查看我的订单
        </a>
      </div>
    );
  }

  return (
    <div className="checkout-layout">
      <section className="panel">
        <h1>购物车</h1>
        {items.length === 0 ? (
          <p>购物车为空，请先选择商品。</p>
        ) : (
          <div className="cart-list">
            {items.map((item) => (
              <article className="cart-row" key={item.id}>
                <img src={item.image} alt={item.name} />
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.color}</p>
                  <p>{money(item.priceEur)}</p>
                </div>
                <input
                  min={1}
                  type="number"
                  value={item.quantity}
                  onChange={(event) => updateQuantity(item.id, Number(event.target.value))}
                />
                <button className="button" type="button" onClick={() => removeItem(item.id)}>
                  移除
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="panel checkout-form" onSubmit={submitOrder}>
        <h2>收货信息</h2>
        <label>
          姓名
          <input name="customerName" required />
        </label>
        <label>
          电话
          <input name="phone" required />
        </label>
        <label>
          邮箱
          <input name="email" required type="email" />
        </label>
        <label>
          欧洲收货地址
          <textarea name="address" required rows={4} />
        </label>
        <div className="summary-lines">
          <span>商品小计</span>
          <strong>{money(subtotal)}</strong>
          <span>基础配送</span>
          <strong>{money(shipping)}</strong>
          <span>合计</span>
          <strong>{money(total)}</strong>
        </div>
        <button className="button primary" disabled={items.length === 0} type="submit">
          提交订单
        </button>
      </form>
    </div>
  );
}
