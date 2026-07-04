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
