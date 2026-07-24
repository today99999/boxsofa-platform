# 已付款订单感谢信巡检实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 撤回网站自动发信系统，只保留订单语言字段，并由现有本地客服自动化在工作日 09:00、16:00 巡检已付款新订单后直接发送感谢信。

**Architecture:** 网站只保存 `orders.locale`；本地 Python 脚本通过 Supabase REST 读取已付款订单、生成五语文案、调用现有 SMTP 能力并在 Codex 自动化目录记录成功订单号。第一次只执行 dry-run，经人工确认后再更新现有 `boxsofa` 自动化允许发送。

**Tech Stack:** Git revert、Next.js/TypeScript、Supabase/PostgreSQL、Python 标准库、PowerShell、现有 Namecheap Private Email SMTP、本地 Codex cron automation。

## Global Constraints

- 支持语言严格为 `zh`、`en`、`es`、`fr`、`de`。
- 登录客户和访客订单都保存下单时的 `orders.locale`。
- 只处理确认付款成功、客户姓名和邮箱有效、且没有成功发送记录的订单。
- 等待付款、失败、争议、退款和信息不完整的订单不得自动发送。
- 订单号是防重复键；只有 SMTP 确认成功后才写入成功记录。
- 发送失败不写成功记录，下一轮可重试。
- 会员感谢只在该订单使累计确认付款首次达到 EUR 300 时加入。
- 凭据、完整邮件正文和付款资料不得写入日志、报告或成功记录。
- 首次启用必须先 dry-run，并经用户确认后才能更新自动化为直接发送。
- 保留用户未跟踪文件、现有客服邮箱脚本和无关网站功能。

---

### Task 1: 安全撤回网站自动发信实现

**Files:**
- Revert commit: `b6d51e2`
- Revert merge: `1c944c6` with mainline parent 1
- Preserve: `docs/superpowers/specs/2026-07-24-paid-order-thank-you-巡检-design.md`
- Preserve: `docs/superpowers/plans/2026-07-24-paid-order-thank-you-巡检.md`

**Interfaces:**
- Produces: 网站恢复到自动邮件功能合并前的行为。
- Preserves: 本地邮箱脚本、简化规格和计划、用户未跟踪文件。

- [ ] **Step 1: 记录撤回前状态**

Run:

```powershell
git status --short
git log -8 --oneline
git show --stat --oneline 1c944c6
git show --stat --oneline b6d51e2
```

Expected: 确认 `1c944c6` 是功能 merge，`b6d51e2` 只修改 release 环境检查；不暂存任何未跟踪文件。

- [ ] **Step 2: 撤回合并后修复**

Run:

```powershell
git revert --no-edit b6d51e2
```

Expected: 新建一个只撤回 `scripts/check-env.mjs` 环境隔离修改的 revert commit。

- [ ] **Step 3: 撤回功能 merge**

Run:

```powershell
git revert -m 1 --no-edit 1c944c6
```

Expected: 删除网站邮件队列、自动投递器、Vercel cron、复杂 migration 026 和仅为它增加的发布逻辑；不删除之后提交的简化规格和计划。

- [ ] **Step 4: 验证撤回范围**

Run:

```powershell
git status --short
rg -n -S "email-notifications|automatic_delivery_eligible|membership_welcomed_at" app lib supabase vercel.json
Test-Path -LiteralPath 'scripts\boxsofa-mail.ps1'
Test-Path -LiteralPath 'scripts\boxsofa_mail.py'
```

Expected: 网站 cron/自动投递实现已消失；两个本地邮箱脚本仍存在且未被提交或删除。

- [ ] **Step 5: 运行基线测试**

Run: `npm test`

Expected: 撤回后的原有测试全部通过。

---

### Task 2: 仅保留订单语言快照

**Files:**
- Create: `supabase/migrations/202607240026_order_locale_snapshot.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/migrations/MANIFEST.json`
- Modify: `app/api/orders/route.ts`
- Modify: `components/CartClient.tsx`
- Create: `lib/server/order-locale-snapshot.test.ts`

**Interfaces:**
- Produces: `orders.locale text not null`，约束为五种语言。
- Consumes: `language` from `components/CartClient.tsx`.

- [ ] **Step 1: 编写失败测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../app/api/orders/route.ts", import.meta.url), "utf8");
const cart = readFileSync(new URL("../../components/CartClient.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/202607240026_order_locale_snapshot.sql", import.meta.url),
  "utf8"
);

test("checkout persists one supported order locale", () => {
  assert.match(route, /locale: z\.enum\(\["zh", "en", "es", "fr", "de"\]\)/);
  assert.match(route, /locale: order\.locale/);
  assert.match(cart, /locale: language/);
  assert.match(migration, /check \(locale in \('zh', 'en', 'es', 'fr', 'de'\)\)/i);
  assert.doesNotMatch(migration, /email_notifications|cron|resend/i);
});
```

- [ ] **Step 2: 验证测试失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/order-locale-snapshot.test.ts
```

Expected: FAIL，因为撤回后不存在 locale migration/API 字段。

- [ ] **Step 3: 实现最小 migration**

```sql
alter table public.orders add column if not exists locale text;

update public.orders order_row
set locale = coalesce(
  (
    select case
      when profile.preferred_locale in ('zh', 'en', 'es', 'fr', 'de')
        then profile.preferred_locale
      else 'en'
    end
    from public.profiles profile
    where profile.id = order_row.customer_id
  ),
  'en'
)
where order_row.locale is null;

alter table public.orders alter column locale set not null;
alter table public.orders drop constraint if exists orders_locale_check;
alter table public.orders
  add constraint orders_locale_check check (locale in ('zh', 'en', 'es', 'fr', 'de'));
```

Do not add an insert default. New application code must always send an explicit locale.

- [ ] **Step 4: 更新下单 API 和购物车**

Add `locale: z.enum(["zh", "en", "es", "fr", "de"])` to the request schema, insert `locale: order.locale`, update signed-in `profiles.preferred_locale`, and send `locale: language` from `CartClient`.

- [ ] **Step 5: 对齐 schema 和 manifest**

Mirror the final column/constraint in `supabase/schema.sql`. Calculate SHA-256:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath 'supabase\migrations\202607240026_order_locale_snapshot.sql').Hash.ToLower()
```

Add the exact filename/hash to `supabase/migrations/MANIFEST.json`.

- [ ] **Step 6: 验证并提交**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/order-locale-snapshot.test.ts
npm run db:migrations:verify
npm run db:bootstrap:validate
npm test
```

Expected: all commands exit 0.

Commit:

```powershell
git add supabase/migrations/202607240026_order_locale_snapshot.sql supabase/schema.sql supabase/migrations/MANIFEST.json app/api/orders/route.ts components/CartClient.tsx lib/server/order-locale-snapshot.test.ts
git commit -m "feat: retain minimal order locale snapshot"
```

---

### Task 3: 本地已付款订单巡检与五语文案

**Files:**
- Create: `scripts/boxsofa_paid_orders.py`
- Create: `scripts/boxsofa-paid-orders.ps1`
- Create: `scripts/test_boxsofa_paid_orders.py`

**Interfaces:**
- Produces CLI:
  - `scripts\boxsofa-paid-orders.ps1 dry-run --limit 20`
  - `scripts\boxsofa-paid-orders.ps1 send --limit 20 --confirm-send YES`
- Ledger: `$CODEX_HOME/automations/boxsofa/paid-order-thank-you.json`
- Consumes: `.env.local` Supabase URL/service-role variables and encrypted mailbox credential already used by `boxsofa-mail.ps1`.

- [ ] **Step 1: 编写订单分类和防重失败测试**

Use `unittest` fixtures covering paid, pending, refunded, malformed, already-sent, retry-after-failure, and EUR 300 first-threshold cases. Assert:

```python
self.assertEqual([item.order_number for item in eligible], ["BX-PAID-1"])
self.assertEqual(manual_review, ["BX-UNCERTAIN-1"])
self.assertFalse(ledger.was_sent("BX-FAILED-RETRY"))
self.assertTrue(member_welcome_for("BX-CROSS-300"))
self.assertFalse(member_welcome_for("BX-AFTER-MEMBER"))
```

- [ ] **Step 2: 编写五语精确文案测试**

For `zh`, `en`, `es`, `fr`, `de`, assert customer name, order number, `boxsofa.eu`, prompt-shipping meaning, and optional membership paragraph. Assert unsupported locale falls back to English.

- [ ] **Step 3: 验证测试失败**

Run: `python -m unittest scripts.test_boxsofa_paid_orders -v`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: 实现安全配置和后台查询**

Use only Python standard library. Read `.env.local` without printing values. Query Supabase REST with:

```http
GET /rest/v1/orders?select=id,order_number,customer_id,customer_email,customer_name,payment_status,status,total_eur,paid_at,created_at,locale&order=paid_at.asc&limit=200
```

Send `apikey` and bearer service-role headers. Reject missing/invalid configuration with a generic error naming only the missing variable.

- [ ] **Step 5: 实现分类、会员判断和 ledger**

Treat only `payment_status == "paid"` as eligible. Exclude refunded/cancelled/disputed states. For linked customers, calculate confirmed cumulative totals in paid-at order; include membership text only on the first order where total crosses from below 300 to at least 300.

Write ledger atomically via temporary file plus replace. Store only:

```json
{
  "BX-123": {
    "sent_at": "2026-07-24T16:00:00Z",
    "locale": "es",
    "member_welcome": true
  }
}
```

- [ ] **Step 6: 实现 dry-run 和发送**

`dry-run` outputs only order number, locale, membership flag, and aggregate counts. It never invokes SMTP.

`send` requires the exact `--confirm-send YES`. It uses the existing encrypted mailbox credential and SMTP implementation. Record ledger success only after SMTP returns successfully. Redact recipient and body from console errors.

- [ ] **Step 7: 运行测试并提交**

Run:

```powershell
python -m unittest scripts.test_boxsofa_paid_orders -v
.\scripts\boxsofa-paid-orders.ps1 --help
```

Expected: all unit tests pass; help lists dry-run/send and the confirmation requirement.

Commit only the three new script/test files.

---

### Task 4: 执行首次安全 dry-run

**Files:**
- Runtime record only: `$CODEX_HOME/automations/boxsofa/memory.md`
- Do not modify automation yet.

**Interfaces:**
- Consumes: Task 3 dry-run CLI.
- Produces: sanitized candidate report for user approval.

- [ ] **Step 1: 运行 dry-run**

Run:

```powershell
.\scripts\boxsofa-paid-orders.ps1 dry-run --limit 20
```

Expected: no SMTP call; output contains only aggregate counts, order numbers, locale, and membership flag.

- [ ] **Step 2: 审核安全结果**

Confirm no pending/refunded/disputed order appears, no already-sent order appears, and no credentials/full email addresses/bodies appear.

- [ ] **Step 3: 向用户报告并暂停**

Report the sanitized candidate list. Do not enable sends until the user explicitly approves this dry-run result.

---

### Task 5: 用户批准后更新现有自动化

**External state:**
- Update automation ID: `boxsofa`
- Preserve schedule: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9,16;BYMINUTE=0`
- Preserve local project, model, reasoning effort, status, and notification policy.

- [ ] **Step 1: 更新自动化 prompt**

The prompt must instruct each run to:

1. Change to `D:\沙发网站\boxsofa-platform`.
2. Run `scripts\boxsofa-paid-orders.ps1 send --limit 20 --confirm-send YES`.
3. Report sent and manual-review order numbers without PII/credentials.
4. Run the existing unread mailbox list command.
5. Classify and draft support replies without sending those replies.
6. Keep refunds, disputes, payment anomalies, personal-data and legal messages for manual review.

- [ ] **Step 2: 用 automation tool 更新 ID `boxsofa`**

Preserve all existing fields except the prompt. Do not create a duplicate automation.

- [ ] **Step 3: 验证 automation**

View automation `boxsofa` and confirm the unchanged schedule plus the new order-send-first prompt.
