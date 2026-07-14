# BoxSofa Supabase 上线配置清单

这份清单用于把 BoxSofa 从本地原型切换到 Supabase PostgreSQL。生产环境应以 Supabase 为准；购物车、语言选择、Cookie 同意等前端状态仍可保留在浏览器本地。

## 1. Vercel 环境变量

生产环境必须配置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://boxsofa.eu`

邮件通知已配置：

- `EMAIL_PROVIDER=resend`
- `EMAIL_FROM=BoxSofa <orders@boxsofa.eu>`
- `EMAIL_API_KEY`

注意：

- `SUPABASE_SERVICE_ROLE_KEY` 只能放在服务端环境变量，不能写入前端代码或公开文档。
- 支付仍保持关闭，Stripe 放在最后一步。

## 2. 数据库 Schema

数据库已包含：

- 商品、款式、媒体、库存。
- 订单、订单项、付款确认、物流。
- 客户资料、地址、会员状态。
- 商品评价。
- 数据罗盘事件。
- 客服聊天线程和消息。
- 邮件通知队列。
- 后台操作日志 `admin_audit_log`。

关键安全要求：

- 所有公开 schema 表启用 RLS。
- 后台接口必须通过 `profiles.role` 判断权限。
- 客户只能读取自己的订单、资料和评价权限范围内的数据。
- 客服聊天的客户访问令牌只保存 SHA-256 hash。

## 3. 商家账号权限

后台允许角色：

- `owner`
- `service`

当前状态：

- `owner@boxsofa.eu` 是正式老板账号，未禁用。
- 自动测试账号 `seller-test@boxsofa.eu` 已禁用，保留审计引用。

上线前必须确认：

1. 正式老板账号可登录。
2. 登录后自动进入 `/admin`。
3. 测试账号不能再登录。

## 4. Supabase Auth 生产配置

当前已确认：

- Site URL: `https://boxsofa.eu`
- Redirect URLs:
  - `https://boxsofa.eu/**`
  - `https://www.boxsofa.eu/**`
  - `https://boxsofa-platform.vercel.app/**`

已知限制：

- Supabase Security Advisor 仍提示 leaked password protection 未开启。
- Supabase Dashboard 显示该功能需要 Pro Plan 或更高套餐。
- 这是当前免费套餐限制，不是代码阻断；当前未接真实支付，可以作为已知风险暂缓处理。
- 接入 Stripe 真实支付、稳定销售后，或增加多人后台账号前，再升级套餐并开启。

升级到 Pro 后处理：

1. 进入 Supabase Dashboard -> Authentication -> Attack Protection。
2. 打开 leaked password protection。
3. 重新运行 Supabase Security Advisor。

## 5. 客服聊天

前台客户提交在线客服时：

- 写入 `chat_threads`。
- 写入 `chat_messages`。
- 服务端生成客户访问 token。
- 数据库只保存 token hash。

后台客服工作台：

- `/api/admin/support` 读取会话。
- `/api/admin/support/[threadId]` 回复或关闭会话。
- 使用 Supabase realtime 订阅，并保留 15 秒轮询兜底。

上线前验证：

1. 前台提交咨询后，后台出现待回复会话。
2. 后台回复后，前台聊天窗口可看到回复。
3. 关闭会话后状态变为 closed。

## 6. 客户后台

客户后台 `/orders` 支持：

- 读取当前登录客户订单。
- 保存客户姓名、电话、默认地址。
- 显示会员进度和折扣状态。

上线前验证：

1. 客户邮箱登录后进入 `/orders`。
2. 保存姓名、电话、地址后，Supabase 有对应记录。
3. 登录状态下提交订单时，`orders.customer_id` 写入当前客户 ID。
4. 客户只能看到自己的订单。

## 7. 商品评价

当前逻辑：

- 未登录客户不能提交真实数据库评价。
- 登录但未购买该商品的客户不能提交真实数据库评价。
- 已确认付款、已发货或已完成订单中的商品可以评价。
- 商家后台可以置顶或删除真实数据库评价。
- 示例评价只用于前台展示，不参与后台操作。

当前状态：

- 自动测试评价已清理。
- 数据库真实评价当前为 0 条。

## 8. 订单、邮件和测试数据清理

2026-07-14 已清理：

- 自动测试订单 `BX-48197139`。
- 自动测试订单 `BX-60223689`。
- 相关订单项、付款记录、物流记录、邮件通知、测试评价。

当前保留：

- `BX-83704353`，邮箱 `240930747@qq.com`，状态为待确认付款。该订单看起来可能是人工测试或真实测试，暂不删除。

当前测试账号状态：

- `buyer-test@boxsofa.eu` 已禁用到 2999-01-01。
- `seller-test@boxsofa.eu` 已禁用到 2999-01-01。

## 9. 后台操作日志

以下动作会写入 `admin_audit_log`：

- 订单状态更新、付款确认、物流单号录入。
- 商品价格、库存、上架状态修改。
- 评价置顶、取消置顶、删除。
- 邮件通知发送、跳过、重新排队。

上线前验证：

1. 付款确认后出现订单操作日志。
2. 修改库存或价格后出现商品操作日志。
3. 管理评价后出现评价操作日志。

## 10. 已通过的生产验证

当前已通过：

- `https://boxsofa.eu`
- `https://www.boxsofa.eu`
- 页面 smoke。
- SEO audit。
- API auth audit。
- Production readiness。
- Vercel 24 小时 runtime error 检查无错误。
- Supabase security advisor 只有免费套餐限制项。
- Supabase performance advisor 只有 INFO 级 unused index，等待真实流量后再评估。

标准验证命令：

```powershell
npm.cmd run production:verify
```

预期结果：

- smoke passed
- SEO audit passed
- API auth audit passed
- production readiness passed
- `paymentEnabled` 保持 `false`

## 11. 下一步

支付前剩余重点：

1. 用正式老板账号再验证一次后台订单、商品、客服、评价、邮件通知。
2. 清理或确认唯一保留的 QQ 邮箱订单。
3. 全站可见文案最终检查。
4. 最后再进入 Stripe 支付接入。
