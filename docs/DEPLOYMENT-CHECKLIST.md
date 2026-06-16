# BoxSofa 上线和升级清单

## 现在可以做

1. 保留当前 `boxsofa.eu` 静态站作为线上展示版本。
2. 创建 Supabase 项目。
3. 在 Supabase SQL Editor 运行 `supabase/schema.sql`。
4. 创建 Storage bucket：
   - `product-images`
   - `product-videos`
   - `detail-images`
5. 创建 Vercel 或 Cloudflare Pages 项目，连接 `boxsofa-platform`。
6. 填写环境变量：
   - `NEXT_PUBLIC_SITE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
7. 域名继续使用 `boxsofa.eu`。

## 需要你亲自操作的地方

- 第三方账号登录。
- 创建 Supabase/Vercel/Cloudflare 项目时的确认按钮。
- 填写或复制密钥时，密钥不要直接发给我。
- 所有付款、升级套餐、绑定银行卡和 Stripe 激活。

## Stripe 以后再做

你开通欧洲银行账户后，再处理：

1. 注册或激活 Stripe。
2. 填写公司信息和银行账户。
3. 创建 Stripe API keys。
4. 设置 webhook。
5. 把提交订单改为在线支付。

## 本地运行

这台电脑当前没有识别到 Node.js 和 npm。以后本地运行需要先安装 Node.js LTS，然后在 `boxsofa-platform` 目录执行：

```powershell
npm install
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```
