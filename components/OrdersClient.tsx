"use client";

import { useEffect, useState } from "react";
import { ORDERS_KEY, type LocalOrder } from "@/lib/cart";

function statusText(status: LocalOrder["status"]) {
  return {
    pending_confirm: "待商家确认付款"
  }[status];
}

export function OrdersClient() {
  const [orders, setOrders] = useState<LocalOrder[]>([]);

  useEffect(() => {
    setOrders(JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"));
  }, []);

  return (
    <section className="panel">
      <h1>我的订单</h1>
      {orders.length === 0 ? (
        <p>暂无订单。提交订单后，可以在这里查看状态。</p>
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div>
                <strong>{order.id}</strong>
                <p>{new Date(order.createdAt).toLocaleString("zh-CN")}</p>
              </div>
              <span className="status">{statusText(order.status)}</span>
              <p>合计：EUR {order.totalEur.toFixed(2)}</p>
              <p>物流：跨境物流预估 23-30 天，发货后后台录入单号。</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
