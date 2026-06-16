const tabs = ["数据看板", "商品上架", "仓库管理", "订单与物流", "客户维护", "客服聊天"];

export default function AdminPage() {
  return (
    <main className="admin-layout">
      <aside className="admin-nav">
        <a className="brand" href="/">
          BoxSofa Admin
        </a>
        {tabs.map((tab) => (
          <a className="button" href={`#${tab}`} key={tab}>
            {tab}
          </a>
        ))}
      </aside>
      <section className="admin-main">
        <h1>商家后台</h1>
        <p>
          这是正式后台的页面骨架。下一步会接入 Supabase 登录、老板/客服角色权限、商品上传、订单状态、
          物流单号录入、客户会员和客服聊天数据。
        </p>
        <div className="panel">
          <h2>当前阶段</h2>
          <table className="table">
            <tbody>
              <tr>
                <th>支付</th>
                <td>暂不接真实支付，保留 Stripe 字段和接口位置</td>
              </tr>
              <tr>
                <th>仓库</th>
                <td>单仓发货</td>
              </tr>
              <tr>
                <th>物流</th>
                <td>后台手动录入物流公司和单号</td>
              </tr>
              <tr>
                <th>会员</th>
                <td>累计已确认付款满 EUR 300，下一单 9 折</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
