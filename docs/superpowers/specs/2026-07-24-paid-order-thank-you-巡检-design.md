# Paid Order Thank-You Inspection Design

## Decision

This design supersedes the automatic website outbox and Vercel cron design in `2026-07-24-paid-order-thank-you-email-design.md`.

BoxSofa will send paid-order thank-you emails from the existing local customer-service automation. The website application will not own automatic thank-you delivery.

## Schedule

Keep the existing `boxsofa` automation schedule:

- Monday through Friday
- 09:00 and 16:00 Europe/Madrid time

Each run checks paid orders first, then performs the existing unread support-mail inspection.

## Order Selection

The local inspection script reads the BoxSofa backend using server-side credentials already stored outside the repository. It selects a bounded list of orders that:

- have confirmed successful payment;
- contain a customer name and valid email address;
- have not previously recorded a successful thank-you send.

Pending, failed, disputed, refunded-before-send, malformed, or otherwise uncertain payments are not emailed automatically and are reported for owner review.

## Email

The automation sends from `info@boxsofa.eu` through the existing local mail client.

It uses the customer name, email, order number, and order language. Supported languages remain Chinese, English, Spanish, French, and German. The approved copy thanks the customer for purchasing from `boxsofa.eu` and says BoxSofa will arrange shipment as soon as possible.

If the customer has newly reached the existing EUR 300 membership threshold, the same message also thanks the customer for becoming a BoxSofa member.

## Duplicate Prevention

The order number is the idempotency key.

After the mail client confirms a successful send, the local process records:

- order number;
- send timestamp;
- recipient language;
- membership paragraph included or omitted.

The record contains no mailbox password, API key, full email body, or payment data. An order with a successful record is skipped on later runs. Failed sends are not recorded as successful and may be retried on the next scheduled run.

## Run Report

Each automation run reports:

- number of new paid orders found;
- order numbers successfully emailed;
- failed or manual-review order numbers;
- unread customer-mail summary from the existing mailbox inspection.

It never prints credentials or full payment/customer records.

## Website Rollback

Use Git revert commits to remove the recently merged website implementation, including:

- migration 026 and its application dependencies;
- database email templates and automatic-delivery state;
- the Vercel email cron route and schedule;
- automatic dispatcher, retry, and release-gate additions that exist only for this feature.

Revert operations must preserve unrelated website work and the existing local mailbox scripts.

## Safety and Testing

Before enabling sends:

- prove paid/pending/refunded classification with fixtures;
- prove the five language selections;
- prove one successful send per order number across repeated runs;
- prove a failed send retries;
- prove uncertain payments require manual review;
- run in dry-run mode against current paid orders and inspect the proposed recipient/order list without sending.

The first live run occurs only after the dry-run output is reviewed. The automation is then updated to allow direct sends under these rules.
