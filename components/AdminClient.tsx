"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ORDERS_KEY, type LocalOrder } from "@/lib/cart";
import { products } from "@/lib/catalog";

function money(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function statusText(status: LocalOrder["status"]) {
  return {
    pending_confirm: "待确认付款"
  }[status];
}

export function AdminClient() {
  const [orders, setOrders] = useState<LocalOrder[]>([]);

  useEffect(() => {
    setOrders(JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"));
  }, []);

  const lowStock = products.filter((product) => product.stock <= 10);
  const customers = useMemo(() => {
    const map = new Map<string, { name: string; email: string; spent: number; orders: number; member: boolean }>();
    orders.forEach((order) => {
      const key = order.email || order.phone || order.customerName;
      const existing = map.get(key) ?? {
        name: order.customerName,
        email: order.email,
        spent: 0,
        orders: 0,
        member: false
      };
      existing.orders += 1;
      existing.spent += order.status === "pending_confirm" ? 0 : order.totalEur;
      existing.member = existing.spent >= 300;
      map.set(key, existing);
    });
    return Array.from(map.values());
  }, [orders]);

  return (
    <main className="admin-layout">
      <aside className="admin-nav">
        <Link className="brand" href="/">
          BoxSofa Admin
        </Link>
        <a className="button" href="#dashboard">
          数据看板
        </a>
        <a className="button" href="#orders">
          订单与物流
        </a>
        <a className="button" href="#products">
          商品与库存
        </a>
        <a className="button" href="#customers">
          客户会员
        </a>
        <a className="button" href="#support">
          客服聊天
        </a>
        <Link className="button" href="/">
          返回前台
        </Link>
      </aside>

      <section className="admin-main">
        <div className="admin-title">
          <div>
            <p className="eyebrow">BoxSofa 运营后台</p>
            <h1>今日待处理</h1>
          </div>
          <div className="role-switch">
            <span>当前角色</span>
            <strong>老板 / 客服</strong>
          </div>
        </div>

        <section className="admin-stat-grid" id="dashboard">
          <div className="stat-card">
            <span>已确认销售额</span>
            <strong>{money(0)}</strong>
          </div>
          <div className="stat-card">
            <span>待确认付款订单</span>
            <strong>{orders.length}</strong>
          </div>
          <div className="stat-card">
            <span>低库存 SKU</span>
            <strong>{lowStock.length}</strong>
          </div>
          <div className="stat-card">
            <span>会员客户</span>
            <strong>{customers.filter((customer) => customer.member).length}</strong>
          </div>
        </section>

        <section className="admin-grid-two">
          <div className="panel" id="orders">
            <div className="panel-head">
              <h2>订单与物流</h2>
              <span className="status">本地原型数据</span>
            </div>
            {orders.length === 0 ? (
              <div className="empty-state">
                <strong>暂无订单</strong>
                <p>前台提交订单后，会先出现在这里。接入 Supabase 后，订单会保存到真实数据库。</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>订单</th>
                      <th>客户</th>
                      <th>金额</th>
                      <th>状态</th>
                      <th>物流</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
                          <br />
                          <span>{new Date(order.createdAt).toLocaleString("zh-CN")}</span>
                        </td>
                        <td>
                          {order.customerName}
                          <br />
                          <span>{order.email || order.phone}</span>
                        </td>
                        <td>{money(order.totalEur)}</td>
                        <td>{statusText(order.status)}</td>
                        <td>未发货，等待后台录入单号</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel" id="products">
            <div className="panel-head">
              <h2>商品与库存</h2>
              <span className="status">{products.length} 个 SKU</span>
            </div>
            <div className="stock-list">
              {products.map((product) => (
                <article className="stock-row" key={product.id}>
                  <img src={product.mainImage} alt={product.name} />
                  <div>
                    <strong>{product.name}</strong>
                    <p>{product.color}</p>
                  </div>
                  <span className={product.stock <= 10 ? "stock low" : "stock"}>{product.stock}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-grid-two">
          <div className="panel" id="customers">
            <div className="panel-head">
              <h2>客户会员</h2>
              <span className="status">满 EUR 300 自动会员</span>
            </div>
            {customers.length === 0 ? (
              <div className="empty-state">
                <strong>暂无客户</strong>
                <p>客户提交订单后，会自动出现在这里。未确认付款的订单不会计入会员累计消费。</p>
              </div>
            ) : (
              <div className="customer-list">
                {customers.map((customer) => (
                  <article className="mini-card" key={customer.email}>
                    <strong>{customer.name}</strong>
                    <span>{customer.email}</span>
                    <p>
                      订单 {customer.orders} 笔 / 累计已付款 {money(customer.spent)} /{" "}
                      {customer.member ? "会员 9 折" : "普通客户"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="panel" id="support">
            <div className="panel-head">
              <h2>客服聊天</h2>
              <span className="status">待接入实时数据</span>
            </div>
            <div className="empty-state">
              <strong>暂无真实留言</strong>
              <p>当前在线客服按钮还只是入口展示。接入 Supabase 后，这里会显示真实客户留言和客服回复。</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>支付预留</h2>
            <span className="status">Stripe 暂不开启</span>
          </div>
          <p>
            当前订单先进入“待确认付款”，由商家联系客户确认付款方式。欧洲银行账户开通后，再启用 Stripe Checkout、
            webhook 自动回写付款状态，并把已付款金额累计到会员系统。
          </p>
        </section>
      </section>
    </main>
  );
}
