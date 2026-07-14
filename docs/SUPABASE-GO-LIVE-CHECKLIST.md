# BoxSofa Supabase 上线配置清单

这份清单用于把 BoxSofa 从本地原型切换到 Supabase PostgreSQL。当前代码已经支持未配置 Supabase 时自动回落到本地原型，但生产环境应以 Supabase 为准。

## 1. Vercel 环境变量

在 Vercel Project Settings -> Environment Variables 添加：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://boxsofa.eu`

注意：

- `SUPABASE_SERVICE_ROLE_KEY` 只能放在服务端环境变量，不要写入前端代码或公开文档。
- 本地开发可放入 `.env.local`，不要提交到 GitHub。

当前状态：

- 生产环境 Supabase 变量已配置。
- 生产环境 `NEXT_PUBLIC_SITE_URL` 已配置为 `https://boxsofa.eu`。

## 2. 数据库 schema

在 Supabase SQL Editor 执行：

- `supabase/schema.sql`

当前 schema 包含：

- 商品、订单、会员、评价、数据罗盘、客服聊天相关表
- RLS 策略
- 聊天表 realtime publication
- 客服会话 `customer_access_token_hash`，用于保护客户聊天记录
- 后台操作日志表 `admin_audit_log`

## 3. 客服聊天落库与实时刷新

客户前台提交在线客服时：

- 写入 `chat_threads`
- 写入 `chat_messages`
- 服务端生成 `accessToken`
- 数据库只保存 `accessToken` 的 SHA-256 hash

客户继续留言或读取客服回复时：

- 必须同时带 `threadId + accessToken`
- 不能只靠 `threadId` 读取聊天内容

商家后台：

- 通过 `/api/admin/support` 读取全部会话
- 通过 `/api/admin/support/[threadId]` 回复或关闭会话
- 需要 Supabase 商家权限后才允许访问
- 页面同时使用 realtime 订阅和 15 秒轮询兜底

## 4. 商家账号权限

后台 API 通过 `profiles.role` 判断权限。

允许进入后台的角色：

- `owner`
- `service`

上线前需要：

1. 在 Supabase Auth 创建商家账号。
2. 在 `profiles` 表中把对应用户的 `role` 设置为 `owner` 或 `service`。
3. 用该账号登录后访问 `/admin`。

## 5. Supabase Auth 生产配置

生产环境需要确认：

- Site URL: `https://boxsofa.eu`
- Redirect URLs 至少包含生产域名和 Vercel 回退域名。
- 客户账号登录后进入 `/orders`。
- 商家账号登录后进入 `/admin`。

当前状态：

- Supabase Auth URL Configuration 已确认：
  - Site URL: `https://boxsofa.eu`
  - Redirect URLs:
    - `https://boxsofa.eu/**`
    - `https://www.boxsofa.eu/**`
    - `https://boxsofa-platform.vercel.app/**`
- Supabase Auth 泄露密码保护暂时无法开启，因为当前 Supabase 组织是 Free 计划。后台明确提示 HaveIBeenPwned leaked password protection 需要 Pro Plan 或更高套餐。

升级到 Pro 后处理路径：

1. Supabase Dashboard -> Authentication -> Attack Protection。
2. 点击 Email provider 的 Configure。
3. 打开 `Prevent use of leaked passwords`。
4. 保存后重新运行 Supabase Security Advisor。

## 6. 上线前验证

至少验证以下流程：

- 前台提交客服咨询后，Supabase `chat_threads` 出现一条 open 会话。
- Supabase `chat_messages` 出现客户消息。
- 商家后台客服工作台出现待回复会话。
- 商家回复后，前台聊天窗口能看到客服回复。
- 关闭会话后，状态变为 closed。
- 未配置 Supabase 环境变量时，本地原型仍然可用。

## 7. 客户后台资料与默认地址

客户后台 `/orders` 已经支持读取和保存客户资料：

- `/api/customer/profile` `GET`：读取当前登录客户的 `profiles` 和默认 `addresses`。
- `/api/customer/profile` `PUT`：保存客户姓名、电话、营销订阅和默认收货地址。
- `/api/customer/orders`：读取当前登录客户名下的真实订单。
- `/api/orders`：如果客户已通过 Supabase 登录，下单时会自动写入 `orders.customer_id`。

上线前需要验证：

1. 客户邮箱登录后进入 `/orders`。
2. 保存姓名、电话和地址后，Supabase `profiles` 与 `addresses` 有对应记录。
3. 登录状态下提交新订单后，`orders.customer_id` 等于该客户的 `profiles.id`。
4. 客户后台只能看到自己的订单，不能看到其他客户订单。

## 8. 已购客户评价

产品评价已经加上真实购买校验：

- 本地原型模式：仍可提交本地评价，方便测试页面展示。
- Supabase 模式：客户必须先登录，并且订单中购买过该产品，才可以提交评价。
- 可评价订单状态：`paid_confirmed`、`processing`、`shipped`、`completed`。
- 成功提交后会写入 `product_reviews.customer_id` 和对应 `order_id`。
- 商家后台可置顶或删除评价。

上线前需要验证：

1. 未登录客户提交评价时应被拦截。
2. 登录但未购买该产品的客户应被拦截。
3. 已确认付款或已发货订单里的商品可以提交评价。
4. 商家后台可以看到该评价，并能置顶或删除。

## 9. 后台操作审计

以下商家后台动作会写入 `admin_audit_log`：

- 订单状态更新、付款确认、物流单号录入
- 商品价格、库存、上架状态修改
- 客户评价置顶、取消置顶、删除

审计记录包含：

- 操作人 `actor_id`
- 操作类型 `action`
- 对象类型 `entity_type`
- 对象 ID `entity_id`
- 修改前数据 `before_data`
- 修改后数据 `after_data`

上线前需要验证：

1. 商家确认付款后，`admin_audit_log` 出现 `order_update`。
2. 商家修改库存后，出现 `product_update`。
3. 商家置顶或删除评价后，出现 `review_pin_update` 或 `review_delete`。

## 10. 当前生产状态

2026-07-14 已确认：

- Resend 域名 `boxsofa.eu` 已验证。
- Vercel 已配置 `EMAIL_PROVIDER=resend`、`EMAIL_FROM=BoxSofa <orders@boxsofa.eu>`、`EMAIL_API_KEY`。
- Supabase Auth Site URL 与 Redirect URLs 已配置到生产域名。
- 已触发 Vercel Production redeploy。
- `npm.cmd run production:verify` 已通过。
- `/api/health` 生产检查中 `emailProviderConfigured` 为 `true`。
- `/api/health` 生产检查中 `paymentEnabled` 保持 `false`。

## 11. 下一步

- 完成生产环境客户登录、商家登录、订单、评价、客服、通知邮件的端到端验证。
- 全站可见文案和乱码最终清理。
- 所有非支付项确认后，再进行 Stripe 支付接入。
