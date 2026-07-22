# BoxSofa Project Context Compact

更新时间：2026-07-21

## 0. 2026-07-21 最新状态（优先于下方旧记录）

- Stripe 正式支付已经启用并完成真实下单链路验证；支付取消订单也已在商家后台处理。
- 2026-07-21 已按“正式支付应启用”状态运行 `npm.cmd run production:verify`，`https://boxsofa.eu` 与 `https://www.boxsofa.eu` 的 smoke、SEO、API 权限和 readiness 全部通过。
- 用户已在 `/admin/notifications` 重新点击 `Send test email`；Supabase `public.admin_audit_log` 已确认写入新的 `email_test_sent`，时间为 2026-07-21 17:20:07 UTC，provider 为 `resend`，`entity_id` 为 `null`。后台测试邮件发送给当前商家登录账号 `owner@boxsofa.eu`；公开客服/商务收件箱仍是 `info@boxsofa.eu`，两者用途不同。
- 2026-07-21 完成首轮低成本获客/转化优化：公开商品标题、metadata、结构化数据、图片 alt 和 Google Merchant feed 改为英文购买语境；feed 144 个 SKU 已确认无中文残留；首页第一屏改为西班牙小户型/老楼场景；产品页新增 Stripe、14 天退货、西班牙免费基础配送和客服邮箱信任条；新增 5 个 `/guides/...` SEO 落地页并加入 sitemap 与页脚内部链接。
- 2026-07-21 继续增强免费 SEO 入口：新增 `/guides` 购买指南总页，并在首页热门商品下方加入 3 个指南入口；页脚指南链接改到 `/guides`；`/guides` 已加入 sitemap。最新部署提交 `c9eac99 Add buying guide hub and homepage links` 已上线，`EXPECT_PAYMENT_ENABLED=true npm.cmd run production:verify` 通过。
- 2026-07-21 继续补西班牙本地免费搜索入口：新增 `/es/guias` 西语购买指南总页和 5 个西语详情页，覆盖 `sofá comprimido para piso pequeño`、`sofá para escaleras estrechas`、`sofá en caja`、压缩沙发 24-72 小时恢复、出租房/客房沙发床等关键词；英文 `/guides` 和首页已加入西语入口；sitemap 已确认包含 6 个西语 URL。最新部署提交 `b382464 Add Spanish buying guide pages` 已上线，`EXPECT_PAYMENT_ENABLED=true npm.cmd run production:verify` 通过。
- 2026-07-21 完成促成交 FAQ 增强：产品页新增 `Before you order` 折叠 FAQ，覆盖压缩恢复、免费配送、窄楼梯/小电梯、Stripe 支付和 14 天退货；产品页、英文指南详情页和西语指南详情页均加入 FAQPage JSON-LD。`scripts/seo-audit.mjs` 已扩展覆盖 `/guides`、一篇英文指南、`/es/guias` 和一篇西语指南，并检查产品/指南 FAQ JSON-LD。最新部署提交 `e7c7906 Add conversion FAQs and guide structured data` 已上线，`EXPECT_PAYMENT_ENABLED=true npm.cmd run production:verify` 通过。
- 2026-07-21 继续按低成本获客顺序推进：Google Merchant feed 从 12 列扩展到 20 列，新增 `additional_image_link`、`brand=BoxSofa`、`material`、`size`、西班牙免费配送 `shipping=ES:::0 EUR`、`shipping_label` 和自定义标签；线上 feed 确认 144 个 SKU、无中文残留。西语 SEO 又新增 4 个城市长尾页：Madrid、Barcelona、Valencia、Málaga。新增 `docs/ORGANIC-TRAFFIC-PLAYBOOK.md`，包含 TikTok/Instagram/YouTube/Facebook/Pinterest/社群 UTM 链接、周发布节奏和英西双语文案模板。最新部署提交 `fb9cc0a Expand free traffic feed and local SEO assets` 已上线，`EXPECT_PAYMENT_ENABLED=true npm.cmd run production:verify` 通过。
- 2026-07-21 继续增强站内 SEO 链接网络和执行节奏：英文/西语指南详情页新增对应语言互链和 3 个相关指南推荐，metadata 增加语言 alternate；新增 `docs/ORGANIC-CONTENT-CALENDAR-30D.md`，包含 30 天平台、素材类型、hook 和 UTM 链接。最新部署提交 `6e41b24 Add guide crosslinks and content calendar` 已上线，`EXPECT_PAYMENT_ENABLED=true npm.cmd run production:verify` 通过。
- 2026-07-21 继续增强搜索结果和站内路径：产品页、英文指南详情页、西语指南详情页新增 BreadcrumbList JSON-LD；`/category/all` 新增购买前说明和英西指南入口，帮助从商品列表继续进入测量/配送/小户型指南。`scripts/seo-audit.mjs` 已检查 BreadcrumbList。最新部署提交 `4bfcf6e Add breadcrumbs and category guide links` 已上线，`EXPECT_PAYMENT_ENABLED=true npm.cmd run production:verify` 通过。
- 2026-07-21 新增 `docs/ORGANIC-UTM-LINKS.csv`，汇总 TikTok、Instagram、YouTube、Facebook、Pinterest、西语社群和城市页的可复制 UTM 链接，便于后续人工发布并在 `/admin/traffic` 归因。提交 `4df7500 Add organic UTM link sheet` 已推送。
- 客户注册后无法登录的问题已修复：未确认邮箱时显示明确提示，并提供重新发送确认邮件入口。
- Google Merchant Center 已完成 6/6 设置，商家 ID `5826490678`。
- `boxsofa.eu` 已通过 HTML 元标记验证，西班牙为首个目标市场，商品语言为英语。
- 网站已提供 `https://boxsofa.eu/google-merchant-feed.tsv`，Google 已导入 144 个 SKU；当前全部处于 Google 审核中，后台显示没有需要修正的设置或政策问题。
- 西班牙基础配送免费，Merchant Center 配送承诺为 23-30 个工作日，时区为马德里。
- 退货政策：收货后 14 个自然日；非质量问题由客户承担退运费，预计最高为商品购买价格的 50%；无重新上架费；质量问题、运输损坏或错发由 BoxSofa 承担合理退运费用；退款处理期 14 天。
- Google Search Console 已添加并自动验证 `https://boxsofa.eu/` 网址前缀资源。2026-07-18 复查确认：首页显示“网址已收录到 Google / 网页已编入索引 / HTTPS 正常”；公开搜索结果暂未稳定展示品牌站点。`sitemap.xml` 曾显示“无法抓取”，网站端持续为 HTTP 200 和有效 XML，已重新提交并收到“已成功提交站点地图”；首页也已重新请求编入索引并进入优先抓取队列。
- 第一阶段免费推广（Google 免费商品展示 + Search Console）配置已完成，短视频渠道建设已经开始。
- Facebook 公共主页 `BoxSofa Europe` 已创建并公开：英文简介、官网行动按钮和公开联系邮箱 `info@boxsofa.eu` 已配置，首条品牌介绍帖已发布并置顶，主页状态正常且没有违规或账户限制。
- Instagram `@boxsofaeurope` 已转换为公开的商企专业账号，类别为 `Furniture store`，品牌简介、头像、可点击的 `https://boxsofa.eu/` 官网链接和公司联系邮箱 `info@boxsofa.eu` 均已配置；“显示联系方式”已开启。该账号已与 Facebook 公共主页 `BoxSofa Europe` 及 `BoxSofa` 业务资产组合关联，统一 Instagram 消息收件箱已启用。
- TikTok `@boxsofaeurope` 已创建并公开，显示名称为 `BoxSofa Europe`，英文品牌简介已包含官网域名和联系邮箱 `info@boxsofa.eu`。网页版未提供切换商业账号入口，后续需要在 TikTok 手机 App 内完成商业账号转换；企业验证需要企业资料，暂未提交。
- YouTube 频道 `BoxSofa Europe` 已创建，标识名为 `@boxsofaeurope`；英文频道简介、可点击的 `https://boxsofa.eu/` 官网链接和公开商务邮箱 `info@boxsofa.eu` 已发布。频道地址：`https://www.youtube.com/@boxsofaeurope`。
- YouTube 仍需补充品牌头像和频道横幅；首批短视频发布后再配置首页内容分区和播放列表。
- 首批可发布视频已整理到 `D:\压缩沙发\沙发视频\可发布的视频` 并完成审核：5 条可直接发布、4 条建议转为 9:16 并加字幕、1 条因仿 TikTok 界面和乱码不建议原样发布。逐条结果见该目录下的 `发布审核报告.md`。
- `info@boxsofa.eu` 邮箱已由用户完成设置，可用于接收平台验证码、客户咨询和商务邮件；Facebook、Instagram、TikTok、YouTube 等品牌平台统一优先使用该邮箱。
- `info@boxsofa.eu` 已建立独立的 Namecheap IMAP/SMTP 连接：专用应用密码使用 Windows DPAPI 加密保存在当前 Windows 用户目录，不进入 Git、代码或文档；本地连接工具为 `scripts/boxsofa-mail.ps1` 和 `scripts/boxsofa_mail.py`，IMAP/SMTP 真实登录测试均已通过。
- Codex 自动任务 `BoxSofa 客服邮箱巡检` 已启用，工作日 09:00 和 16:00 检查未读邮件并分类、起草回复，不自动发送；退款、争议、付款异常、个人数据和法律邮件必须人工确认。详细规则见 `docs/EMAIL-OPERATIONS.md`。
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

- 社交发布：黑色沙发开箱视频已完成四平台预约。Facebook Reels 2026-07-23 20:00、Instagram Reels 2026-07-23 21:00、TikTok 2026-07-24 16:00、YouTube Shorts 2026-07-24 18:00，均为西班牙时间。YouTube 链接为 `https://youtube.com/shorts/VO5CRlkOVdg`。下一条待发布素材为白色模块沙发视频 `爆款视频生成产品演示_美图设计室.mp4`。
- 自动发布：`yikart/AiToEarn` 已克隆到 `D:\沙发网站\AiToEarn`；国际版 MCP `https://aitoearn.ai/api/unified/mcp` 已加入 Codex，API Key 仅保存在本机 `.codex/.env`。Instagram、TikTok、YouTube 已授权并在线；Facebook 公共主页授权失败已确认是 AiToEarn 当前无法正确读取公共主页的已知问题（GitHub issue #506），Facebook 暂由 Meta Business Suite 手动发布。
- AiToEarn 首次实发验证：2026-07-19 将横版 `泡泡沙发.mp4` 连同英文推广文案发布到 TikTok 和 YouTube，两个平台均返回已发布。TikTok：`https://www.tiktok.com/@boxsofaeurope/video/7664264767032331553`；YouTube：`https://www.youtube.com/watch?v=wFn1tndPuAM`。Instagram Reels 因原片为 16:9、不满足 4:5 至 9:16 要求而未发布，需先制作竖版。

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

## 10. 社交自动发布记录（2026-07-22）

- 素材：`D:\压缩沙发\沙发视频\可发布的视频\3.mp4`，审核等级 A，720 × 1280 单人椅拆箱与体验；未出现在此前已发布/预约记录。没有使用黑色开箱、`泡泡沙发.mp4` 或审核报告中不建议原样发布的素材。
- 为 AiToEarn 拉取上传，已将素材提交到网站公开源 `https://boxsofa.eu/assets/social/boxsofa-single-chair-unboxing.mp4`（提交 `22699a9`），并在 AiToEarn 创建媒体 `6a609fce21ca9b5c27c62252`。
- TikTok 已创建待执行任务 `6a609fdc21ca9b5c27c6229d`（flow `dfda5084-c3c7-4f38-9037-c2f812e81bcf`）；YouTube 已创建待执行任务 `6a609ff921ca9b5c27c6231b`（flow `74a556c2-97e5-4b28-824a-5171010eaf01`）；Instagram Reels 已创建待执行任务 `6a60a00321ca9b5c27c62342`（flow `b3f1cdca-5c14-4db4-81ff-9f94de76f382`）。提交时刻均为 2026-07-22 12:48 左右（西班牙）；AiToEarn 尚未返回已发布链接，`publishChannelTaskNow` 对待执行状态返回“cannot be published now”，因此下次巡检应先查询任务状态/链接，勿重建任务。
- Instagram 素材为 9:16，符合 Reels 比例；并声明为 visual product demonstration / synthetic media，不表述为客户真实交付或评价。
- Pinterest 自动同步未完成：平台能力可用，但 MCP 未提供已关联 Pinterest 的 `accountId` 和必填 `boardId`；已登录浏览器会话也处于登录页，无法安全读取这两个参数。Facebook 按既定 AiToEarn 公共主页授权问题保留人工发布，未自动尝试。
- Pinterest 人工发布（建议次日 20:00 Europe/Madrid）：标题 `Compact Living Room Sofa in a Box for Small Apartments`；English: `Compact living room inspiration: a compressed sofa chair / sofa in a box concept for small apartments, narrow stairs and small lifts. Free basic delivery in Spain, secure Stripe payment, estimated delivery 23–30 working days. Explore compressed sofa Spain ideas.` Español: `Ideas para salón compacto: sofá comprimido o sofá en caja para pisos pequeños, escaleras estrechas y ascensores pequeños. Entrega básica gratuita en España, pago seguro con Stripe y entrega estimada de 23–30 días laborables.` UTM: `https://boxsofa.eu/guides?utm_source=pinterest&utm_medium=social&utm_campaign=organic_guides`。建议关键词：`compact living room`、`small apartment sofa`、`sofa in a box Europe`、`compressed sofa Spain`。

- 2026-07-22 海报图发布：原始带水印图片位于 `D:\压缩沙发\沙发视频\新素材\2026-7-22海报图\已加水印_boxsofa.eu`；已新增网站公开素材目录 `public/assets/social/posters/2026-07-22/`，提交 `3eeaee4`、`031c7bc`、`6f1fb3a`。
- Instagram 已按“一条帖子包含 6 张图”发布成功，类型为 6 图轮播，链接：`https://www.instagram.com/p/DbGJz21iR-Q/`。
- Pinterest 平台当前 API 每条 Pin 只支持 1 张图；为符合“发一次贴包含全部 6 张图”的要求，已制作 6 图拼版并发布为单条 Pin，链接：`https://www.pinterest.com/pin/1109363320813617711/`。注意：Pinterest 曾拒绝带 `boxsofa.eu` 跳转链接的 Pin，报错为疑似 spam；最终成功版本未挂跳转链接，依靠图片水印和账号主页承接。
- TikTok 已按“一条帖子包含 6 张图”发布成功，类型为 6 图轮播，链接：`https://www.tiktok.com/@boxsofaeurope/photo/7665339781131390230`。
- Facebook 已通过已登录的主页后台按“一条帖子包含 6 张图”发布成功，类型为公开图文帖，链接：`https://www.facebook.com/permalink.php?story_fbid=pfbid08s6wxPCatu75SpBh8DpCXCNod5dGqw1C2JDjGhE55suv2Rw2mgk1YrhtCSw2uqrpl&id=61591789692090`。Facebook 当前未接入 AiToEarn 账号，仍需用 Meta/Facebook 后台手动发布或后续重新授权。
- 后续海报发布规则：用户已明确不接受“画中画模式”或模糊背景补边效果；除 Pinterest 因单图限制需要做整组拼版外，各平台应直接上传原始海报图，不要先制作方形适配、背景扩展、白边/灰边或画中画版本。`海报2` 发布时使用 6 张正式图，其中含中文的 `图片_2026-07-22_15-24-43-385.png` 必须替换为英文版 `图片_2026-07-22_15-24-43-385_english.png`，不要发布 `_contact_sheet_preview.jpg`。

## 11. 自动获客/销售线索承接（2026-07-22）

- 已新增低成本销售线索入口：商品页和购物车页显示 `Check if it fits before you order` 表单，收集姓名、邮箱或电话/WhatsApp、首要问题、偏好联系方式和留言，并要求客户同意 BoxSofa 就该请求联系。
- 前台提交接口为 `/api/leads`，使用现有 `chat_threads` / `chat_messages` 保存为 `[Sales lead]` 会话，不需要新增数据库表迁移；会发送商家提醒邮件到 `LEAD_NOTIFY_EMAIL` / `SUPPORT_EMAIL` / `info@boxsofa.eu`，客户留邮箱时自动发送一封确认收到的服务型跟进邮件。
- 后台新增 `/admin/leads` 销售线索页，展示待跟进、进行中、累计线索，包含客户联系方式、来源、关联产品/购物车、页面链接、留言和邮件自动化记录；普通 `/admin/support` 已过滤销售线索，避免和客服聊天混杂。
- API 权限检查已加入 `/api/admin/leads`（必须拒绝匿名访问）和 `/api/leads`（公开但必须提交完整表单）。
