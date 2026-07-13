# BoxSofa Supabase 迁移计划

这份计划用于把当前浏览器本地原型，逐步升级为可上线运营的真实后台。

## 当前原则

- 先接数据库，不先接真实支付。
- 客户仍然先提交订单，订单进入 `pending_confirm`。
- 商家确认收款后，后台把订单改为 `paid_confirmed`。
- Stripe 等欧洲银行账户准备好后再启用。
- 所有流量统计必须在用户同意 analytics cookie 后才记录，避免 GDPR 风险。

## 第一阶段：数据库地基

运行 `supabase/schema.sql`，创建以下核心能力：

- 客户和员工账号：`profiles`
- 款式和 SKU：`product_styles`、`products`
- 图片、详情图、视频：`product_media`
- 库存流水：`inventory_movements`
- 订单和订单明细：`orders`、`order_items`
- 付款记录：`payments`
- 物流单号：`shipments`
- 客户评价：`product_reviews`
- 流量来源和转化：`analytics_consents`、`analytics_events`
- 邮件订阅：`newsletter_subscriptions`
- 客服聊天：`chat_threads`、`chat_messages`
- 后台操作记录：`admin_audit_log`

## 第二阶段：替换本地订单

把当前 `localStorage` 订单替换成 Next.js Route Handler：

1. 前台购物车提交订单。
2. 服务端写入 `orders` 和 `order_items`。
3. 后台从 Supabase 读取订单列表。
4. 客户登录后只读取自己的订单。
5. 未登录客户可后续用订单号和邮箱查询，查询逻辑走服务端接口。

## 第三阶段：后台真实操作

把后台现有本地原型改成真实数据库操作：

- 订单筛选和搜索读取 `orders`。
- 付款确认按钮写入 `payments`，并把订单改为 `paid_confirmed`。
- 物流单号录入写入 `shipments`。
- 会员状态由订单状态自动计算，满 EUR 300 成为会员。
- 商品价格和库存编辑写入 `products`。
- 库存变化同步记录到 `inventory_movements`。
- 评价置顶和删除写入 `product_reviews`。

## 第四阶段：商品批量导入

在产品字段都确认后，把 `lib/catalog.ts` 的真实商品迁入 Supabase：

- 每个款式写入 `product_styles`。
- 每个 SKU 写入 `products`。
- 主图、详情图、视频写入 `product_media`。
- 首页入口图使用 `product_styles.entry_product_id` 或 SKU 的 `is_entry_product`。

## 第五阶段：流量罗盘

上线前只记录匿名、低风险事件：

- 页面访问
- 商品浏览
- 加入购物车
- 开始结账
- 提交订单

记录字段只保留来源、路径、活动参数、商品、金额等运营字段，不保存完整 IP，不做个人画像。

## 第六阶段：支付上线

欧洲银行账户和 Stripe 准备好后再做：

- 创建 Stripe Checkout Session。
- 接 Stripe webhook。
- webhook 校验通过后写入 `payments`。
- 自动把订单状态更新为 `paid_confirmed` 或 `processing`。
- 保留商家手动确认付款能力，作为银行转账或其他线下付款方式的补充。

## 上线前检查

- Supabase RLS 已开启。
- 顾客地址、付款信息、订单明细不能公开读取。
- 后台操作需要商家或客服权限。
- 商品和公开评价可以公开读取。
- 流量统计需要 cookie 同意。
- 支付 webhook 必须只在服务端验证，不能在前端处理。
