# BoxSofa Data Center Design

Date: 2026-07-23
Status: Approved in conversation, pending written-spec review
Audience: BoxSofa owner

## 1. Objective

Build a Chinese-language BoxSofa owner application that works as:

- an installable Windows desktop application;
- a mobile management application that can be added to the home screen;
- a complete ecommerce operating console, not a read-only analytics dashboard.

Both clients use one protected cloud data platform. The first release is owner-only. There is no employee role system in this scope.

The application must show real business data only. Any unavailable source is shown as disconnected, delayed, failed, or manually entered. Demo values must never appear in production.

## 2. Approved Product Direction

The product combines two approved interface concepts:

- **Operations cockpit as the home screen:** GMV, net sales, orders, visitors, conversion, urgent work, alerts, and channel performance.
- **Data Cube as a dedicated analysis area:** reusable filters across date, platform, content, product, country, traffic source, customer, and order status.

The implementation approach is one cloud management application with:

- a Windows-installed PWA experience using the system WebView/browser application runtime;
- a responsive mobile PWA;
- one Next.js codebase;
- Supabase as the operational data store;
- Vercel for protected APIs, scheduled jobs, and deployment.

The Windows application must have its own app name, icon, standalone window, desktop/start-menu entry, update path, and uninstall path. A separate native Windows codebase is not required.

## 3. Delivery Phases

All approved modules belong to the same product, but delivery is staged to control cost and reduce operational risk.

### Phase 1: Truthful commerce foundation

- owner authentication and device sessions;
- operations cockpit;
- real order, payment, customer, lead, support, review, and inventory data;
- first-party consent-aware website analytics ingestion;
- GMV, net sales, visitor, source, funnel, and conversion metrics;
- returns and after-sales case foundation;
- alerts, audit records, exports, and sync health;
- Windows installation and mobile PWA.

### Phase 2: Social and marketing intelligence

- official/API social account connections;
- scheduled social metric synchronization twice per day;
- content-level views, reach, engagement, clicks, and attributed orders;
- manual and CSV fallback when official APIs are unavailable;
- content calendar and publish-history mapping;
- abandoned-cart, email, campaign, influencer, and affiliate reporting.

### Phase 3: Profit, procurement, and advanced Data Cube

- supplier and purchase-order workflows;
- landed cost and replenishment suggestions;
- Stripe fees, shipping costs, after-sales costs, gross margin, and contribution margin;
- country and VAT reporting dimensions;
- saved Data Cube views and scheduled exports.

## 4. Functional Modules

### 4.1 Operations cockpit

- today, 7-day, 30-day, and custom date ranges;
- GMV, net sales, refunds, paid orders, average order value, visitors, and conversion;
- comparisons against the previous equivalent period;
- urgent tasks for new orders, overdue fulfillment, support, returns, stock, payment mismatches, and failed syncs;
- channel and content summaries;
- data freshness and coverage indicators.

### 4.2 Orders and fulfillment

- search by order number, customer, email, phone, and product;
- payment, fulfillment, shipment, cancellation, return, and refund status;
- order timeline, internal notes, customer communication history, carrier, tracking number, and tracking URL;
- bulk export and bounded bulk actions;
- confirmation before cancellation, refund, or customer communication.

### 4.3 Payments and reconciliation

- Stripe payment, refund, failure, fee, and dispute records;
- daily website-order-to-Stripe reconciliation;
- alerts for missing, duplicated, or mismatched amounts;
- gross paid amount, fees, refunded amount, and net settlement reporting.

### 4.4 Product center

- style, SKU, category, seat type, color, media, price, cost, stock, status, and SEO fields;
- publish/unpublish controls;
- completeness checks for missing price, dimensions, weight, media, cost, or delivery data;
- product performance links to traffic, cart, order, return, review, and margin data.

### 4.5 Inventory and procurement

- available, reserved, incoming, damaged, and returned inventory;
- stock movements and adjustment reasons;
- low-stock and out-of-stock alerts;
- suppliers, purchase orders, expected arrival, landed cost, and replenishment suggestions.

### 4.6 Customer CRM

- customer profile, orders, lifetime spend, average order value, support, returns, reviews, consent, and communication history;
- customer tags and segments;
- first-time, repeat, high-value, dormant, and after-sales-risk customer views;
- GDPR-aware export and deletion workflow.

### 4.7 Traffic and attribution

- consent-aware page views, product views, add-to-cart, checkout, and paid-order events;
- unique visitors, sessions, country, device, landing page, referrer, UTM source, medium, and campaign;
- acquisition and product funnels;
- last non-direct click attribution;
- analytics consent coverage, so visitor-based conversion is never presented without context.

### 4.8 Social center

- TikTok, Instagram, Facebook, YouTube, Pinterest, and AiToEarn publish records;
- account and connection health;
- platform-native reach, impressions, views, completion, engagement, profile visits, link clicks, and followers where exposed;
- content-to-site and content-to-order attribution using UTM and mapped publish records;
- twice-daily synchronization, retry, manual refresh, CSV import, and manual correction;
- original platform definitions remain separate; unlike metrics are not silently merged.

### 4.9 Marketing center

- campaign and UTM registry;
- discount codes and campaign performance;
- newsletter subscriptions and email performance;
- abandoned-cart recovery;
- influencer, affiliate, commission, sample, and attributed-order tracking;
- content calendar and reusable UGC library.

### 4.10 Returns and after-sales

- cases linked to customer, order, item, shipment, and payment;
- reason, evidence, responsibility, requested remedy, status, owner notes, and deadlines;
- distinct request, approval, return-in-transit, received, replacement, partial refund, and completed states;
- refund, return shipping, replacement, damage, and service cost reporting;
- overdue and repeated-problem alerts.

### 4.11 Reviews and UGC

- review moderation, visibility, pinned state, rating, order verification, and product linkage;
- rating and negative-review trends;
- customer media and permission status;
- approved UGC links to campaigns and social content.

### 4.12 Finance

- GMV, net sales, Stripe fees, refunds, shipping, product cost, after-sales cost, gross margin, and contribution margin;
- country, product, campaign, customer, and period dimensions;
- VAT-oriented exports without claiming to replace professional accounting software;
- explicit missing-cost state rather than treating missing values as zero.

### 4.13 Data Cube

- dimensions: date, platform, content, campaign, product, category, country, source, customer segment, and order status;
- measures: impressions, reach, views, clicks, visitors, product views, carts, checkouts, paid orders, GMV, refunds, net sales, cost, and margin;
- filters, sorting, comparisons, saved views, CSV export, and drill-through to source records;
- mobile presentation uses filtered cards and summaries instead of wide desktop tables.

### 4.14 System center

- integration authorization and health;
- synchronization history, errors, retry, and last-success time;
- manual imports and correction audit;
- notification preferences;
- data export, retention, backup visibility, device sessions, and security alerts;
- application version and update status.

## 5. Desktop and Mobile Experience

### Desktop

The desktop application provides the complete module navigation, universal search, dense tables, comparisons, exports, and Data Cube.

Primary navigation:

1. Operations
2. Orders
3. Products
4. Inventory
5. Customers
6. Traffic
7. Social
8. Marketing
9. After-sales
10. Reviews and UGC
11. Finance
12. Data Cube
13. System

Universal search covers order number, customer, email, SKU, product, social content, and after-sales case.

### Mobile

The mobile application prioritizes:

- overview;
- orders;
- after-sales;
- alerts and notifications;
- universal search;
- compact data summaries;
- a More area for the remaining modules.

Mobile supports operational actions but retains confirmation for refunds, cancellations, deletion, messages, and publishing.

## 6. Architecture and Data Flow

### Clients

- Windows-installed PWA;
- mobile PWA;
- owner session only;
- no Stripe, Supabase service-role, or social API secrets stored in either client.

### Protected application layer

- owner-only Next.js API routes;
- server-side authentication and authorization on every operation;
- Zod validation, rate limiting, audit logging, and idempotency for external side effects;
- metric services with one canonical definition per metric;
- scheduled sync jobs and retry queues;
- notification and anomaly services.

### Data layer

Supabase stores:

- commerce records;
- analytics events and consent;
- after-sales cases;
- social accounts, content mappings, and metric snapshots;
- campaigns and attribution;
- costs and finance dimensions;
- sync runs, alerts, corrections, and audit records.

Existing tables and APIs are reused where their contracts are sufficient. New tables are added through explicit migrations. Local browser storage must not remain the source of truth for business analytics.

### Integrations

- Stripe: already connected; expand reconciliation and fee/refund ingestion.
- Website analytics: replace local-only events with consent-aware server ingestion.
- Meta, YouTube, TikTok: official/API authorization required.
- Pinterest and AiToEarn: verify available metrics and API contracts before enabling automatic sync.
- CSV/manual input: supported fallback with source type and audit reason.

## 7. Metric Definitions

- **GMV:** successful Stripe-paid order merchandise total before refunds.
- **Net sales:** GMV minus completed refunds.
- **Placed order value:** submitted order value shown separately from GMV.
- **Average order value:** GMV divided by paid orders.
- **Conversion rate:** paid orders divided by analytics-consented unique visitors for the selected period.
- **Refund rate:** refunded amount divided by GMV, with count-based return rate shown separately.
- **Gross margin:** net sales minus product cost, Stripe fees, shipping cost, and after-sales cost.
- **Attribution:** UTM first; otherwise recognized referrer; last non-direct click for order attribution.
- **Social metrics:** preserved according to each platform's definitions and labeled by platform.

Raw timestamps are stored in UTC. The interface uses Europe/Madrid time.

## 8. Privacy and Security

- owner-only access in this release;
- optional second-factor authentication and device-session management;
- service keys only in server environments;
- Row Level Security remains enabled;
- consent-aware analytics appropriate for European users;
- bounded retention for raw visitor-level data;
- audit history for sensitive reads and all write actions;
- confirmation for refunds, cancellations, deletion, messages, publishing, imports, and manual metric corrections;
- no secrets, direct personal contact/payment identifiers, or customer message bodies in analytics widgets or logs.

## 9. Error Handling and Data Quality

- every data block exposes source, last successful sync, and health state;
- health states: current, delayed, failed, disconnected, manual, and partial;
- failed syncs retry with bounded exponential backoff;
- a failed run never overwrites the last valid snapshot;
- duplicate webhooks and sync pages are idempotent;
- manual edits require a reason and preserve previous values;
- missing cost is unknown, not zero;
- unavailable platform data remains unavailable rather than estimated;
- the dashboard distinguishes no activity from missing data;
- order and Stripe discrepancies generate owner alerts.

## 10. Notifications

Owner notifications cover:

- new paid order;
- payment or reconciliation failure;
- fulfillment deadline;
- new or overdue after-sales case;
- refund or dispute;
- low inventory;
- negative review;
- analytics or social sync failure;
- unusual changes in traffic, conversion, or refund rate.

Windows can use system notifications. Mobile can use in-app notifications first; web push is added only after permission and browser support checks.

## 11. Testing and Acceptance

### Automated

- metric definition unit tests;
- attribution, refund, margin, and timezone tests;
- API authentication and authorization tests;
- analytics ingestion and consent tests;
- Stripe webhook and reconciliation integration tests;
- social sync pagination, retry, rate-limit, and idempotency tests;
- database migration and RLS tests;
- responsive desktop/mobile workflow tests.

### Release acceptance

- production contains no demo business data;
- GMV reconciles to successful Stripe-paid orders for the sampled period;
- local browser analytics is no longer the reporting source of truth;
- each dashboard block shows freshness and source;
- disconnected integrations are visible and actionable;
- no unauthorized user can read owner APIs;
- Windows install, launch, standalone display, update, and uninstall work;
- mobile install and key order/after-sales actions work;
- production verification remains green for storefront and admin routes;
- no real refund, customer email, or social publish is triggered during automated validation.

## 12. Non-Goals

- employee and warehouse role permissions;
- native iOS and Android codebases;
- replacing a certified accountant or tax filing service;
- estimating unavailable social metrics;
- browser scraping as a primary social data source;
- automatic refund or content publication without owner confirmation.
