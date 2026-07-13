# BoxSofa Supabase 上线配置清单

这份清单用于把当前本地原型切换到 Supabase PostgreSQL。当前代码已经支持未配置 Supabase 时自动回落到本地原型。

## 1. Vercel 环境变量

在 Vercel Project Settings -> Environment Variables 添加：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

注意：

- `SUPABASE_SERVICE_ROLE_KEY` 只能放在服务端环境变量，不要写入前端代码或公开文档。
- 本地开发可放入 `.env.local`，不要提交到 GitHub。

## 2. 数据库 schema

在 Supabase SQL Editor 执行：

- `supabase/schema.sql`

当前 schema 包含：

- 商品、订单、会员、评价、数据罗盘、客服聊天相关表
- RLS 策略
- 聊天表 realtime publication
- 客服会话 `customer_access_token_hash`，用于保护客户聊天记录

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

## 5. 上线前验证

至少验证以下流程：

- 前台提交客服咨询后，Supabase `chat_threads` 出现一条 open 会话。
- Supabase `chat_messages` 出现客户消息。
- 商家后台客服工作台出现待回复会话。
- 商家回复后，前台聊天窗口能看到客服回复。
- 关闭会话后，状态变为 closed。
- 未配置 Supabase 环境变量时，本地原型仍然可用。

## 6. 下一步建议

- 把当前本地登录原型升级为 Supabase Auth。
- 给客户后台订单查询接 Supabase。
- 商品、订单、评价、客服全部确认后，再接 Stripe。

## 7. Supabase Auth 登录与后台权限

当前登录页已经支持两种模式：

- 邮箱账号：如果配置了 Supabase 环境变量，会优先走 Supabase Auth。
- 非邮箱账号：保留本地原型登录，方便开发阶段继续测试客户后台和商家后台。

上线前建议处理：

1. 在 Supabase Auth 创建真实账号。
2. 在 `profiles` 表给账号设置角色：
   - `owner`：老板/管理员，可进入商家后台。
   - `service`：客服/运营，可进入商家后台。
   - `customer`：买家，只进入客户后台。
3. 用邮箱账号测试 `/login`：
   - `owner` / `service` 登录后应进入 `/admin`。
   - `customer` 登录后应进入 `/orders`。
4. 确认无误后，生产环境应关闭或限制本地原型登录，避免非邮箱测试账号进入后台。

相关接口：

- `/api/auth/profile`：读取当前 Supabase 登录用户，并返回 `profiles.role`。

## 8. 客户后台资料与默认地址

客户后台 `/orders` 已经支持读取和保存客户资料：

- `/api/customer/profile` `GET`：读取当前登录客户的 `profiles` 和默认 `addresses`。
- `/api/customer/profile` `PUT`：保存客户姓名、电话、营销订阅和默认收货地址。
- `/api/customer/orders`：读取当前登录客户名下的真实订单。
- `/api/orders`：如果客户已通过 Supabase 登录，下单时会自动写入 `orders.customer_id`，用于客户后台订单归属和会员累计金额计算。

上线前需要验证：

1. 客户邮箱登录后进入 `/orders`。
2. 保存姓名、电话和地址后，Supabase `profiles` 与 `addresses` 有对应记录。
3. 登录状态下提交新订单后，`orders.customer_id` 等于该客户的 `profiles.id`。
4. 客户后台能看到自己的数据库订单，不能看到其他客户订单。

## 9. 已购客户评价

产品评价已经加上真实购买校验：

- 本地原型模式：仍可提交本地评价，方便测试页面展示。
- Supabase 模式：客户必须先登录，并且订单中购买过该产品，才可以提交评价。
- 可评价订单状态：`paid_confirmed`、`processing`、`shipped`、`completed`。
- 成功提交后会写入 `product_reviews.customer_id` 和对应 `order_id`，商家后台仍可置顶或删除。

上线前需要验证：

1. 未登录客户提交评价时应被拦截。
2. 登录但未购买该产品的客户应被拦截。
3. 已确认付款或已发货订单里的商品可以提交评价。
4. 商家后台可以看到该评价，并能置顶或删除。

## 10. 后台操作审计

以下商家后台动作会写入 `admin_audit_log`：

- 订单状态更新、付款确认、物流单号录入。
- 商品价格、库存、上架状态修改。
- 客户评价置顶、取消置顶、删除。

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

## 11. Admin audit log viewer

Current admin UI now includes an `audit` section named `操作日志`.

- API: `/api/admin/audit`
- Data source: Supabase table `admin_audit_log`
- Access rule: merchant admin access is required before logs can be read
- Local mode: when Supabase service role env vars are missing, the page shows an empty local-state note instead of crashing
- Admin UI: the section lists the latest 80 audit records with time, action, entity, actor, and changed payload preview

Go-live checks:

1. Sign in as `owner` or `service`.
2. Update an order, product, or review in the admin UI.
3. Open `/admin#audit` and confirm the new audit row appears.
4. Confirm non-merchant users cannot read `/api/admin/audit`.