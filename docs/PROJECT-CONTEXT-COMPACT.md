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

- 2026-07-22 全平台视频发布：素材 `D:\压缩沙发\沙发视频\可发布的视频\妈妈的怀抱沙发魔法开箱_mama-sofa-final-20s_2026-07-22_12-42.mp4`，竖版 1080 × 1920、20 秒、带音频，适合 Reels/TikTok/Shorts。已复制到网站公开源 `https://boxsofa.eu/assets/social/boxsofa-mama-hug-magic-unboxing-20s.mp4`，提交 `b514f69`；AiToEarn 媒体 ID `6a60e28821ca9b5c27c78ad4`，实际发布资源 `https://assets.aitoearn.ai/6a5cca25f462298aacf8ec53/user/media/202607/ASwyte67KJ1FlW6rzJyAK.mp4`。
- 本次视频链接：YouTube `https://www.youtube.com/watch?v=BlQcx0-UbwY`（flow `afd497cf-f9db-4fc2-9f5f-6a62852db70a`）；Instagram Reels `https://www.instagram.com/reel/DbGbXEgEYDj/`（flow `79064926-fd14-4103-8986-84fbb201341c`）；TikTok `https://www.tiktok.com/@boxsofaeurope/video/7665376835047410966`（flow `d166bfa2-2ad8-4d86-8d22-cd605d122b86`）；Pinterest video Pin `https://www.pinterest.com/pin/1109363320813627166/`（flow `038514b6-f3ec-42be-9710-63d526538848`）；Facebook Reel `https://www.facebook.com/reel/1301440188731379`（通过已登录 Facebook 公共主页手动发布，Facebook 仍未接入 AiToEarn）。

- 2026-07-22 20:00 Europe/Madrid 视频发布：新增素材 `D:\压缩沙发\沙发视频\可发布的视频\莱米沙发.mp4` 已快速核验为可访问的 1080 × 1920 竖版、19.2 秒、AAC 双声道；画面为带 `boxsofa.eu` 水印的黄色 Leimi 沙发视觉产品演示。原始文件未做画中画、补边或比例改造，公开发布源为 `https://boxsofa.eu/assets/social/boxsofa-leimi-yellow-sofa.mp4`，提交 `ab10b4c`。
- AiToEarn 媒体 ID `6a6105f121ca9b5c27c83546`。TikTok 已发布：`https://www.tiktok.com/@boxsofaeurope/video/7665415233934036246`（task `6a61064321ca9b5c27c83642`，flow `194bad94-37f8-4282-b250-947645cc5979`）；YouTube Shorts 已发布：`https://www.youtube.com/watch?v=BTrnw6DWB7s`（task `6a61066f21ca9b5c27c836c0`，flow `fd1f37d3-9cbc-457a-85b7-011d7fe4553f`）；Instagram Reels 已发布：`https://www.instagram.com/reel/DbGsagij0y9/`（task `6a61067021ca9b5c27c836d1`，flow `f0aa859f-769c-45f7-8ded-08d64f485d43`）。各平台使用相应 `leimi_sofa_20260722` UTM，文案均限定为视觉产品演示并说明西班牙免费基础配送、Stripe 安全支付与预计 23–30 个工作日。
- Pinterest 本次未发布：账户已知但 MCP 仍未暴露必填的 `boardId`；不猜测画板或重复发布。Facebook 本次未发布：AiToEarn 仍无可用主页授权，且已登录 Chrome 扩展连接当前不可用，无法安全完成主页后台手动发布；待浏览器连接恢复后再用同一原片补发，并使用 Facebook UTM。
- 2026-07-22 21:47 Europe/Madrid 补发：已从上一条公开 Pinterest video Pin 的详情恢复正确画板 ID `1109363389402312698`，并将同一条 Leimi 原始视频成功发布为 Pinterest video Pin：`https://www.pinterest.com/pin/1109363320813643396/`（task `6a611e0a21ca9b5c27c8a1e0`，flow `3dfab525-104c-4db1-902b-12a064567400`）。Pinterest 的视频接口硬性要求封面，因此仅从原片截取一帧作为封面，公开源提交 `d77bb55`；未添加跳转链接，以规避此前 `boxsofa.eu` 外链 spam 判定。
- Facebook 补发未完成：再次尝试连接已登录 Chrome 主页后台时，Chrome 扩展仍返回不可用；AiToEarn 也仍没有可用的 Facebook 公共主页授权。无需重建 Pinterest 任务；Facebook 待 Chrome 连接恢复后使用同一原片和 Facebook UTM 补发。
- 2026-07-22 21:55 Europe/Madrid Facebook 补发：已通过已登录的 BoxSofa Europe 主页后台直接上传并发布同一未改动原始竖版 `莱米沙发.mp4`，使用 Facebook `leimi_sofa_20260722` UTM 文案，并开启“添加 AI 标签”；无画中画、补边或方形适配。提交后发布设置面板已关闭，Facebook 尚未在主页时间线返回本条公开 permalink，链接状态待平台生成/可见后补录；不要再次重复上传该素材。

## 11. 自动获客/销售线索承接（2026-07-22）

- 已新增低成本销售线索入口：商品页和购物车页显示 `Check if it fits before you order` 表单，收集姓名、邮箱或电话/WhatsApp、首要问题、偏好联系方式和留言，并要求客户同意 BoxSofa 就该请求联系。
- 前台提交接口为 `/api/leads`，使用现有 `chat_threads` / `chat_messages` 保存为 `[Sales lead]` 会话，不需要新增数据库表迁移；会发送商家提醒邮件到 `LEAD_NOTIFY_EMAIL` / `SUPPORT_EMAIL` / `info@boxsofa.eu`，客户留邮箱时自动发送一封确认收到的服务型跟进邮件。
- 后台新增 `/admin/leads` 销售线索页，展示待跟进、进行中、累计线索，包含客户联系方式、来源、关联产品/购物车、页面链接、留言和邮件自动化记录；普通 `/admin/support` 已过滤销售线索，避免和客服聊天混杂。
- API 权限检查已加入 `/api/admin/leads`（必须拒绝匿名访问）和 `/api/leads`（公开但必须提交完整表单）。

## 12. 社交自动发布（2026-07-23 14:38 Europe/Madrid）

- 素材：`D:\压缩沙发\沙发视频\可发布的视频\爆款视频生成产品演示_美图设计室.mp4`；快速核验为可访问的 720 × 1280、15.069 秒、H.264 + AAC 双声道竖版。审核等级 A，未出现在此前发布/预约记录；原文件未进行画中画、补边或比例改造。公开源提交：`68ee701`；Pinterest 因硬性封面要求仅从原片提取一帧，提交：`daba61d`。
- AiToEarn 媒体 ID：`6a620aa3b35dbe3991379d8d`。TikTok 已发布：`https://www.tiktok.com/@boxsofaeurope/video/7665701709016075542`（task `6a620b06b35dbe3991379f48`，flow `7ff5b0a3-53b8-4007-862b-0050cc7535a0`）；YouTube Shorts 已发布：`https://www.youtube.com/watch?v=iCe8ntnfp0U`（task `6a620b2fb35dbe399137a035`，flow `a3fb26a3-4855-4358-af27-d7c07f9f1dfc`）；Instagram Reels 已发布：`https://www.instagram.com/reel/DbIruoRj2Uy/`（task `6a620b31b35dbe399137a03f`，flow `891e0daa-0b10-4c63-ad59-cd164e3e09eb`）。三者使用各自 `white_modular_unboxing_20260723` UTM，并标注为视觉产品演示及 AI 合成媒体。
- Pinterest video Pin 已创建并触发（task `6a620b35b35dbe399137a05c`，flow `28a39447-4fb9-4190-9d8d-3f08354b9b4a`），状态为 publishing；使用已知画板 `1109363389402312698`，未添加外链以避免既有 spam 拒绝，待平台返回链接后补录。Facebook Reel 已于 2026-07-23 14:45 左右（Europe/Madrid）通过已登录 `BoxSofa Europe` 主页后台发布：`https://www.facebook.com/reel/3622628724535455`；使用同一未改动原始视频、Facebook `white_modular_unboxing_20260723` UTM 文案，并开启“添加 AI 标签”。

## 13. 海报2发布记录（2026-07-23）

- 素材目录：`D:\压缩沙发\沙发视频\新素材\海报2`。本次只使用 6 张正式海报：`图片_2026-07-22_15-24-43-385_english.png`、`图片_2026-07-22_15-24-43-385_2.png`、`_3.png`、`_4.png`、`_5.png`、`_6.png`；未使用含中文原图 `图片_2026-07-22_15-24-43-385.png`，未使用 `_contact_sheet_preview.jpg`。除 Pinterest 平台单图限制所需 6 图拼版外，未制作画中画、模糊背景补边、方形适配、白边/灰边或背景扩展版本。
- 已新增网站公开素材目录 `public/assets/social/posters/2026-07-23-haibao2/`，提交 `01143d0 Add haibao2 social poster assets`。公开源：`https://boxsofa.eu/assets/social/posters/2026-07-23-haibao2/boxsofa-poster2-01.png` 至 `boxsofa-poster2-06.png`；Pinterest 拼版为 `https://boxsofa.eu/assets/social/posters/2026-07-23-haibao2/boxsofa-poster2-six-image-collage.jpg`。
- AiToEarn 媒体 ID：原图 01-06 分别为 `6a620af9b35dbe3991379ee2`、`6a620afdb35dbe3991379f02`、`6a620b00b35dbe3991379f16`、`6a620b01b35dbe3991379f24`、`6a620b03b35dbe3991379f34`、`6a620b06b35dbe3991379f46`；Pinterest 拼版媒体 ID 为 `6a620b08b35dbe3991379f50`。
- TikTok 已按“一条帖子包含 6 张图”发布成功，AiToEarn 仅做 JPEG 格式转换以满足平台上传要求，未做画中画/补边/裁切适配。链接：`https://www.tiktok.com/@boxsofaeurope/photo/7665702797223972118`（task `6a620b43b35dbe399137a0ca`，flow `8207d47d-380a-4b58-9607-81ceaffeb6f2`）。
- Pinterest 因 API 每条 Pin 只支持单图，已用 6 图拼版发布为单条 Pin；拼版内每张图完整比例放入，未做单张画中画背景效果。链接：`https://www.pinterest.com/pin/1109363320813693168/`（task `6a620b46b35dbe399137a0e1`，flow `dd54da36-975f-4e62-b46d-81e433f39f3c`）。未添加 `boxsofa.eu` 外链，以规避此前 Pinterest spam 拒绝，依靠图片水印和主页承接。
- Instagram 未发布：6 张原图比例约 1024 × 1536（宽高比约 0.67），低于 Instagram carousel 常见 4:5 下限；AiToEarn 校验返回 `Publish content validation failed`。因用户明确要求直接使用原图、不得做画中画/补边/方形适配，本次停止重试。后续若要发 Instagram，需要提前生成 4:5 或 1:1 原始设计版，而不是发布前适配版。
- Facebook 首次提交只把 6 张图片写入“照片”，没有生成公开帖子。2026-07-23 重新通过专业面板内容库发布，仍使用同一批 6 张原始 PNG，不做画中画、补边或裁切；为避免 Facebook 额外生成网址预览附件，最终文案不放外链，依靠图片水印和主页官网链接承接。内容库显示“已发布”，公开页验证为 4 张主预览加 `+2`，合计 6 张。公开帖子：`https://www.facebook.com/permalink.php?story_fbid=122109812361392989&id=61591789692090`。

## 14. 商业规则与转化优化（2026-07-23）

- 用户确认的真实商业规则：欧洲全境免费基础配送；预计送达时间保持 23–30 个工作日；退货政策保持现有 14 天窗口，不增加“30 天免费退货”；支付暂时只使用 Stripe，不增加 PayPal 或 Klarna。
- 结账页新增欧洲配送国家选择，并把实际 `countryCode` 写入订单与地址快照；订单接口只接受已配置的欧洲国家，基础配送费仍为 EUR 0.00。
- 客户可见的首页、分类、商品、配送、条款、FAQ、页脚、销售线索邮件和自然流量文档已统一为“欧洲全境免费基础配送”，不再宣称仅西班牙免运费。
- 商品页首屏优先播放现有真实商品视频，并保留视频/图片切换；信任信息统一为 Stripe、送达后 14 天退货窗口、欧洲免费基础配送和 `info@boxsofa.eu`。
- 手机端顶部导航压缩为一行，在线客服改为底部固定栏；购物车不再被客服入口遮住，配送国家与 EUR 0.00 基础配送费在手机端可见。
- Google Merchant feed 仍保留西班牙国家级配送配置。Merchant Center 要求按国家代码分别声明配送，后续应按目标国家逐个扩展，不能用一个“Europe”值代替。

## 15. 网站加载性能优化（2026-07-23）

- 线上冷请求抽样：首页 TTFB 约 3.07 秒、分类页约 1.43 秒、商品页约 1.02 秒；缓存变热后首页约 0.11 秒、商品页约 0.23-0.36 秒，说明服务器缓存正常，主要用户体感瓶颈是首屏大媒体资源。
- 原商品页首屏视频约 9.16 MB，首张商品图约 1.53 MB，部分目录图片达到 7-9 MB。用户明确要求商品页上方只显示产品主图，视频仍放在下方。
- 商品页上方已彻底移除视频/图片切换，只保留响应式产品主图；下方 `Product video` 保留，并使用 `preload="none"`，用户点击播放前不下载视频。
- 新增 `OptimizedImage`，首页产品、分类产品、商品主图、详情长图、购物车、订单和导购页使用 Next 图片优化接口按屏幕尺寸输出；抽样首图由 1.53 MB 降至约 77 KB。
- 原始 `/assets` 响应缓存调整为 1 天，并允许 7 天 stale-while-revalidate；图片优化缓存最短 1 天，输出优先 AVIF/WebP。

## 16. 首页与商品页排版统一（2026-07-23）

- 用户反馈首页和产品页排版、字体仍显杂乱。桌面与 390 x 844 手机截图确认，主要问题是同屏粗体层级过多、首页三段文案各自强调、商品信任信息使用四张边框卡片且配送内容重复。
- 首页标题上限由 56 px 收敛到 50 px，手机为 29 px；主卖点使用中等强调，其余正文恢复常规字重，证明信息和按钮统一到 600-700 范围。
- 五种语言的首页 kicker 与标题均已缩短，英文不再使用过长的 `Built for Spanish apartments and European old buildings`，改为更清晰的欧洲家庭定位。
- 商品标题上限由 40 px 收敛到 36 px，手机为 23 px；面包屑、描述、价格、规格标题建立固定层级。
- 删除商品摘要中与信任信息重复的配送/Stripe段落；四个信任小卡改为单一上下分隔列表，价格和购买按钮保留最强视觉权重。
- 审查与前后对照截图保存于 `docs/audits/2026-07-23-typography/`。

## 17. 分类页与结账页排版统一（2026-07-23）

- 分类页标题上限收敛到 42 px，商品数量改为低权重辅助信息；介绍文字、商品名称、颜色和价格建立固定层级，价格保留卡片内主要强调。
- 导购区标题、Guide 标签和链接标题同步降低多余粗体，保持与首页、商品页一致的 600-700 字重体系。
- 购物车新增明确的 `Your order` 与 `Secure checkout` 层级；商品名称、颜色、单价、数量和移除操作分组清晰，空购物车提供返回商品列表入口。
- 配送表单补齐 `select` 的统一输入样式，标签降为辅助层级；订单汇总的最终总价使用分隔线和更高字重强调。
- 390 px 响应式检查确认分类单列、结账上下排列且无横向溢出；数量输入具备可访问标签。
- 修复购物车缩略图在部分屏幕请求 Next.js 不支持的 320 px 规格而显示破图的问题，响应式图片规格改为有效的 256/384/640/828/1200/1920 px。
- 审查记录与最终截图保存于 `docs/audits/2026-07-23-catalog-checkout-typography/`。

## 18. 移动端商品密度与客户账号页排版（2026-07-23）

- 用户要求手机点击 `All Sofas` 后一屏展示 4 个商品。`max-width: 430px` 下分类页调整为固定 2 列，压缩移动端分类标题区并收紧卡片文字与间距。
- 390 x 844 实测前 4 张商品卡均完整处于首屏内，排列为 2 x 2；第 5、6 张卡片从首屏下方开始，保留继续浏览提示；页面 `scrollWidth` 等于 390，无横向溢出。
- 登录页主标题上限收敛到 42 px，说明文字恢复常规字重；登录/注册分段控件、表单标签、角色提示和辅助说明统一为 600-700 字重体系。
- 客户订单中心标题、同步状态、会员进度、资料表单、订单编号、物流状态和订单卡片同步降低多余粗体。
- 未登录订单页改为英文清晰提示，并隐藏无效的数据库来源、刷新按钮和同步消息，仅保留登录入口。
- 审查记录和截图保存于 `docs/audits/2026-07-23-mobile-catalog-auth-typography/`。

## 19. 前台最终完善与可访问性验收（2026-07-23）

- 首页和分类页商品卡不再重复展示“款式名 + 座位类型 + 颜色”的供应商式长标题，主标题统一为简洁款式名；分类卡将座位类型和清洗后的颜色拆为辅助信息，价格保持主要视觉权重。
- 商品卡颜色已移除重复座位标签、`背景版` 和冗余的“多色展示/多色组合”等内部命名；较长颜色仍使用单行省略，避免移动端卡片被文字撑高。
- 客户可见的规格、FAQ、评论、销售线索、数量控件、Newsletter、页脚和政策页进一步收敛到 600-700 字重，减少同屏粗体竞争。
- 全站链接、按钮、输入框、选择器、文本域和折叠摘要增加统一的可见键盘焦点轮廓；增加 `prefers-reduced-motion` 支持。
- 390 x 844 实测分类页仍保持 2 x 2 首屏四款，页面宽度 390 px；商品、购物车、登录、订单、指南和配送页均未出现横向溢出。
- 商品页确认主图位于首屏，产品视频继续放在下方详情区域；类型检查、7 项自动测试和 46 页生产构建全部通过。
- 最终审查记录、健康结果、可访问性边界与截图保存于 `docs/audits/2026-07-23-final-customer-polish/`。

## 20. 社交自动发布（2026-07-23 20:03 Europe/Madrid）

- 在本次 20:00 巡检时，AiToEarn 已有同一时段的未记录发布：原始竖版 `D:\压缩沙发\沙发视频\可发布的视频\BoxSofa_Final.mp4`（1080 × 1920、49.125 秒、带音频）。因此未重复上传另一条候选 `1.mp4`。该素材已由先前发布流使用，并不是本次巡检重新制作或适配的版本。
- TikTok：任务/记录 `6a625779b35dbe3991393f7d`，flow `e2ba14a2-4fb7-4f56-8fad-7b19bc07b63d`，状态仍为平台处理完成前的 `2`，暂未返回公开链接；后续只查询该任务，禁止重建或重复发布。
- YouTube Shorts：`https://www.youtube.com/watch?v=HfC-NELpsYc`（任务/记录 `6a62577bb35dbe3991393f8a`，flow `9005518e-d425-4359-bbb3-cbadee985738`）。Instagram Reels：`https://www.instagram.com/reel/DbJQ_X-lHGb/`（任务/记录 `6a62577cb35dbe3991393f97`，flow `1d885a69-26df-493a-b8f8-e70f76ef8208`）。Pinterest video Pin：`https://www.pinterest.com/pin/1109363320813714282/`（任务/记录 `6a62577eb35dbe3991393fa3`，flow `b5650063-aa5f-456a-9b40-81829c2412fb`）。Pinterest 未附外链，以避开既有 spam 风险。
- 已发布文案使用各平台 `boxsofa_final_20260723` UTM，限定为视觉产品演示，说明小户型、出租房、窄楼梯/小电梯、欧洲免费基础配送、Stripe 安全支付和预计 23–30 个工作日；未作折扣、快速到货、真实客户案例或政策例外承诺。
- Facebook：AiToEarn 仍无公共主页授权；本次发布流中没有 Facebook 记录。需在已登录的 `BoxSofa Europe` Facebook 主页后台手动上传同一原片后，再补录公开链接；在此之前不得以 `BoxSofa_Final.mp4` 再次发布到其余四个平台。
