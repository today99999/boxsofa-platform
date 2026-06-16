import Link from "next/link";
import { products } from "@/lib/catalog";

const orders = [
  {
    id: "BX-04739182",
    customer: "Maria Garcia",
    country: "Spain",
    total: 328,
    status: "待确认付款",
    logistics: "未发货",
    createdAt: "2026-06-16 12:40"
  },
  {
    id: "BX-04739211",
    customer: "Lucas Martin",
    country: "France",
    total: 129,
    status: "待确认付款",
    logistics: "未发货",
    createdAt: "2026-06-16 13:18"
  },
  {
    id: "BX-04738590",
    customer: "Anna Rossi",
    country: "Italy",
    total: 657,
    status: "已确认付款",
    logistics: "等待录入单号",
    createdAt: "2026-06-15 18:22"
  }
];

const customers = [
  { name: "Maria Garcia", email: "maria@example.com", spent: 328, member: true, note: "已满 EUR 300，下一单 9 折" },
  { name: "Lucas Martin", email: "lucas@example.com", spent: 129, member: false, note: "普通客户" },
  { name: "Anna Rossi", email: "anna@example.com", spent: 657, member: true, note: "高意向客户，关注组合款" }
];

const messages = [
  { from: "Maria Garcia", channel: "在线客服", text: "请问西班牙马德里大概多久到？", time: "13:24" },
  { from: "访客 #1024", channel: "在线客服", text: "三人沙发可以进电梯吗？", time: "12:58" }
];

function money(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

export default function AdminPage() {
  const revenue = orders.filter((order) => order.status === "已确认付款").reduce((sum, order) => sum + order.total, 0);
  const pendingOrders = orders.filter((order) => order.status === "待确认付款").length;
  const lowStock = products.filter((product) => product.stock <= 10);
  const members = customers.filter((customer) => customer.member).length;

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
            <strong>{money(revenue)}</strong>
          </div>
          <div className="stat-card">
            <span>待确认付款订单</span>
            <strong>{pendingOrders}</strong>
          </div>
          <div className="stat-card">
            <span>低库存 SKU</span>
            <strong>{lowStock.length}</strong>
          </div>
          <div className="stat-card">
            <span>会员客户</span>
            <strong>{members}</strong>
          </div>
        </section>

        <section className="admin-grid-two">
          <div className="panel" id="orders">
            <div className="panel-head">
              <h2>订单与物流</h2>
              <span className="status">单仓发货</span>
            </div>
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
                        <span>{order.createdAt}</span>
                      </td>
                      <td>
                        {order.customer}
                        <br />
                        <span>{order.country}</span>
                      </td>
                      <td>{money(order.total)}</td>
                      <td>{order.status}</td>
                      <td>{order.logistics}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" id="products">
            <div className="panel-head">
              <h2>商品与库存</h2>
              <span className="status">10 个 SKU</span>
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
            <div className="customer-list">
              {customers.map((customer) => (
                <article className="mini-card" key={customer.email}>
                  <strong>{customer.name}</strong>
                  <span>{customer.email}</span>
                  <p>
                    累计消费 {money(customer.spent)} / {customer.member ? "会员 9 折" : "普通客户"}
                  </p>
                  <small>{customer.note}</small>
                </article>
              ))}
            </div>
          </div>

          <div className="panel" id="support">
            <div className="panel-head">
              <h2>客服聊天</h2>
              <span className="status">在线留言</span>
            </div>
            <div className="message-list">
              {messages.map((message) => (
                <article className="message-card" key={`${message.from}-${message.time}`}>
                  <strong>{message.from}</strong>
                  <span>
                    {message.channel} / {message.time}
                  </span>
                  <p>{message.text}</p>
                  <button className="button" type="button">
                    回复
                  </button>
                </article>
              ))}
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
