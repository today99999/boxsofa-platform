# BoxSofa 网站项目交接文档

更新时间：2026-07-04

## 项目定位

BoxSofa 是面向欧洲市场的压缩沙发独立站。当前方向不是 WordPress，而是自定义网站和自定义后台。

## 技术架构

- 前台/后台：Next.js
- 代码仓库：GitHub
- 部署平台：Vercel
- 数据库计划：Supabase PostgreSQL
- 图片视频计划：Supabase Storage，后续可评估 Cloudflare R2
- 支付计划：Stripe，等待欧洲银行账户开通后接入
- 域名：boxsofa.eu

## 当前线上地址

- Vercel 预览/生产地址：https://boxsofa-platform.vercel.app
- GitHub 仓库：https://github.com/today99999/boxsofa-platform

## 当前功能状态

已完成：

- 首页
- 分类页：全部沙发、单人沙发、双人沙发、三人沙发、沙发组合
- 产品详情页
- 加入购物车
- 提交订单，本地原型数据
- 我的订单，本地原型数据
- 商家后台运营看板
- 商品库存展示
- 订单与物流模块
- 客户会员模块
- 客服聊天占位
- Stripe 支付预留说明

当前限制：

- 订单只保存在当前浏览器 localStorage，不是数据库
- 客服聊天还不是真实时聊天
- 后台没有真实登录权限
- 商品数据仍是临时 SKU
- 真实支付尚未启用

## 重要约定

- 会员规则：客户累计已确认付款满 EUR 300，成为会员，之后购物享 9 折
- 定价规则：人民币成本价除以 7.9，再乘以 3，得到欧元售价；最终 EUR 价格取整数后，个位数统一改为 9
- 物流说明：跨境物流预估 23-30 天到达
- 当前付款流程：先提交订单，商家联系客户确认付款方式
- Stripe：等欧洲银行账户准备好以后再接

## 厂家资料到位后的工作流

1. 整理厂家产品目录
   - 款式
   - SKU
   - 颜色
   - 售价
   - 尺寸
   - 包装尺寸
   - 重量
   - 库存
   - 材质
   - 包装方式
   - 回弹时间

2. 整理图片视频
   - 每个 SKU：3-5 张主图
   - 每个款式：1 张详情长图
   - 每个款式：1 个视频

3. 先调整页面 UI
   - 首页
   - 分类页
   - 产品详情页
   - 购物车
   - 我的订单
   - 商家后台
   - 移动端适配

4. 确认产品字段后再接 Supabase
   - 商品表
   - 款式表
   - SKU 表
   - 图片视频表
   - 订单表
   - 客户表
   - 会员规则
   - 客服聊天表

5. 最后批量导入真实产品

## 本地运行

项目目录：

```text
boxsofa-platform
```

运行命令：

```powershell
npm install
npm run dev
```

本地访问：

```text
http://localhost:3000
```

## 发布流程

1. 修改代码
2. 本地运行 `npm run build`
3. Git 提交
4. 推送 GitHub
5. Vercel 自动部署

常用命令：

```powershell
git status
git add .
git commit -m "说明本次修改"
git push
```

## 当前建议

厂家资料到位后，先不要直接上传所有产品。建议先用厂家资料重新设计并确认产品字段和页面 UI，再接 Supabase，最后批量上传真实商品。

## 2026-07-04 继续记录

- 已读取 `D:\沙发网站\boxsofa-platform` 和 `D:\沙发网站\厂家资料-待整理`。
- `D:\沙发网站\厂家资料-待整理` 当前未发现可读取文件。
- 已新增 `docs/PRODUCT-DATA-TEMPLATE.md`，用于整理款式、SKU、图片、详情长图和视频。
- 已扩展前台临时商品字段：SKU、成品尺寸、包装尺寸、重量、材质、包装方式、回弹时间、详情长图、视频。
- 产品详情页已展示完整产品参数、详情长图和视频。
- 分类页、首页商品卡片和后台库存模块已展示关键尺寸 / 包装 / SKU 信息。
- Supabase `products` 预留表已补充真实商品需要的规格字段。

下一步：把厂家真实文件放入 `D:\沙发网站\厂家资料-待整理` 后，先按 `PRODUCT-DATA-TEMPLATE.md` 整理出款式表、SKU 表和图片表，再替换当前临时商品数据。

## 2026-07-04 厂家资料整理进展

- 已读取 `D:\沙发网站\厂家资料-待整理\主图` 和 `D:\沙发网站\厂家资料-待整理\详情图`。
- 当前识别到 23 个款式文件夹，主图与详情图均已到位。
- 已生成厂家资产统计：`docs/SUPPLIER-ASSET-INVENTORY.csv`。
- 已生成原始 SKU 草稿：`docs/SUPPLIER-PRODUCT-DRAFT.csv`，按直属主图拆分，共 188 条。
- 已生成合并状态图后的 SKU 草稿：`docs/SUPPLIER-PRODUCT-DRAFT-REFINED.csv`，共 133 条。
- 已复制网站可用图片到 `public/assets/catalog/`，并生成路径映射：`docs/SUPPLIER-PRODUCT-ASSET-MAP.csv`。
- 已从详情图人工读取尺寸、包装尺寸、重量，生成：`docs/SUPPLIER-SPEC-EXTRACTION.csv`。
- 已将规格自动匹配到 SKU 草稿，生成：`docs/SUPPLIER-PRODUCT-DRAFT-WITH-SPECS.csv`。
- 当前匹配结果：91 条已高可信匹配规格，20 条中等可信需复核，22 条仍需人工确认规格类型。

下一步：先复核 `SUPPLIER-PRODUCT-DRAFT-WITH-SPECS.csv` 中 `import_status` 不是 `matched_spec` 的条目，再补价格、库存和材质，最后替换网站临时商品数据。
