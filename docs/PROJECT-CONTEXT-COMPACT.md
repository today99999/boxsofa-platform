# BoxSofa Project Context Compact

更新时间：2026-07-14

## 0. 2026-07-18 最新状态（优先于下方旧记录）

- Stripe 正式支付已经启用并完成真实下单链路验证；支付取消订单也已在商家后台处理。
- 客户注册后无法登录的问题已修复：未确认邮箱时显示明确提示，并提供重新发送确认邮件入口。
- Google Merchant Center 已完成 6/6 设置，商家 ID `5826490678`。
- `boxsofa.eu` 已通过 HTML 元标记验证，西班牙为首个目标市场，商品语言为英语。
- 网站已提供 `https://boxsofa.eu/google-merchant-feed.tsv`，Google 已导入 144 个 SKU；当前全部处于 Google 审核中，后台显示没有需要修正的设置或政策问题。
- 西班牙基础配送免费，Merchant Center 配送承诺为 23-30 个工作日，时区为马德里。
- 退货政策：收货后 14 个自然日；非质量问题由客户承担退运费，预计最高为商品购买价格的 50%；无重新上架费；质量问题、运输损坏或错发由 BoxSofa 承担合理退运费用；退款处理期 14 天。
- Google Search Console 已添加并自动验证 `https://boxsofa.eu/` 网址前缀资源，`sitemap.xml` 已提交。新资源正在处理数据，初次显示“无法抓取”时网站端检查为 HTTP 200 和有效 XML，可等待 Google 异步处理。
- 第一阶段免费推广（Google 免费商品展示 + Search Console）配置已完成，下一阶段是建立短视频渠道与首批内容。
- `info@boxsofa.eu` 目前仍没有真正邮箱收件箱；Namecheap 邮件转发因域名未使用其默认 DNS 而不可用。不要为启用邮件转发切换 nameserver，以免影响网站 DNS。
- 最近相关提交：`0e373b2 Publish live payment and return policies`、`7633ea4 Add Google Merchant product feed`、`a11e0d9 Add Google site verification`。

## 1. 项目目标

BoxSofa 是面向欧洲市场的压缩海绵沙发独立站，不是 WordPress。当前目标是在不接真实支付的前提下完成可上线版本：展示真实商品、接收订单、商家后台处理订单与客户、收集流量来源、支持客服聊天、客户登录、邮件通知和 SEO 基础。Stripe 支付放到最后一步，必须人工确认后再开启。

线上域名：
- `https://boxsofa.eu`
- `https://www.boxsofa.eu`
- Vercel: `https://boxsofa-platform.vercel.app`

GitHub：`https://github.com/today99999/boxsofa-platform`

## 2. 当前目录结构

项目根目录：`D:\沙发网站\boxsofa-platform`

主要目录：
- `app/`：Next.js App Router 页面和 API。
- `components/`：前台、后台、购物车、登录、客服、评价等 React 组件。
- `lib/`：商品数据、语言、Supabase、订单、邮件、统计、权限等逻辑。
- `public/`：商品图片、视频等静态资源。
- `scripts/`：构建、上线前检查、SEO、API 权限、生产验证脚本。
- `supabase/`：数据库 schema 和迁移相关 SQL。
- `docs/`：交接、上线、部署、产品资料整理文档。

外部资料目录：
- 厂家资料：`D:\沙发网站\厂家资料-待整理`
- 视频资料：`D:\压缩沙发\沙发视频\产品视频`

## 3. 完成的功能

前台：
- 首页、全部沙发分类页、产品详情页。
- 约 23 个款式入口；详情页按座位/颜色选择 SKU。
- 购物车、提交订单、订单查询。
- 多语言入口：英语、西班牙语、法语、德语；中文仍可作为买家/整理阶段使用。
- 产品评价展示与提交。
- 客服聊天入口。
- Footer、政策页、FAQ、配送、退换货、隐私、条款。
- SEO 基础：`robots.txt`、`sitemap.xml`、页面 metadata、结构化数据检查。

后台：
- 商家登录后进入后台。
- 数据看板、数据罗盘、订单与物流、商品与库存、客户评价、客户会员、客服聊天、低库存提醒、操作日志、邮件通知、上线检查。
- 订单筛选、确认付款、物流单号录入。
- 商品库存/价格编辑入口。
- 客户会员状态：累计确认付款满 EUR 300 后成为会员，之后购物 9 折。
- 评论置顶/删除。
- 客服聊天工作台。
- 邮件通知队列；订单/付款/物流变更会生成通知。
- Resend 邮件服务已配置，后台邮件通知页有 `Send test email`。

生产与验证：
- Supabase 已接入真实落库：订单、商品、评价、客服、操作日志、通知、上线检查。
- Vercel 生产环境已配置 Supabase、Resend、`NEXT_PUBLIC_SITE_URL=https://boxsofa.eu`。
- `npm.cmd run production:verify` 已通过，覆盖 `boxsofa.eu` 和 `www.boxsofa.eu` 的页面、SEO、API 权限和 readiness。
- 最近已部署提交：`75bacd2 Fix test email audit logging`。

## 4. 正在开发的功能

- 上线前收尾，不含支付。
- 邮件测试：用户已点击 `Send test email`，接口曾返回 200；已修复测试邮件操作日志里 `entity_id` 类型错误。修复部署后需要再点一次并读取 `admin_audit_log` 确认 `email_test_sent`。
- 最终可见文案/乱码检查：自动扫描和生产验证已通过，但上线前仍需人工快速浏览主要页面。
- 正式商家账号：当前为测试/临时账号模式，上线前需要再修改一次正式账号密码。

## 5. 关键技术

- Next.js 14 App Router
- React / TypeScript
- Supabase PostgreSQL + Auth + Service Role server APIs
- Vercel 部署
- Resend 邮件发送
- GitHub 自动触发 Vercel 部署
- Stripe 预留，暂不启用

关键业务规则：
- 目标市场：欧洲。
- 当前不接真实支付；订单进入“待确认付款”，商家联系客户确认付款方式。
- 跨境物流预估：23-30 天。
- 全部沙发免基础配送费。
- 售价规则：人民币成本 / 7.9 * 3，并通常将个位调整为 9。
- Supabase Auth leaked password protection 暂不启用；免费套餐限制，稳定销售或接 Stripe 前再升级开启。

## 6. 重要文件说明

- `app/page.tsx`：首页。
- `app/category/[slug]/page.tsx`：全部沙发列表页。
- `app/product/[slug]/page.tsx`：产品详情页。
- `components\AdminClient.tsx`：商家后台主界面。
- `components\SiteHeader.tsx`、`components\SiteFooter.tsx`：全站头部/底部。
- `components\ProductMedia.tsx`：产品图/视频展示。
- `components\ProductReviews.tsx`：产品评价。
- `components\SupportButton.tsx`：前台在线客服入口。
- `lib\catalog.ts`：商品、SKU、价格、库存、尺寸、图片、视频核心数据。
- `lib\catalogI18n.ts`、`lib\i18n.ts`：多语言文本。
- `lib\server\admin-auth.ts`：后台权限判断。
- `lib\server\email-provider.ts`：Resend 邮件发送。
- `lib\server\email-notification-queue.ts`：邮件队列写入。
- `app\api\admin\notifications\test\route.ts`：后台测试邮件接口。
- `supabase\schema.sql`：当前数据库结构基准。
- `scripts\production-verify.mjs`：生产总验证。
- `scripts\prelaunch-smoke.mjs`：页面和基础接口 smoke test。
- `scripts\seo-audit.mjs`：SEO 检查。
- `scripts\api-auth-audit.mjs`：API 匿名访问保护检查。
- `docs\PRELAUNCH-CHECKLIST.md`：上线前清单。
- `docs\PRODUCTION-SETUP.md`：Vercel、DNS、生产环境记录。
- `docs\SUPABASE-GO-LIVE-CHECKLIST.md`：Supabase 上线记录。

## 7. 已知问题

- Stripe 未接入，支付必须最后做。
- Supabase Auth leaked password protection 未启用；因免费套餐限制，暂缓。
- 邮件测试日志修复后，仍需要用户再点一次 `Send test email` 并确认 `email_test_sent` 入库。
- 部分 Supabase performance advisor 可能有 INFO 级 unused indexes，等真实流量后再评估。
- 正式商家账号密码上线前要再改一次。
- 商品资料虽已大量整理，但如果用户指出某款图片/详情图/价格/尺寸错误，要以用户最新指正为准。

## 8. 下一步要做什么

优先顺序：
1. 让用户刷新后台 `/admin/notifications` 后再点 `Send test email`，读取 Supabase `public.admin_audit_log` 确认 `email_test_sent`。
2. 做最终人工浏览：首页、全部沙发、5 个产品页、购物车、登录、订单、后台各页，确认无乱码、无明显 UI 错位。
3. 确认客户登录流程和商家登录流程。
4. 确认商家正式账号和密码；上线前替换测试账号。
5. 最后跑 `npm.cmd run production:verify`。
6. 到此为止通知用户：除支付外已到上线前最后确认状态。
7. 支付最后接 Stripe：先测试模式，再人工确认后启用真实支付。

常用验证命令：

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run production:verify
```

Supabase 查询测试邮件日志：

```sql
select action, entity_type, entity_id, after_data, created_at
from public.admin_audit_log
where action in ('email_test_sent', 'email_test_failed')
order by created_at desc
limit 5;
```

## 9. 约束和注意事项

- 不要启用 Stripe，除非用户明确要求并完成最终人工确认。
- 不要把任何 API key、Supabase service role、Resend key、密码写进文档或聊天。
- 不要随意改商品价格/图片/尺寸；商品数据以用户最新指令和厂家资料为准。
- 不要删除用户放在 `D:\沙发网站`、`D:\压缩沙发` 的资料。
- 不要回滚用户或之前已经完成的改动。
- D 盘项目通常需要提升权限执行命令。
- 编辑文件优先用 `apply_patch`。
- 每次代码改动后至少跑 `typecheck` 和 `build`；上线相关改动还要跑 `production:verify`。
- 保持支付关闭：`paymentEnabled` 应为 `false`。
- 后台和客户 API 必须保持登录保护，匿名访问检查不能放松。
