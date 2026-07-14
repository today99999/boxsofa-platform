"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ANALYTICS_EVENTS_KEY, type AnalyticsEvent } from "@/lib/analytics";
import { readLocalAuthSession } from "@/lib/auth";
import { ORDERS_KEY, type LocalOrder } from "@/lib/cart";
import { buildOrderEmailPreview, type OrderEmailEvent, type OrderEmailPreview } from "@/lib/email-notifications";
import { products } from "@/lib/catalog";
import {
  averageRating,
  getStoredReviews,
  type ProductReview,
  saveStoredReviews,
  visibleReviewsForStyle
} from "@/lib/reviews";
import {
  addSupportMessage,
  closeSupportThread,
  readSupportThreads,
  SUPPORT_THREADS_EVENT,
  type ChatThread
} from "@/lib/supportChat";
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from "@/lib/supabase/browser";

type OrderStatusFilter = "all" | LocalOrder["status"];
type OrderActionStatus = "idle" | "saving" | "saved" | "error";
type ProductDraftItem = { priceEur: number; stock: number; reservedStock: number; availableStock: number; active: boolean };
type ProductDraft = Record<string, Partial<ProductDraftItem>>;
type ProductFilter = "all" | "low" | "changed" | "hidden";
type ProductSaveStatus = "idle" | "saving" | "saved" | "error";
type DateRange = "today" | "7d" | "30d" | "all";
type AdSpendDraft = Record<string, number>;
type OrderSource = "本地原型数据" | "Supabase 数据库";
type OrderListResponse = { ok: boolean; mode: "local" | "supabase"; orders?: LocalOrder[]; message?: string };
type OrderUpdateResponse = { ok: boolean; mode: "local" | "supabase"; message?: string; emailPreview?: OrderEmailPreview | null; emailQueued?: boolean; emailQueueWarning?: string | null };
type ProductUpdateResponse = { ok: boolean; mode: "local" | "supabase"; message?: string };
type AuthProfileResponse = {
  ok: boolean;
  mode: "local" | "supabase";
  message?: string;
  profile?: {
    id: string;
    email: string;
    full_name?: string;
    role: "customer" | "owner" | "service";
  } | null;
};
type ProductListResponse = {
  ok: boolean;
  mode: "local" | "supabase";
  products?: Array<{ productId: string; priceEur: number; stock: number; reservedStock: number; availableStock: number; active: boolean }>;
  message?: string;
};
type ReviewListResponse = { ok: boolean; mode: "local" | "supabase"; reviews?: ProductReview[]; message?: string };
type ReviewUpdateResponse = { ok: boolean; mode: "local" | "supabase"; message?: string };
type SupportListResponse = { ok: boolean; mode: "local" | "supabase"; threads?: ChatThread[]; message?: string };
type SupportUpdateResponse = { ok: boolean; mode: "local" | "supabase"; message?: string };
type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
};
type AuditLogResponse = { ok: boolean; mode: "local" | "supabase"; logs?: AuditLog[]; message?: string };
type EmailNotification = {
  id: string;
  order_id: string | null;
  order_number: string;
  customer_email: string;
  event: string;
  subject: string;
  preview_text: string;
  body_text: string;
  provider: string;
  status: "queued" | "sent" | "failed" | "skipped" | string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};
type EmailNotificationResponse = { ok: boolean; mode: "local" | "supabase"; notifications?: EmailNotification[]; message?: string };
type EmailNotificationUpdateResponse = { ok: boolean; mode: "local" | "supabase"; notification?: EmailNotification; message?: string };
type ReadinessSummary = {
  customerProfiles: number;
  merchantProfiles: number;
  pendingOrders: number;
  lowStockProducts: number;
  queuedEmailNotifications: number;
  failedEmailNotifications: number;
  openSupportThreads: number;
  needsReplySupportThreads: number;
  customerOrdersProtected: boolean;
  adminApisProtected: boolean;
  emailProviderConfigured: boolean;
  emailProviderStatus?: {
    configured: boolean;
    provider: string;
    issues: string[];
  };
  emailProviderIssues?: string[];
};
type ReadinessResponse = { ok: boolean; mode: "local" | "supabase"; readiness?: ReadinessSummary; message?: string };
type TestCustomerResponse = {
  ok: boolean;
  mode: "local" | "supabase";
  created?: boolean;
  email?: string;
  password?: string;
  message?: string;
};
type NotificationStatusFilter = "all" | "queued" | "sent" | "failed" | "skipped";
type SupportFilter = "all" | "needs_reply" | "open" | "closed";
type AdminSection = "dashboard" | "launch" | "traffic" | "orders" | "products" | "reviews" | "customers" | "stock" | "audit" | "notifications" | "support";
type AdminAccess = "checking" | "allowed" | "denied";

const PRODUCT_DRAFTS_KEY = "boxsofa_admin_product_drafts_v1";
const AD_SPEND_KEY = "boxsofa_admin_ad_spend_v1";
const testCustomerCreationEnabled = process.env.NEXT_PUBLIC_ALLOW_TEST_CUSTOMER_CREATION === "true";
const supportQuickReplies = [
  "您好，感谢咨询。请问您想了解哪一款沙发、颜色和送货国家？",
  "这款沙发为压缩包装，跨境物流预计 23-30 天到达。",
  "当前订单会先提交为待确认付款，商家会联系您确认付款方式。",
  "好的，我们会为您确认库存和包装信息，稍后回复。"
];

const adminSections: Array<{ id: AdminSection; label: string }> = [
  { id: "dashboard", label: "数据看板" },
  { id: "launch", label: "上线检查" },
  { id: "traffic", label: "数据罗盘" },
  { id: "orders", label: "订单与物流" },
  { id: "products", label: "商品与库存" },
  { id: "reviews", label: "客户评价" },
  { id: "customers", label: "客户会员" },
  { id: "stock", label: "低库存提醒" },
  { id: "notifications", label: "邮件通知" },
  { id: "audit", label: "操作日志" },
  { id: "support", label: "客服聊天" }
];

const adminSectionAliases: Record<string, AdminSection> = {
  members: "customers",
  "low-stock": "stock"
};

const sourceLabels: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  x: "X",
  google: "Google",
  direct: "直接访问",
  referral: "其他网站"
};

const demoSources = [
  { source: "tiktok", visitors: 1280, productViews: 760, carts: 92, orders: 18, revenue: 10422, spend: 1380 },
  { source: "instagram", visitors: 860, productViews: 540, carts: 76, orders: 21, revenue: 12680, spend: 960 },
  { source: "facebook", visitors: 420, productViews: 220, carts: 28, orders: 7, revenue: 3980, spend: 520 },
  { source: "youtube", visitors: 310, productViews: 188, carts: 19, orders: 5, revenue: 2840, spend: 430 },
  { source: "google", visitors: 260, productViews: 170, carts: 24, orders: 9, revenue: 5120, spend: 680 }
];

const demoTrend = [
  { label: "周一", visitors: 420, orders: 8 },
  { label: "周二", visitors: 470, orders: 9 },
  { label: "周三", visitors: 390, orders: 6 },
  { label: "周四", visitors: 510, orders: 11 },
  { label: "周五", visitors: 620, orders: 13 },
  { label: "周六", visitors: 530, orders: 9 },
  { label: "周日", visitors: 360, orders: 7 }
];

function money(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function plannedOrderEmailEvent(order: LocalOrder): OrderEmailEvent | null {
  if (order.status === "pending_confirm") return "payment_confirmed";
  if (order.status === "paid_confirmed" && order.trackingNumber) return "order_shipped";
  if (order.status === "shipped") return "order_shipped";
  if (order.status === "cancelled") return "order_cancelled";
  return null;
}

function orderEmailInput(order: LocalOrder) {
  return {
    orderNumber: order.id,
    customerName: order.customerName,
    customerEmail: order.email,
    totalEur: order.totalEur,
    carrier: order.carrier ?? null,
    trackingNumber: order.trackingNumber ?? null
  };
}

function statusText(status: LocalOrder["status"]) {
  return {
    pending_confirm: "待确认付款",
    paid_confirmed: "已确认付款",
    shipped: "已发货",
    cancelled: "已取消"
  }[status];
}

function customerKey(order: LocalOrder) {
  return order.email || order.phone || order.customerName;
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function labelSource(source: string) {
  return sourceLabels[source] ?? source;
}

function reviewFingerprint(review: ProductReview) {
  return [review.productSlug, review.customerName, review.country, review.rating, review.comment]
    .map((part) => String(part).trim().toLowerCase())
    .join("|");
}

function inDateRange(date: string, range: DateRange) {
  if (range === "all") return true;
  const created = new Date(date).getTime();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  if (range === "today") return created >= new Date().setHours(0, 0, 0, 0);
  if (range === "7d") return created >= now - oneDay * 7;
  return created >= now - oneDay * 30;
}

export function AdminClient({ initialSection = "dashboard" }: { initialSection?: AdminSection } = {}) {
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [keyword, setKeyword] = useState("");
  const [productKeyword, setProductKeyword] = useState("");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [productDrafts, setProductDrafts] = useState<ProductDraft>({});
  const [serverProductDrafts, setServerProductDrafts] = useState<ProductDraft>({});
  const [productSaveStatus, setProductSaveStatus] = useState<Record<string, ProductSaveStatus>>({});
  const [adSpend, setAdSpend] = useState<AdSpendDraft>({});
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [supportThreads, setSupportThreads] = useState<ChatThread[]>([]);
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [supportFilter, setSupportFilter] = useState<SupportFilter>("needs_reply");
  const [orderSource, setOrderSource] = useState<OrderSource>("本地原型数据");
  const [orderSyncMessage, setOrderSyncMessage] = useState("");
  const [orderActionStatus, setOrderActionStatus] = useState<Record<string, OrderActionStatus>>({});
  const [orderEmailPreviews, setOrderEmailPreviews] = useState<Record<string, OrderEmailPreview>>({});
  const [productSyncMessage, setProductSyncMessage] = useState("");
  const [reviewSyncMessage, setReviewSyncMessage] = useState("");
  const [supportSyncMessage, setSupportSyncMessage] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditSyncMessage, setAuditSyncMessage] = useState("");
  const [emailNotifications, setEmailNotifications] = useState<EmailNotification[]>([]);
  const [notificationSyncMessage, setNotificationSyncMessage] = useState("");
  const [notificationStatusFilter, setNotificationStatusFilter] = useState<NotificationStatusFilter>("all");
  const [notificationActionStatus, setNotificationActionStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [readiness, setReadiness] = useState<ReadinessSummary | null>(null);
  const [readinessMode, setReadinessMode] = useState<"local" | "supabase" | null>(null);
  const [readinessMessage, setReadinessMessage] = useState("");
  const [testCustomerStatus, setTestCustomerStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testCustomerCredentials, setTestCustomerCredentials] = useState<{ email: string; password?: string; message: string } | null>(null);
  const [adminAccess, setAdminAccess] = useState<AdminAccess>("checking");
  const [adminAccessMessage, setAdminAccessMessage] = useState("");

  useEffect(() => {
    async function verifyAdminAccess() {
      const session = readLocalAuthSession();
      if (session?.role !== "merchant") {
        setAdminAccess("denied");
        setAdminAccessMessage("请先使用商家账号登录。");
        return;
      }

      try {
        const response = await fetch("/api/auth/profile");
        const result = (await response.json()) as AuthProfileResponse;
        const role = result.profile?.role;
        if (response.ok && result.ok && (role === "owner" || role === "service")) {
          setAdminAccess("allowed");
          setAdminAccessMessage("");
          return;
        }
        setAdminAccess("denied");
        setAdminAccessMessage(result.message || "当前登录不是 Supabase 商家账号，请重新登录。");
      } catch {
        setAdminAccess("denied");
        setAdminAccessMessage("无法确认商家登录状态，请重新登录。");
      }
    }

    void verifyAdminAccess();
  }, []);

  useEffect(() => {
    function syncSectionFromLocation() {
      const pathSection = window.location.pathname.split("/").filter(Boolean).at(1) || "";
      const hashSection = window.location.hash.replace("#", "");
      const rawSection = pathSection || hashSection;
      const nextSection = adminSectionAliases[rawSection] ?? rawSection;
      if (adminSections.some((section) => section.id === nextSection)) {
        setActiveSection(nextSection as AdminSection);
      }
    }

    syncSectionFromLocation();
    window.addEventListener("hashchange", syncSectionFromLocation);
    window.addEventListener("popstate", syncSectionFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncSectionFromLocation);
      window.removeEventListener("popstate", syncSectionFromLocation);
    };
  }, []);

  useEffect(() => {
    if (adminAccess !== "allowed") return;

    const localOrders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]") as LocalOrder[];
    setOrders(localOrders);
    setProductDrafts(JSON.parse(localStorage.getItem(PRODUCT_DRAFTS_KEY) || "{}"));
    setAdSpend(JSON.parse(localStorage.getItem(AD_SPEND_KEY) || "{}"));
    setAnalyticsEvents(JSON.parse(localStorage.getItem(ANALYTICS_EVENTS_KEY) || "[]"));
    void loadReviews();
    void loadProductDrafts();
    void loadSupportThreads();
    void loadAuditLogs();
    void loadEmailNotifications();
    void loadReadiness();

    void loadOrders();
  }, [adminAccess]);

  useEffect(() => {
    if (adminAccess !== "allowed") return;

    function refreshSupportThreads() {
      void loadSupportThreads();
    }

    refreshSupportThreads();
    window.addEventListener(SUPPORT_THREADS_EVENT, refreshSupportThreads);
    return () => window.removeEventListener(SUPPORT_THREADS_EVENT, refreshSupportThreads);
  }, [adminAccess]);

  useEffect(() => {
    if (adminAccess !== "allowed" || !hasSupabaseBrowserConfig()) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel("boxsofa-admin-support")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, () => {
        void loadSupportThreads();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        void loadSupportThreads();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSupportSyncMessage("客服会话已连接 Supabase 实时订阅。");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [adminAccess]);

  useEffect(() => {
    if (adminAccess !== "allowed" || activeSection !== "support") return;

    const intervalId = window.setInterval(() => {
      void loadSupportThreads();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [activeSection, adminAccess]);

  function openSection(section: AdminSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", section === "dashboard" ? "/admin" : `/admin/${section}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveOrders(nextOrders: LocalOrder[]) {
    setOrders(nextOrders);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(nextOrders));
    window.dispatchEvent(new Event("boxsofa-orders-updated"));
  }

  async function loadEmailNotifications() {
    try {
      const response = await fetch("/api/admin/notifications");
      const result = (await response.json()) as EmailNotificationResponse;
      if (!response.ok || !result.ok) {
        setNotificationSyncMessage(result.message || "Email notification queue is temporarily unavailable.");
        return;
      }
      setEmailNotifications(result.notifications ?? []);
      setNotificationSyncMessage(result.mode === "supabase" ? "Email notification queue is connected to Supabase." : "Email notification queue will appear after Supabase is connected.");
    } catch {
      setNotificationSyncMessage("Email notification queue is temporarily unavailable.");
    }
  }

  async function loadReadiness() {
    try {
      const response = await fetch("/api/admin/readiness");
      const result = (await response.json()) as ReadinessResponse;
      if (!response.ok || !result.ok) {
        setReadinessMessage(result.message || "上线检查暂时不可用。");
        return;
      }
      setReadiness(result.readiness ?? null);
      setReadinessMode(result.mode);
      setReadinessMessage(result.mode === "supabase" ? "上线检查已连接 Supabase 真实数据。" : "上线检查当前使用本地原型数据。");
    } catch {
      setReadinessMode(null);
      setReadinessMessage("上线检查暂时不可用。");
    }
  }

  async function createTestCustomer() {
    setTestCustomerStatus("saving");
    setTestCustomerCredentials(null);

    try {
      const response = await fetch("/api/admin/test-customer", { method: "POST" });
      const result = (await response.json()) as TestCustomerResponse;
      if (!response.ok || !result.ok || !result.email) {
        setTestCustomerStatus("error");
        setTestCustomerCredentials({
          email: "",
          message: result.message || "创建买家测试账号失败。"
        });
        return;
      }

      setTestCustomerStatus("saved");
      setTestCustomerCredentials({
        email: result.email,
        password: result.password,
        message: result.message || (result.created ? "买家测试账号已创建。" : "买家测试账号已存在。")
      });
      void loadReadiness();
    } catch {
      setTestCustomerStatus("error");
      setTestCustomerCredentials({
        email: "",
        message: "创建买家测试账号失败。"
      });
    }
  }

  async function updateEmailNotification(notificationId: string, action: "requeue" | "skip" | "send") {
    setNotificationActionStatus((current) => ({ ...current, [notificationId]: "saving" }));
    try {
      const response = await fetch(`/api/admin/notifications/${encodeURIComponent(notificationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const result = (await response.json()) as EmailNotificationUpdateResponse;
      if (!response.ok || !result.ok) {
        setNotificationSyncMessage(result.message || "Could not update email notification.");
        setNotificationActionStatus((current) => ({ ...current, [notificationId]: "error" }));
        return false;
      }
      if (result.notification) {
        setEmailNotifications((current) =>
          current.map((notification) => (notification.id === notificationId ? result.notification! : notification))
        );
      }
      const actionMessages = {
        requeue: "Email notification was returned to the queue.",
        skip: "Email notification was marked as skipped.",
        send: result.ok ? "Email notification was sent." : result.message || "Email sending failed."
      };
      setNotificationSyncMessage(actionMessages[action]);
      setNotificationActionStatus((current) => ({ ...current, [notificationId]: "saved" }));
      return true;
    } catch {
      setNotificationSyncMessage("Could not update email notification.");
      setNotificationActionStatus((current) => ({ ...current, [notificationId]: "error" }));
      return false;
    }
  }

  async function loadSupportThreads() {
    setSupportThreads(readSupportThreads());

    try {
      const response = await fetch("/api/admin/support");
      const result = (await response.json()) as SupportListResponse;
      if (!response.ok || !result.ok) {
        setSupportSyncMessage(result.message || "客服会话暂时不可用，请稍后刷新。");
        return;
      }
      if (result.mode === "supabase") {
        setSupportThreads(result.threads ?? []);
        setSupportSyncMessage("客服会话已连接 Supabase。");
      } else {
        setSupportSyncMessage("客服会话需要 Supabase 后显示。");
      }
    } catch {
      setSupportSyncMessage("客服会话暂时不可用，请稍后刷新。");
    }
  }

  async function loadAuditLogs() {
    try {
      const response = await fetch("/api/admin/audit");
      const result = (await response.json()) as AuditLogResponse;
      if (!response.ok || !result.ok) {
        setAuditSyncMessage(result.message || "操作日志暂时不可用。");
        return;
      }
      setAuditLogs(result.logs ?? []);
      setAuditSyncMessage(result.mode === "supabase" ? "操作日志已连接 Supabase。" : "操作日志需要 Supabase 后显示。");
    } catch {
      setAuditSyncMessage("操作日志暂时不可用。");
    }
  }

  async function loadProductDrafts() {
    try {
      const response = await fetch("/api/admin/products");
      const result = (await response.json()) as ProductListResponse;
      if (!response.ok || !result.ok) {
        setProductSyncMessage(result.message || "商品数据暂时使用本地草稿。");
        return;
      }

      if (result.mode !== "supabase") {
        setProductSyncMessage("商品数据当前使用本地草稿。");
        return;
      }

      const nextDrafts = (result.products ?? []).reduce<ProductDraft>((drafts, product) => {
        drafts[product.productId] = {
          priceEur: product.priceEur,
          stock: product.stock,
          reservedStock: product.reservedStock,
          availableStock: product.availableStock,
          active: product.active
        };
        return drafts;
      }, {});

      setProductDrafts(nextDrafts);
      setServerProductDrafts(nextDrafts);
      localStorage.setItem(PRODUCT_DRAFTS_KEY, JSON.stringify(nextDrafts));
      setProductSyncMessage("商品价格、库存和上下架状态已从 Supabase 读取。");
    } catch {
      setProductSyncMessage("商品数据暂时使用本地草稿。");
    }
  }

  function updateOrder(orderId: string, patch: Partial<LocalOrder>) {
    saveOrders(orders.map((order) => (order.id === orderId ? { ...order, ...patch } : order)));
  }

  async function loadOrders() {
    try {
      const response = await fetch("/api/orders");
      const result = (await response.json()) as OrderListResponse;
      if (!result.ok) {
        setOrderSyncMessage(result.message || "Order was saved locally, but could not sync to the server.");
        return false;
      }
      if (result.mode === "supabase") {
        setOrders(result.orders ?? []);
        setOrderSource("Supabase 数据库");
      } else {
        setOrderSource("本地原型数据");
      }
      return true;
    } catch {
      setOrderSyncMessage("服务端订单暂时不可用，当前显示本地订单。");
      return false;
    }
  }

  async function syncOrder(orderId: string, patch: { status?: LocalOrder["status"]; carrier?: string; trackingNumber?: string; paymentMethodNote?: string; internalNote?: string }) {
    setOrderActionStatus((current) => ({ ...current, [orderId]: "saving" }));
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const result = (await response.json()) as OrderUpdateResponse;
      if (!response.ok || !result.ok) {
        setOrderSyncMessage(result.message || "Order was saved locally, but could not sync to the server.");
        setOrderActionStatus((current) => ({ ...current, [orderId]: "error" }));
        return false;
      }
      const queueStatus = result.emailQueueWarning
        ? " Email preview was generated, but queue save failed."
        : result.emailQueued
          ? " Email notification queued."
          : "";
      setOrderSyncMessage(result.mode === "supabase" ? `Order synced to Supabase.${queueStatus}` : "");
      setOrderActionStatus((current) => ({ ...current, [orderId]: "saved" }));
      if (result.emailPreview) {
        setOrderEmailPreviews((current) => ({ ...current, [orderId]: result.emailPreview! }));
      }
      if (result.mode === "supabase") {
        void loadOrders();
        void loadProductDrafts();
      }
      return true;
    } catch {
      setOrderSyncMessage("Order was saved locally, but could not sync to the server.");
      setOrderActionStatus((current) => ({ ...current, [orderId]: "error" }));
      return false;
    }
  }

  function confirmPayment(order: LocalOrder) {
    const patch = {
      status: order.status === "shipped" ? "shipped" : "paid_confirmed",
      paidConfirmedAt: order.paidConfirmedAt ?? new Date().toISOString()
    } satisfies Partial<LocalOrder>;
    updateOrder(order.id, patch);
    void syncOrder(order.id, { status: patch.status });
  }

  function markShipped(order: LocalOrder) {
    const patch = {
      status: "shipped",
      paidConfirmedAt: order.paidConfirmedAt ?? new Date().toISOString(),
      shippedAt: order.shippedAt ?? new Date().toISOString()
    } satisfies Partial<LocalOrder>;
    updateOrder(order.id, patch);
    void syncOrder(order.id, {
      status: "shipped",
      carrier: order.carrier,
      trackingNumber: order.trackingNumber
    });
  }

  function saveShipment(order: LocalOrder) {
    void syncOrder(order.id, {
      carrier: order.carrier,
      trackingNumber: order.trackingNumber
    });
  }

  function saveOrderNotes(order: LocalOrder) {
    void syncOrder(order.id, {
      paymentMethodNote: order.paymentMethodNote,
      internalNote: order.internalNote
    });
  }

  function cancelOrder(order: LocalOrder) {
    const patch = { status: "cancelled" } satisfies Partial<LocalOrder>;
    updateOrder(order.id, patch);
    void syncOrder(order.id, { status: "cancelled" });
  }

  function resolvedProductDraft(product: (typeof products)[number]): ProductDraftItem {
    const draft = productDrafts[product.id];
    return {
      priceEur: draft?.priceEur ?? product.priceEur,
      stock: draft?.stock ?? product.stock,
      reservedStock: draft?.reservedStock ?? 0,
      availableStock: Math.max(0, (draft?.stock ?? product.stock) - (draft?.reservedStock ?? 0)),
      active: draft?.active ?? true
    };
  }

  function isProductChanged(product: (typeof products)[number]) {
    const draft = resolvedProductDraft(product);
    const baseline = serverProductDrafts[product.id] ?? {
      priceEur: product.priceEur,
      stock: product.stock,
      reservedStock: 0,
      availableStock: product.stock,
      active: true
    };
    return (
      draft.priceEur !== baseline.priceEur ||
      draft.stock !== baseline.stock ||
      draft.active !== baseline.active
    );
  }

  async function syncProductDraft(productId: string, draft: ProductDraftItem) {
    setProductSaveStatus((current) => ({ ...current, [productId]: "saving" }));
    try {
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          priceEur: draft.priceEur,
          stock: draft.stock,
          active: draft.active
        })
      });
      const result = (await response.json()) as ProductUpdateResponse;
      if (!response.ok || !result.ok) {
        setProductSyncMessage(result.message || "商品修改已保存为本地草稿，但暂时没有同步到服务端。");
        setProductSaveStatus((current) => ({ ...current, [productId]: "error" }));
        return false;
      }
      setProductSyncMessage(result.mode === "supabase" ? "商品修改已同步到 Supabase。" : "商品修改已保存为本地草稿。");
      setProductSaveStatus((current) => ({ ...current, [productId]: "saved" }));
      if (result.mode === "supabase") void loadProductDrafts();
      return true;
    } catch {
      setProductSyncMessage("商品修改已保存为本地草稿，但暂时没有同步到服务端。");
      setProductSaveStatus((current) => ({ ...current, [productId]: "error" }));
      return false;
    }
  }

  function saveProductDraft(productId: string, patch: Partial<ProductDraftItem>) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const current = resolvedProductDraft(product);
    const nextDraft = {
      ...current,
      ...patch
    };
    const next = {
      ...productDrafts,
      [productId]: nextDraft
    };
    setProductDrafts(next);
    localStorage.setItem(PRODUCT_DRAFTS_KEY, JSON.stringify(next));
    setProductSaveStatus((current) => ({ ...current, [productId]: "idle" }));
    setProductSyncMessage("商品修改已成为待保存草稿，点击对应 SKU 的保存按钮后写入 Supabase。");
  }

  function resetProductDrafts() {
    const nextDrafts = Object.keys(serverProductDrafts).length > 0 ? serverProductDrafts : {};
    setProductDrafts(nextDrafts);
    setProductSaveStatus({});
    if (Object.keys(nextDrafts).length > 0) {
      localStorage.setItem(PRODUCT_DRAFTS_KEY, JSON.stringify(nextDrafts));
      setProductSyncMessage("本地商品运营草稿已恢复为数据库最新值。");
    } else {
      localStorage.removeItem(PRODUCT_DRAFTS_KEY);
      setProductSyncMessage("本地商品运营草稿已清空。");
    }
  }

  function saveAdSpend(source: string, value: number) {
    const next = { ...adSpend, [source]: value };
    setAdSpend(next);
    localStorage.setItem(AD_SPEND_KEY, JSON.stringify(next));
  }

  async function loadReviews() {
    const localReviews = getStoredReviews().map((review) => ({
      ...review,
      source: review.source ?? ("seed" as const)
    }));

    try {
      const response = await fetch("/api/admin/reviews");
      const result = (await response.json()) as ReviewListResponse;
      if (!response.ok || !result.ok || !result.reviews) {
        setReviews(localReviews);
        setReviewSyncMessage(result.message || "真实评价暂时无法读取，当前只显示示例评价。");
        return;
      }

      const realIds = new Set(result.reviews.map((review) => review.id));
      const realFingerprints = new Set(result.reviews.map(reviewFingerprint));
      const readOnlyLocalReviews = localReviews.filter(
        (review) => !realIds.has(review.id) && !realFingerprints.has(reviewFingerprint(review))
      );
      setReviews([...result.reviews, ...readOnlyLocalReviews]);
      setReviewSyncMessage("真实评价已从 Supabase 读取；示例评价仅展示，不参与后台操作。");
    } catch {
      setReviews(localReviews);
      setReviewSyncMessage("真实评价暂时无法读取，当前只显示示例评价。");
    }
  }

  async function updateSupabaseReview(reviewId: string, patch: Partial<ProductReview>) {
    const review = reviews.find((item) => item.id === reviewId);
    if (!review || review.source !== "supabase") {
      setReviewSyncMessage("示例评价只用于前台展示，不能在后台置顶或删除。");
      return;
    }

    try {
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinned: patch.pinned,
          deleted: patch.deleted
        })
      });
      const result = (await response.json()) as ReviewUpdateResponse;
      if (!response.ok || !result.ok) {
        setReviewSyncMessage(result.message || "评价修改失败，数据库没有保存。");
        return;
      }

      const next = reviews.map((item) => (item.id === reviewId ? { ...item, ...patch } : item));
      setReviews(next);
      saveStoredReviews(next);
      setReviewSyncMessage(result.mode === "supabase" ? "评价修改已同步到 Supabase。" : "评价修改已保存。");
    } catch {
      setReviewSyncMessage("评价修改失败，数据库没有保存。");
    }
  }

  async function syncReviewUpdate(reviewId: string, patch: Partial<ProductReview>) {
    try {
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinned: patch.pinned,
          deleted: patch.deleted
        })
      });
      const result = (await response.json()) as ReviewUpdateResponse;
      if (!response.ok || !result.ok) {
        setReviewSyncMessage(result.message || "评价修改已保存为本地草稿，但暂时没有同步到服务端。");
        return;
      }
      setReviewSyncMessage(result.mode === "supabase" ? "评价修改已同步到 Supabase。" : "评价修改已保存为本地草稿。");
    } catch {
      setReviewSyncMessage("评价修改已保存为本地草稿，但暂时没有同步到服务端。");
    }
  }

  function updateReview(reviewId: string, patch: Partial<ProductReview>) {
    const next = reviews.map((review) => (review.id === reviewId ? { ...review, ...patch } : review));
    setReviews(next);
    saveStoredReviews(next);
    void syncReviewUpdate(reviewId, patch);
  }

  function updateSupportDraft(threadId: string, value: string) {
    setSupportReplyDrafts((current) => ({ ...current, [threadId]: value }));
  }

  function useQuickReply(threadId: string, text: string) {
    setSupportReplyDrafts((current) => {
      const currentDraft = current[threadId]?.trim();
      return { ...current, [threadId]: currentDraft ? `${currentDraft}\n${text}` : text };
    });
  }

  async function syncSupportThread(threadId: string, patch: { body?: string; status?: "open" | "closed" }) {
    try {
      const response = await fetch(`/api/admin/support/${encodeURIComponent(threadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const result = (await response.json()) as SupportUpdateResponse;
      if (!response.ok || !result.ok) {
        setSupportSyncMessage(result.message || "客服会话已保存在本地，但暂时没有同步到服务端。");
        return;
      }
      setSupportSyncMessage(result.mode === "supabase" ? "客服会话已同步到 Supabase。" : "客服会话已保存，等待服务端同步。");
      if (result.mode === "supabase") void loadSupportThreads();
    } catch {
      setSupportSyncMessage("客服会话已保存在本地，但暂时没有同步到服务端。");
    }
  }

  function replySupportThread(threadId: string) {
    const draft = supportReplyDrafts[threadId] || "";
    if (!draft.trim()) return;
    addSupportMessage(threadId, "service", draft);
    setSupportReplyDrafts((current) => ({ ...current, [threadId]: "" }));
    setSupportThreads(readSupportThreads());
    void syncSupportThread(threadId, { body: draft });
  }

  function closeThread(threadId: string) {
    closeSupportThread(threadId);
    setSupportThreads(readSupportThreads());
    void syncSupportThread(threadId, { status: "closed" });
  }

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        [order.id, order.customerName, order.email, order.phone, order.trackingNumber, order.carrier]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      return matchesStatus && matchesKeyword;
    });
  }, [keyword, orders, statusFilter]);

  const paidOrders = orders.filter((order) => order.status === "paid_confirmed" || order.status === "shipped");
  const confirmedRevenue = paidOrders.reduce((sum, order) => sum + order.totalEur, 0);
  const pendingOrders = orders.filter((order) => order.status === "pending_confirm");
  const shippedOrders = orders.filter((order) => order.status === "shipped");
  const lowStock = products.filter((product) => resolvedProductDraft(product).availableStock <= 10);
  const changedProducts = products.filter(isProductChanged);
  const hiddenProducts = products.filter((product) => !resolvedProductDraft(product).active);

  const filteredProducts = useMemo(() => {
    const normalizedKeyword = productKeyword.trim().toLowerCase();
    return products.filter((product) => {
      const draft = resolvedProductDraft(product);
      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        [product.name, product.sku, product.slug, product.styleId, product.color]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      const matchesFilter =
        productFilter === "all" ||
        (productFilter === "low" && draft.availableStock <= 10) ||
        (productFilter === "changed" && isProductChanged(product)) ||
        (productFilter === "hidden" && !draft.active);
      return matchesKeyword && matchesFilter;
    });
  }, [productDrafts, productFilter, productKeyword, serverProductDrafts]);

  const customers = useMemo(() => {
    const map = new Map<
      string,
      { name: string; email: string; phone: string; spent: number; orders: number; pending: number; member: boolean }
    >();
    orders.forEach((order) => {
      const key = customerKey(order);
      const existing = map.get(key) ?? {
        name: order.customerName,
        email: order.email,
        phone: order.phone,
        spent: 0,
        orders: 0,
        pending: 0,
        member: false
      };
      existing.orders += 1;
      if (order.status === "pending_confirm") {
        existing.pending += order.totalEur;
      } else {
        existing.spent += order.totalEur;
      }
      existing.member = existing.spent >= 300;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent);
  }, [orders]);

  const analytics = useMemo(() => {
    const scopedEvents = analyticsEvents.filter((event) => inDateRange(event.createdAt, dateRange));

    if (scopedEvents.length === 0) {
      return {
        isDemo: true,
        sources: demoSources,
        trend: demoTrend,
        funnel: [
          { label: "访问人数", value: 3130 },
          { label: "商品浏览", value: 1878 },
          { label: "加入购物车", value: 239 },
          { label: "开始结账", value: 116 },
          { label: "提交订单", value: 60 }
        ],
        popularProducts: products.slice(0, 5).map((product, index) => ({
          name: product.styleId,
          views: [420, 360, 310, 250, 190][index] ?? 120,
          carts: [38, 32, 28, 21, 16][index] ?? 8,
          orders: [12, 10, 8, 5, 3][index] ?? 1
        }))
      };
    }

    const sourceMap = new Map<
      string,
      { source: string; visitors: Set<string>; productViews: number; carts: number; orders: number; revenue: number }
    >();
    const productMap = new Map<string, { name: string; views: number; carts: number; orders: number }>();

    const trendMap = new Map<string, { label: string; visitors: Set<string>; orders: number }>();

    scopedEvents.forEach((event) => {
      const date = new Date(event.createdAt);
      const trendKey = date.toISOString().slice(0, 10);
      const trendBucket = trendMap.get(trendKey) ?? {
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        visitors: new Set<string>(),
        orders: 0
      };
      trendBucket.visitors.add(event.visitorId);
      if (event.type === "order_submit") trendBucket.orders += 1;
      trendMap.set(trendKey, trendBucket);

      const bucket = sourceMap.get(event.source) ?? {
        source: event.source,
        visitors: new Set<string>(),
        productViews: 0,
        carts: 0,
        orders: 0,
        revenue: 0
      };
      bucket.visitors.add(event.visitorId);
      if (event.type === "product_view") bucket.productViews += 1;
      if (event.type === "add_to_cart" || event.type === "begin_checkout") bucket.carts += 1;
      if (event.type === "order_submit") {
        bucket.orders += 1;
        bucket.revenue += event.valueEur ?? 0;
      }
      sourceMap.set(event.source, bucket);

      if (event.productName) {
        const product = productMap.get(event.productName) ?? { name: event.productName, views: 0, carts: 0, orders: 0 };
        if (event.type === "product_view") product.views += 1;
        if (event.type === "add_to_cart" || event.type === "begin_checkout") product.carts += 1;
        if (event.type === "order_submit") product.orders += 1;
        productMap.set(event.productName, product);
      }
    });

    const uniqueVisitors = new Set(scopedEvents.map((event) => event.visitorId)).size;
    const productViews = scopedEvents.filter((event) => event.type === "product_view").length;
    const carts = scopedEvents.filter((event) => event.type === "add_to_cart").length;
    const checkouts = scopedEvents.filter((event) => event.type === "begin_checkout").length;
    const orderSubmits = scopedEvents.filter((event) => event.type === "order_submit").length;

    return {
      isDemo: false,
      trend: Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => ({
          label: value.label,
          visitors: value.visitors.size,
          orders: value.orders
        })),
      sources: Array.from(sourceMap.values())
        .map((source) => ({
          source: source.source,
          visitors: source.visitors.size,
          productViews: source.productViews,
          carts: source.carts,
          orders: source.orders,
          revenue: source.revenue,
          spend: adSpend[source.source] ?? 0
        }))
        .sort((a, b) => b.visitors - a.visitors),
      funnel: [
        { label: "访问人数", value: uniqueVisitors },
        { label: "商品浏览", value: productViews },
        { label: "加入购物车", value: carts },
        { label: "开始结账", value: checkouts },
        { label: "提交订单", value: orderSubmits }
      ],
      popularProducts: Array.from(productMap.values())
        .sort((a, b) => b.views + b.carts - (a.views + a.carts))
        .slice(0, 5)
    };
  }, [adSpend, analyticsEvents, dateRange]);

  const maxFunnelValue = Math.max(...analytics.funnel.map((item) => item.value), 1);
  const maxTrendVisitors = Math.max(...analytics.trend.map((item) => item.visitors), 1);
  const visibleReviews = reviews.filter((review) => !review.deleted);
  const filteredEmailNotifications = emailNotifications.filter((notification) =>
    notificationStatusFilter === "all" ? true : notification.status === notificationStatusFilter
  );
  const queuedEmailNotifications = emailNotifications.filter((notification) => notification.status === "queued");
  const failedEmailNotifications = emailNotifications.filter((notification) => notification.status === "failed");

  const openSupportThreads = supportThreads.filter((thread) => thread.status === "open");
  const needsReplySupportThreads = openSupportThreads.filter((thread) => thread.messages.at(-1)?.sender === "customer");
  const closedSupportThreads = supportThreads.filter((thread) => thread.status === "closed");
  const launchSupabaseConnected = readinessMode === "supabase" || Boolean(readiness);
  const launchPendingOrderCount = readiness?.pendingOrders ?? pendingOrders.length;
  const launchLowStockCount = readiness?.lowStockProducts ?? lowStock.length;
  const launchNeedsReplyCount = readiness?.needsReplySupportThreads ?? needsReplySupportThreads.length;
  const launchChecks = [
    {
      label: "买家测试账号",
      value: `${readiness?.customerProfiles ?? 0} 个`,
      tone: (readiness?.customerProfiles ?? 0) > 0 ? "ready" : "paused",
      detail: (readiness?.customerProfiles ?? 0) > 0
        ? "可以继续验证买家订单隔离和会员资料。"
        : "生产环境默认关闭测试账号创建；需要时临时开启专用环境变量。"
    },
    {
      label: "商家账号",
      value: `${readiness?.merchantProfiles ?? 0} 个`,
      tone: (readiness?.merchantProfiles ?? 0) > 0 ? "ready" : "warning",
      detail: (readiness?.merchantProfiles ?? 0) > 0 ? "已有商家账号，可以验证后台权限。" : "需要至少一个 owner 或 service 角色账号。"
    },
    {
      label: "客户订单隔离",
      value: readiness?.customerOrdersProtected ? "已保护" : "需确认",
      tone: readiness?.customerOrdersProtected ? "ready" : "warning",
      detail: readiness?.customerOrdersProtected ? "买家订单接口要求登录，并按当前买家账号读取。" : "需要确认买家订单接口不会暴露其他客户数据。"
    },
    {
      label: "商家后台保护",
      value: readiness?.adminApisProtected ? "已保护" : "需确认",
      tone: readiness?.adminApisProtected ? "ready" : "warning",
      detail: readiness?.adminApisProtected ? "商家接口要求 owner 或 service 角色，买家不能进入后台。" : "需要确认后台接口没有公开访问。"
    },
    {
      label: "Supabase 连接",
      value: launchSupabaseConnected ? "已连接" : "需确认",
      tone: launchSupabaseConnected ? "ready" : "warning",
      detail: launchSupabaseConnected ? "上线检查、订单、库存、客服和操作日志正在读取 Supabase。" : "暂时无法读取 Supabase 上线检查数据，请刷新后重试。"
    },
    {
      label: "政策页面",
      value: "已添加",
      tone: "ready",
      detail: "配送、退换、隐私、条款和 FAQ 页面已加入页脚和 sitemap。"
    },
    {
      label: "Supabase 密码保护",
      value: "需在控制台开启",
      tone: "paused",
      detail: "安全 advisor 只剩泄露密码保护未开启，需要在 Supabase Auth 设置中打开。"
    },
    {
      label: "待确认付款订单",
      value: `${launchPendingOrderCount} 单`,
      tone: launchPendingOrderCount === 0 ? "ready" : "warning",
      detail: launchPendingOrderCount === 0 ? "没有积压的待确认付款订单。" : "上线前请确认这些订单是否已付款或需要取消。"
    },
    {
      label: "低库存 SKU",
      value: `${launchLowStockCount} 个`,
      tone: launchLowStockCount === 0 ? "ready" : "warning",
      detail: launchLowStockCount === 0 ? "当前没有低库存提醒。" : "需要检查库存数量，避免广告引流后售空。"
    },
    {
      label: "客服待回复",
      value: `${launchNeedsReplyCount} 条`,
      tone: launchNeedsReplyCount === 0 ? "ready" : "warning",
      detail: launchNeedsReplyCount === 0 ? "当前没有待回复客户会话。" : "上线前建议先回复客户咨询。"
    },
    {
      label: "邮件通知队列",
      value: failedEmailNotifications.length > 0 ? `${failedEmailNotifications.length} 条失败` : `${queuedEmailNotifications.length} 条待发`,
      tone: failedEmailNotifications.length === 0 ? "ready" : "warning",
      detail: failedEmailNotifications.length === 0 ? "没有失败邮件，后续接入邮件服务商后可发送队列。" : "存在失败邮件，请检查通知内容或邮件服务。"
    },
    {
      label: "真实邮件服务",
      value: readiness?.emailProviderConfigured ? "已配置" : "未配置",
      tone: readiness?.emailProviderConfigured ? "ready" : "paused",
      detail: readiness?.emailProviderConfigured ? "已检测到邮件服务环境变量。" : "当前只保存邮件队列，正式上线前需要配置发件服务。"
    },
    {
      label: "支付开关",
      value: "人工确认",
      tone: "paused",
      detail: "Stripe 和欧洲银行账户准备好之前，订单继续进入待确认付款流程。"
    }
  ];
  const filteredSupportThreads = supportThreads.filter((thread) => {
    if (supportFilter === "needs_reply") return thread.status === "open" && thread.messages.at(-1)?.sender === "customer";
    if (supportFilter === "open") return thread.status === "open";
    if (supportFilter === "closed") return thread.status === "closed";
    return true;
  });
  const reviewStyles = Array.from(new Set(reviews.map((review) => review.styleId))).map((styleId) => {
    const styleReviews = visibleReviewsForStyle(reviews, styleId);
    return {
      styleId,
      reviews: styleReviews,
      rating: averageRating(styleReviews),
      product: products.find((product) => product.styleId === styleId)
    };
  });

  if (adminAccess === "checking") {
    return (
      <main className="admin-locked">
        <section className="panel">
          <p className="eyebrow">BoxSofa Admin</p>
          <h1>Checking merchant access</h1>
          <p>Please wait while we confirm the current account permission.</p>
        </section>
      </main>
    );
  }

  if (adminAccess === "denied") {
    return (
      <main className="admin-locked">
        <section className="panel">
          <p className="eyebrow">BoxSofa Admin</p>
          <h1>需要商家登录</h1>
          <p>{adminAccessMessage || "请先使用 Supabase 商家账号登录，再管理订单、商品、评价和客服聊天。"}</p>
          <p className="login-note">商家测试账号：owner@boxsofa.eu</p>
          <div className="admin-locked-actions">
            <Link className="button primary" href="/login">
              重新登录
            </Link>
            <Link className="button" href="/">
              返回前台
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <aside className="admin-nav">
        <Link className="brand" href="/">
          BoxSofa Admin
        </Link>
        {adminSections.map((section) => (
          <button
            className={`button ${activeSection === section.id ? "primary" : ""}`}
            key={section.id}
            type="button"
            onClick={() => openSection(section.id)}
          >
            {section.label}
          </button>
        ))}
        <Link className="button" href="/">
          返回前台
        </Link>
      </aside>

      <section className="admin-main">
        <div className="admin-title">
          <div>
            <p className="eyebrow">BoxSofa 运营后台</p>
            <h1>商家工作台</h1>
          </div>
          <div className="role-switch">
            <span>当前角色</span>
            <strong>老板 / 客服 / 仓库</strong>
          </div>
        </div>

        <section className="admin-stat-grid" hidden={activeSection !== "dashboard"} id="dashboard">
          <div className="stat-card">
            <span>已确认销售额</span>
            <strong>{money(confirmedRevenue)}</strong>
          </div>
          <div className="stat-card">
            <span>待确认付款订单</span>
            <strong>{pendingOrders.length}</strong>
          </div>
          <div className="stat-card">
            <span>已发货订单</span>
            <strong>{shippedOrders.length}</strong>
          </div>
          <div className="stat-card">
            <span>会员客户</span>
            <strong>{customers.filter((customer) => customer.member).length}</strong>
          </div>
          <div className="stat-card">
            <span>客户评价</span>
            <strong>{visibleReviews.length}</strong>
          </div>
          <div className="stat-card">
            <span>待回复客服</span>
            <strong>{openSupportThreads.length}</strong>
          </div>
        </section>

        <section className="panel" hidden={activeSection !== "launch"} id="launch">
          <div className="panel-head">
            <div>
              <h2>上线检查</h2>
              <p>支付开通前先把真实落库、订单处理、库存、客服和通知队列跑稳；通过后再进入 SEO、域名和支付。</p>
            </div>
            <button className="button" type="button" onClick={() => void loadReadiness()}>
              刷新检查
            </button>
          </div>
          {readinessMessage ? <p className="admin-sync-note">{readinessMessage}</p> : null}

          <div className="launch-readiness-grid">
            {launchChecks.map((check) => (
              <article className={`launch-check ${check.tone}`} key={check.label}>
                <span>{check.label}</span>
                <strong>{check.value}</strong>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>

          <div className="launch-test-account">
            <div>
              <h3>买家测试账号</h3>
              <p>{testCustomerCreationEnabled ? "用于验证买家登录后只能查看自己的订单、地址、会员状态，不能进入商家后台。" : "生产环境已关闭自动创建测试账号，避免上线后误生成测试数据。"}</p>
            </div>
            <button className="button primary" disabled={!testCustomerCreationEnabled || testCustomerStatus === "saving"} type="button" onClick={() => void createTestCustomer()}>
              {!testCustomerCreationEnabled ? "测试账号创建已关闭" : testCustomerStatus === "saving" ? "创建中..." : "创建买家测试账号"}
            </button>
            {testCustomerCredentials ? (
              <div className={`launch-test-result ${testCustomerStatus === "error" ? "error" : ""}`}>
                <strong>{testCustomerCredentials.message}</strong>
                {testCustomerCredentials.email ? <span>邮箱：{testCustomerCredentials.email}</span> : null}
                {testCustomerCredentials.password ? <span>临时密码：{testCustomerCredentials.password}</span> : null}
                {!testCustomerCredentials.password && testCustomerCredentials.email ? <span>如果需要密码，请在 Supabase Auth 里重置。</span> : null}
              </div>
            ) : null}
          </div>

          <div className="launch-next-steps">
            <h3>下一步顺序</h3>
            <ol>
              <li>用正式买家账号或临时测试账号验证订单隔离，确认买家只能看到自己的订单和资料。</li>
              <li>确认商家账号可管理订单、商品、库存、评价、客服和邮件通知。</li>
              <li>清理全站乱码文案，再做 SEO 标题、描述、站点地图和 Google Search Console。</li>
              <li>绑定正式域名和 Vercel 环境变量，完成上线前最终检查。</li>
              <li>最后接入 Stripe 支付和真实邮件发送服务。</li>
            </ol>
            <p className="admin-sync-note">本地检查命令：npm run prelaunch</p>
          </div>
        </section>

        <section className="panel" hidden={activeSection !== "traffic"} id="traffic">
          <div className="panel-head">
            <div>
              <h2>流量与转化数据罗盘</h2>
              <p>追踪 TikTok、Instagram、Facebook、YouTube、X、Google 等渠道带来的访问和下单转化。</p>
            </div>
            <span className="status">{analytics.isDemo ? "示例数据" : "本地真实记录"}</span>
          </div>

          <div className="admin-toolbar">
            <label>
              时间范围
              <select value={dateRange} onChange={(event) => setDateRange(event.target.value as DateRange)}>
                <option value="today">今天</option>
                <option value="7d">近 7 天</option>
                <option value="30d">近 30 天</option>
                <option value="all">全部</option>
              </select>
            </label>
            <div className="privacy-mini">
              <strong>合规状态</strong>
              <span>访客同意统计后才记录匿名事件；广告平台像素后续也走同意开关。</span>
            </div>
          </div>

          <div className="traffic-summary">
            <article className="stat-card">
              <span>访问来源</span>
              <strong>{analytics.sources.length}</strong>
            </article>
            <article className="stat-card">
              <span>访客</span>
              <strong>{analytics.funnel[0]?.value ?? 0}</strong>
            </article>
            <article className="stat-card">
              <span>提交订单</span>
              <strong>{analytics.funnel[4]?.value ?? 0}</strong>
            </article>
            <article className="stat-card">
              <span>总体转化率</span>
              <strong>{percent(((analytics.funnel[4]?.value ?? 0) / Math.max(analytics.funnel[0]?.value ?? 0, 1)) * 100)}</strong>
            </article>
          </div>

          <div className="traffic-grid">
            <div className="analytics-card">
              <h3>访问与订单趋势</h3>
              <div className="trend-chart">
                {analytics.trend.map((item) => (
                  <div className="trend-bar" key={item.label}>
                    <div>
                      <span style={{ height: `${Math.max(8, (item.visitors / maxTrendVisitors) * 100)}%` }} />
                    </div>
                    <strong>{item.label}</strong>
                    <small>{item.visitors} / {item.orders}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-card">
              <h3>转化漏斗</h3>
              <div className="funnel-list">
                {analytics.funnel.map((step) => (
                  <div className="funnel-row" key={step.label}>
                    <div>
                      <strong>{step.label}</strong>
                      <span>{step.value}</span>
                    </div>
                    <div className="funnel-track">
                      <span style={{ width: `${(step.value / maxFunnelValue) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-card">
              <h3>平台来源、转化率与 ROI</h3>
              <div className="source-list">
                {analytics.sources.map((source) => (
                  <article className="source-row" key={source.source}>
                    <div>
                      <strong>{labelSource(source.source)}</strong>
                      <span>
                        访客 {source.visitors} / 商品浏览 {source.productViews} / 加购 {source.carts}
                      </span>
                    </div>
                    <div>
                      <strong>{percent((source.orders / Math.max(source.visitors, 1)) * 100)}</strong>
                      <span>
                        {money(source.revenue)} / ROAS{" "}
                        {((source.revenue / Math.max(adSpend[source.source] ?? source.spend ?? 0, 1))).toFixed(1)}
                      </span>
                    </div>
                    <label className="ad-spend-field">
                      广告花费
                      <input
                        min={0}
                        type="number"
                        value={adSpend[source.source] ?? source.spend ?? 0}
                        onChange={(event) => saveAdSpend(source.source, Number(event.target.value))}
                      />
                    </label>
                  </article>
                ))}
              </div>
            </div>

            <div className="analytics-card">
              <h3>商品转化排行</h3>
              <div className="source-list">
                {analytics.popularProducts.map((product) => (
                  <article className="source-row" key={product.name}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>
                        浏览 {product.views} / 加购 {product.carts} / 加购率{" "}
                        {percent((product.carts / Math.max(product.views, 1)) * 100)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="analytics-card">
              <h3>广告链接规则</h3>
              <div className="utm-list">
                <code>https://boxsofa.eu/category/all?utm_source=tiktok&utm_medium=social&utm_campaign=launch</code>
                <code>https://boxsofa.eu/category/all?utm_source=instagram&utm_medium=social&utm_campaign=launch</code>
                <code>https://boxsofa.eu/category/all?utm_source=facebook&utm_medium=social&utm_campaign=launch</code>
                <code>https://boxsofa.eu/category/all?utm_source=youtube&utm_medium=video&utm_campaign=launch</code>
              </div>
              <p>上线后每个平台都用独立 UTM 链接，后台就能分清流量来自哪里。</p>
            </div>
          </div>

          <div className="privacy-note">
            <strong>GDPR 处理方式</strong>
            <p>
              当前原型只在用户点击“同意统计”后记录匿名事件。后续接 GA4、TikTok Pixel、Meta Pixel、YouTube/Google Ads
              时，也会放在这个同意开关之后加载。
            </p>
          </div>
        </section>

        <section className="panel" hidden={activeSection !== "orders"} id="orders">
          <div className="panel-head">
            <h2>订单筛选与物流</h2>
            <span className="status">{orderSource}</span>
          </div>
          {orderSyncMessage ? <p className="admin-sync-note">{orderSyncMessage}</p> : null}
          <div className="admin-toolbar">
            <label>
              订单状态
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderStatusFilter)}>
                <option value="all">全部订单</option>
                <option value="pending_confirm">待确认付款</option>
                <option value="paid_confirmed">已确认付款</option>
                <option value="shipped">已发货</option>
                <option value="cancelled">已取消</option>
              </select>
            </label>
            <label>
              搜索订单 / 客户 / 物流
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索订单号、客户姓名、电话或邮箱"
              />
            </label>
          </div>
          {filteredOrders.length === 0 ? (
            <div className="empty-state">
              <strong>暂无匹配订单</strong>
              <p>当前筛选下没有订单，当前数据来源：{orderSource}。</p>
            </div>
          ) : (
            <div className="admin-order-list">
              {filteredOrders.map((order) => {
                const actionStatus = orderActionStatus[order.id] ?? "idle";
                const plannedEmailEvent = plannedOrderEmailEvent(order);
                const plannedEmailPreview = plannedEmailEvent ? buildOrderEmailPreview(plannedEmailEvent, orderEmailInput(order)) : null;
                const latestEmailPreview = orderEmailPreviews[order.id];
                return (
                <article className="admin-order-card" key={order.id}>
                  <div className="admin-order-head">
                    <div>
                      <strong>{order.id}</strong>
                      <p>{new Date(order.createdAt).toLocaleString("zh-CN")}</p>
                    </div>
                    <div className="order-status-stack">
                      <span className={`order-status ${order.status}`}>{statusText(order.status)}</span>
                      {actionStatus === "saving" ? <span className="product-state changed">保存中</span> : null}
                      {actionStatus === "saved" ? <span className="product-state active">已同步</span> : null}
                      {actionStatus === "error" ? <span className="product-state hidden">同步失败</span> : null}
                    </div>
                  </div>
                  <div className="admin-order-grid">
                    <div>
                      <span>客户</span>
                      <strong>{order.customerName}</strong>
                      <p>{order.phone}</p>
                      <p>{order.email}</p>
                      <p>{order.address}</p>
                    </div>
                    <div>
                      <span>商品</span>
                      {order.items.map((item) => (
                        <p key={item.id}>
                          {item.name} x {item.quantity}
                        </p>
                      ))}
                    </div>
                    <div>
                      <span>金额</span>
                      <strong>{money(order.totalEur)}</strong>
                      <p>商品 {money(order.subtotalEur)} / 配送 {money(order.shippingEur)}</p>
                    </div>
                    <div className="shipment-fields">
                      <label>
                        物流公司
                        <input
                          value={order.carrier ?? ""}
                          onChange={(event) => updateOrder(order.id, { carrier: event.target.value })}
                          placeholder="例如 DHL / UPS"
                        />
                      </label>
                      <label>
                        物流单号
                        <input
                          value={order.trackingNumber ?? ""}
                          onChange={(event) => updateOrder(order.id, { trackingNumber: event.target.value })}
                          placeholder="录入后客户后台可查看"
                        />
                      </label>
                    </div>
                  </div>
                    <div className="order-note-fields">
                      <label>
                        付款备注
                        <textarea
                          rows={3}
                          value={order.paymentMethodNote ?? ""}
                          onChange={(event) => updateOrder(order.id, { paymentMethodNote: event.target.value })}
                          placeholder="例如银行转账、Wise、PayPal、已发送付款链接"
                        />
                      </label>
                      <label>
                        内部备注
                        <textarea
                          rows={3}
                          value={order.internalNote ?? ""}
                          onChange={(event) => updateOrder(order.id, { internalNote: event.target.value })}
                          placeholder="记录客户沟通、取消原因、物流备注，仅商家后台可见"
                        />
                      </label>
                    </div>
                  <div className="admin-email-preview-grid">
                    {plannedEmailPreview ? (
                      <div className="admin-email-preview">
                        <span>Next notification preview</span>
                        <strong>{plannedEmailPreview.subject}</strong>
                        <p>{plannedEmailPreview.previewText}</p>
                        <details>
                          <summary>View email body</summary>
                          <pre>{plannedEmailPreview.bodyText}</pre>
                        </details>
                      </div>
                    ) : null}
                    {latestEmailPreview ? (
                      <div className="admin-email-preview sent-preview">
                        <span>Latest server preview</span>
                        <strong>{latestEmailPreview.subject}</strong>
                        <p>{latestEmailPreview.previewText}</p>
                        <details>
                          <summary>View email body</summary>
                          <pre>{latestEmailPreview.bodyText}</pre>
                        </details>
                      </div>
                    ) : null}
                  </div>
                  <div className="admin-actions">
                    <button
                      className="button primary"
                      disabled={order.status !== "pending_confirm" || actionStatus === "saving"}
                      type="button"
                      onClick={() => confirmPayment(order)}
                    >
                      确认付款
                    </button>
                    <button
                      className="button"
                      disabled={!order.trackingNumber || order.status === "cancelled" || actionStatus === "saving"}
                      type="button"
                      onClick={() => saveShipment(order)}
                    >
                      保存物流
                    </button>
                    <button
                      className="button"
                      disabled={actionStatus === "saving"}
                      type="button"
                      onClick={() => saveOrderNotes(order)}
                    >
                      保存备注
                    </button>
                    <button
                      className="button"
                      disabled={!order.trackingNumber || order.status === "pending_confirm" || order.status === "cancelled" || actionStatus === "saving"}
                      type="button"
                      onClick={() => markShipped(order)}
                    >
                      标记已发货
                    </button>
                    <button
                      className="button danger"
                      disabled={order.status !== "pending_confirm" || actionStatus === "saving"}
                      type="button"
                      onClick={() => cancelOrder(order)}
                    >
                      取消订单
                    </button>
                    <Link className="button" href={`/orders`}>
                      客户视角
                    </Link>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-grid-two">
          <div className="panel" hidden={activeSection !== "products"} id="products">
            <div className="panel-head">
              <div>
                <h2>商品运营台</h2>
                <p>价格、库存和上下架状态已接入 Supabase。修改后先形成待保存草稿，确认无误后再写入数据库。</p>
              </div>
              <span className="status">{filteredProducts.length} / {products.length} 个 SKU</span>
            </div>
            {productSyncMessage ? <p className="admin-sync-note">{productSyncMessage}</p> : null}
            <div className="product-ops-summary">
              <article className="mini-card">
                <span>低库存</span>
                <strong>{lowStock.length}</strong>
              </article>
              <article className="mini-card">
                <span>已修改</span>
                <strong>{changedProducts.length}</strong>
              </article>
              <article className="mini-card">
                <span>已隐藏</span>
                <strong>{hiddenProducts.length}</strong>
              </article>
            </div>
            <div className="admin-toolbar product-toolbar">
              <label>
                商品 / SKU / 颜色
                <input
                  value={productKeyword}
                  onChange={(event) => setProductKeyword(event.target.value)}
                  placeholder="输入款式、SKU、颜色或链接名"
                />
              </label>
              <label>
                商品状态
                <select value={productFilter} onChange={(event) => setProductFilter(event.target.value as ProductFilter)}>
                  <option value="all">全部商品</option>
                  <option value="low">低库存</option>
                  <option value="changed">有本地修改</option>
                  <option value="hidden">已下架</option>
                </select>
              </label>
              <button className="button" type="button" onClick={resetProductDrafts}>
                清空本地草稿
              </button>
              <button className="button" type="button" onClick={() => void loadProductDrafts()}>
                刷新数据库
              </button>
            </div>
            <div className="stock-list">
              {filteredProducts.map((product) => {
                const draft = resolvedProductDraft(product);
                const changed = isProductChanged(product);
                const saveStatus = productSaveStatus[product.id] ?? "idle";
                return (
                  <article className="stock-row product-edit-row" key={product.id}>
                    <img src={product.mainImage} alt={product.name} />
                    <div>
                      <div className="product-edit-title">
                        <strong>{product.name}</strong>
                        <span className={`product-state ${draft.active ? "active" : "hidden"}`}>
                          {draft.active ? "上架中" : "已下架"}
                        </span>
                        {changed ? <span className="product-state changed">待保存</span> : null}
                        {saveStatus === "saving" ? <span className="product-state changed">保存中</span> : null}
                        {saveStatus === "saved" ? <span className="product-state active">已保存</span> : null}
                        {saveStatus === "error" ? <span className="product-state hidden">保存失败</span> : null}
                      </div>
                      <p>{product.sku} / {product.color}</p>
                      <p>{product.dimensions} / 包装 {product.packageDimensions} / {product.weightKg} KG</p>
                      <p>已预占 {draft.reservedStock} 件 / 可售 {draft.availableStock} 件</p>
                    </div>
                    <label>
                      库存
                      <input
                        min={0}
                        type="number"
                        value={draft.stock}
                        onChange={(event) => {
                          const nextStock = Math.max(draft.reservedStock, Number(event.target.value));
                          saveProductDraft(product.id, { stock: nextStock });
                        }}
                      />
                    </label>
                    <label>
                      售价
                      <input
                        min={0}
                        type="number"
                        value={draft.priceEur}
                        onChange={(event) => saveProductDraft(product.id, { priceEur: Number(event.target.value) })}
                      />
                    </label>
                    <label className="product-active-toggle">
                      <input
                        checked={draft.active}
                        type="checkbox"
                        onChange={(event) => saveProductDraft(product.id, { active: event.target.checked })}
                      />
                      上架
                    </label>
                    <button
                      className="button primary"
                      disabled={saveStatus === "saving" || !changed}
                      type="button"
                      onClick={() => void syncProductDraft(product.id, draft)}
                    >
                      {saveStatus === "saving" ? "保存中" : "保存"}
                    </button>
                    <Link className="button" href={`/product/${product.slug}`}>
                      查看
                    </Link>
                  </article>
                );
              })}
              {filteredProducts.length === 0 ? (
                <div className="empty-state">
                  <strong>没有匹配的商品</strong>
                  <p>可以换一个关键词，或者切回全部商品查看完整 SKU 列表。</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel" hidden={activeSection !== "reviews"} id="reviews">
            <div className="panel-head">
              <div>
                <h2>客户评价管理</h2>
                <p>真实数据库评价可置顶或删除；示例好评仅用于前台展示，不参与后台操作。</p>
              </div>
              <span className="status">{visibleReviews.length} 条</span>
            </div>
            {reviewSyncMessage ? <p className="admin-sync-note">{reviewSyncMessage}</p> : null}
            {reviewStyles.length === 0 ? (
              <div className="empty-state">
                <strong>暂无评价</strong>
                <p>客户评价会按款式聚合展示，后续接数据库后可改为真实买家评价。</p>
              </div>
            ) : (
              <div className="admin-review-groups">
                {reviewStyles.map((group) => (
                  <article className="admin-review-group" key={group.styleId}>
                    <div className="admin-review-style">
                      {group.product?.mainImage ? <img src={group.product.mainImage} alt={group.styleId} /> : null}
                      <div>
                        <strong>{group.styleId}</strong>
                        <p>平均评分 {group.rating ? group.rating.toFixed(1) : "暂无"} / 5，共 {group.reviews.length} 条可见评价</p>
                      </div>
                      {group.product ? (
                        <Link className="button" href={`/product/${group.product.slug}`}>
                          查看前台
                        </Link>
                      ) : null}
                    </div>
                    <div className="admin-review-list">
                      {group.reviews.map((review) => (
                        <div className="admin-review-card" key={review.id}>
                          <div>
                            <strong>{review.customerName}</strong>
                            <span className="status">{review.source === "supabase" ? "数据库评价" : "示例评价"}</span>
                            <span>{review.country} / {review.rating} 星 / {new Date(review.createdAt).toLocaleDateString("zh-CN")}</span>
                            <p>{review.comment}</p>
                          </div>
                          <div className="admin-actions">
                            <button
                              className={`button ${review.pinned ? "primary" : ""}`}
                              disabled={review.source !== "supabase"}
                              type="button"
                              onClick={() => updateSupabaseReview(review.id, { pinned: !review.pinned })}
                            >
                              {review.pinned ? "取消置顶" : "置顶"}
                            </button>
                            <button
                              className="button danger"
                              disabled={review.source !== "supabase"}
                              type="button"
                              onClick={() => updateSupabaseReview(review.id, { deleted: true })}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="panel" hidden={activeSection !== "customers"} id="customers">
            <div className="panel-head">
              <h2>客户会员状态</h2>
              <span className="status">满 EUR 300 自动会员</span>
            </div>
            {customers.length === 0 ? (
              <div className="empty-state">
                <strong>暂无客户</strong>
                <p>客户提交订单后，会自动出现在这里。未确认付款的订单不会计入会员累计消费。</p>
              </div>
            ) : (
              <div className="customer-list">
                {customers.map((customer) => (
                  <article className="mini-card" key={customer.email || customer.phone || customer.name}>
                    <div className="customer-card-head">
                      <strong>{customer.name}</strong>
                      <span className={`member-badge ${customer.member ? "active" : ""}`}>
                        {customer.member ? "会员 9 折" : "普通客户"}
                      </span>
                    </div>
                    <span>{customer.email || customer.phone}</span>
                    <p>订单 {customer.orders} 笔 / 已确认 {money(customer.spent)} / 待确认 {money(customer.pending)}</p>
                    <div className="progress-track" aria-label={`会员进度 ${Math.min(100, (customer.spent / 300) * 100)}%`}>
                      <span style={{ width: `${Math.min(100, (customer.spent / 300) * 100)}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="admin-grid-two">
          <div className="panel" hidden={activeSection !== "stock"} id="stock">
            <div className="panel-head">
              <h2>低库存提醒</h2>
              <span className="status">{lowStock.length} 个 SKU</span>
            </div>
            {lowStock.length === 0 ? (
              <div className="empty-state">
                <strong>库存正常</strong>
                <p>库存小于等于 10 时会出现在这里，方便补货。</p>
              </div>
            ) : (
              <div className="customer-list">
                {lowStock.map((product) => (
                  <article className="mini-card" key={product.id}>
                    <strong>{product.name}</strong>
                    <span>{product.sku}</span>
                    <p>当前库存：{productDrafts[product.id]?.stock ?? product.stock}</p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="panel" hidden={activeSection !== "audit"} id="audit">
            <div className="panel-head">
              <div>
                <h2>操作日志</h2>
                <p>记录商家后台的订单、商品和评价关键修改，方便追踪责任和复盘问题。</p>
              </div>
              <button className="button" type="button" onClick={() => void loadAuditLogs()}>
                刷新
              </button>
            </div>
            {auditSyncMessage ? <p className="admin-sync-note">{auditSyncMessage}</p> : null}
            {auditLogs.length === 0 ? (
              <div className="empty-state">
                <strong>暂无操作日志</strong>
                <p>连接 Supabase 后，确认付款、录入物流、修改库存价格、管理评价都会显示在这里。</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>动作</th>
                      <th>对象</th>
                      <th>操作人</th>
                      <th>修改内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.created_at).toLocaleString("zh-CN")}</td>
                        <td>{log.action}</td>
                        <td>
                          {log.entity_type}
                          {log.entity_id ? <span> / {log.entity_id.slice(0, 8)}</span> : null}
                        </td>
                        <td>{log.actor_id ? log.actor_id.slice(0, 8) : "system"}</td>
                        <td>
                          <code>{JSON.stringify(log.after_data ?? {}).slice(0, 180)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel" hidden={activeSection !== "notifications"} id="notifications">
            <div className="panel-head">
              <div>
                <h2>Email notification queue</h2>
                <p>Review order emails before we connect the real sending provider. New orders and order status changes are saved here first.</p>
              </div>
              <button className="button" type="button" onClick={() => void loadEmailNotifications()}>
                Refresh
              </button>
            </div>
            {notificationSyncMessage ? <p className="admin-sync-note">{notificationSyncMessage}</p> : null}
            <div className="admin-mini-stats">
              <article>
                <span>Queued</span>
                <strong>{queuedEmailNotifications.length}</strong>
              </article>
              <article>
                <span>Failed</span>
                <strong>{failedEmailNotifications.length}</strong>
              </article>
              <article>
                <span>Total</span>
                <strong>{emailNotifications.length}</strong>
              </article>
            </div>
            <div className="admin-toolbar compact-toolbar">
              <label>
                Status
                <select value={notificationStatusFilter} onChange={(event) => setNotificationStatusFilter(event.target.value as NotificationStatusFilter)}>
                  <option value="all">All</option>
                  <option value="queued">Queued</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                  <option value="skipped">Skipped</option>
                </select>
              </label>
            </div>
            {filteredEmailNotifications.length === 0 ? (
              <div className="empty-state">
                <strong>No email notifications yet</strong>
                <p>After a customer submits an order or an admin confirms payment, ships, or cancels an order, the email preview will appear here.</p>
              </div>
            ) : (
              <div className="notification-list">
                {filteredEmailNotifications.map((notification) => {
                  const notificationAction = notificationActionStatus[notification.id] ?? "idle";
                  return (
                  <article className="notification-card" key={notification.id}>
                    <div className="notification-card-head">
                      <div>
                        <span className={`notification-status ${notification.status}`}>{notification.status}</span>
                        <strong>{notification.subject}</strong>
                        <p>{notification.preview_text}</p>
                      </div>
                      <div className="notification-meta">
                        <span>{new Date(notification.created_at).toLocaleString("zh-CN")}</span>
                        <span>{notification.event}</span>
                      </div>
                    </div>
                    <div className="notification-grid">
                      <div>
                        <span>Order</span>
                        <strong>{notification.order_number}</strong>
                      </div>
                      <div>
                        <span>Customer</span>
                        <strong>{notification.customer_email}</strong>
                      </div>
                      <div>
                        <span>Provider</span>
                        <strong>{notification.provider}</strong>
                      </div>
                      <div>
                        <span>Attempts</span>
                        <strong>{notification.attempts}</strong>
                      </div>
                    </div>
                    {notification.last_error ? <p className="notification-error">{notification.last_error}</p> : null}
                    <div className="notification-actions">
                      <button
                        className="button primary"
                        type="button"
                        disabled={notification.status === "sent" || notification.status === "skipped" || notificationAction === "saving"}
                        onClick={() => void updateEmailNotification(notification.id, "send")}
                      >
                        Send now
                      </button>
                      <button
                        className="button"
                        type="button"
                        disabled={notification.status === "queued" || notificationAction === "saving"}
                        onClick={() => void updateEmailNotification(notification.id, "requeue")}
                      >
                        Requeue
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={notification.status === "skipped" || notificationAction === "saving"}
                        onClick={() => void updateEmailNotification(notification.id, "skip")}
                      >
                        Mark skipped
                      </button>
                      {notificationAction === "saving" ? <span>Saving...</span> : null}
                      {notificationAction === "saved" ? <span>Saved</span> : null}
                      {notificationAction === "error" ? <span>Update failed</span> : null}
                    </div>
                    <details className="notification-body">
                      <summary>View email body</summary>
                      <pre>{notification.body_text}</pre>
                    </details>
                  </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel" hidden={activeSection !== "support"} id="support">
            <div className="panel-head">
              <div>
                <h2>客服聊天工作台</h2>
                <p>客服会话已接入 Supabase，可查看客户留言、快捷回复、关闭会话并保留历史记录。</p>
              </div>
              <span className="status">{needsReplySupportThreads.length} 个待回复</span>
            </div>
            {supportSyncMessage ? <p className="admin-sync-note">{supportSyncMessage}</p> : null}
            {supportThreads.length === 0 ? (
              <div className="empty-state">
                <strong>暂无客户留言</strong>
                <p>客户点击前台右下角在线客服并提交问题后，会话会出现在这里。</p>
              </div>
            ) : (
              <div className="support-workbench">
                <div className="support-workbench-summary">
                  <article>
                    <span>待回复</span>
                    <strong>{needsReplySupportThreads.length}</strong>
                  </article>
                  <article>
                    <span>进行中</span>
                    <strong>{openSupportThreads.length}</strong>
                  </article>
                  <article>
                    <span>已关闭</span>
                    <strong>{closedSupportThreads.length}</strong>
                  </article>
                </div>

                <div className="support-filter-bar" aria-label="客服会话筛选">
                  {[
                    { id: "needs_reply", label: "待回复", count: needsReplySupportThreads.length },
                    { id: "open", label: "进行中", count: openSupportThreads.length },
                    { id: "closed", label: "已关闭", count: closedSupportThreads.length },
                    { id: "all", label: "全部", count: supportThreads.length }
                  ].map((filter) => (
                    <button
                      className={supportFilter === filter.id ? "active" : ""}
                      key={filter.id}
                      type="button"
                      onClick={() => setSupportFilter(filter.id as SupportFilter)}
                    >
                      {filter.label}
                      <span>{filter.count}</span>
                    </button>
                  ))}
                </div>

                <div className="support-thread-list">
                  {filteredSupportThreads.length === 0 ? (
                    <div className="empty-state">
                      <strong>当前没有客服会话</strong>
                      <p>客户在前台发起在线咨询后，会显示在这里。</p>
                    </div>
                  ) : null}
                  {filteredSupportThreads.map((thread) => {
                    const lastMessage = thread.messages.at(-1);
                    const needsReply = thread.status === "open" && lastMessage?.sender === "customer";
                    return (
                      <article className={`support-thread-card ${thread.status} ${needsReply ? "needs-reply" : ""}`} key={thread.id}>
                        <div className="support-thread-head">
                          <div>
                            <strong>{thread.customerName}</strong>
                            <span>{thread.customerEmail || "未填写邮箱"}</span>
                          </div>
                          <span className="status">{thread.status === "closed" ? "已关闭" : needsReply ? "客户待回复" : "已回复"}</span>
                        </div>

                        <div className="support-thread-meta">
                          <span>更新时间：{new Date(thread.updatedAt).toLocaleString()}</span>
                          {lastMessage ? <span>最后消息：{lastMessage.sender === "customer" ? "客户" : "客服"}</span> : null}
                        </div>

                        <div className="admin-support-messages">
                          {thread.messages.map((message) => (
                            <div className={`admin-support-message ${message.sender}`} key={message.id}>
                              <span>{message.sender === "customer" ? "客户" : "客服"}</span>
                              <p>{message.body}</p>
                              <small>{new Date(message.createdAt).toLocaleString()}</small>
                            </div>
                          ))}
                        </div>

                        <label className="support-reply-box">
                          客服回复
                          <textarea
                            disabled={thread.status === "closed"}
                            rows={3}
                            value={supportReplyDrafts[thread.id] || ""}
                            onChange={(event) => updateSupportDraft(thread.id, event.target.value)}
                            placeholder={thread.status === "closed" ? "这条会话已关闭" : "输入客服回复，客户前台聊天窗口可看到"}
                          />
                        </label>

                        {thread.status === "open" ? (
                          <div className="support-quick-replies" aria-label="快捷回复">
                            {supportQuickReplies.map((reply) => (
                              <button key={reply} type="button" onClick={() => useQuickReply(thread.id, reply)}>
                                {reply}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="support-thread-actions">
                          <button
                            className="button primary"
                            disabled={thread.status === "closed" || !(supportReplyDrafts[thread.id] || "").trim()}
                            type="button"
                            onClick={() => replySupportThread(thread.id)}
                          >
                            发送回复
                          </button>
                          {thread.status === "open" ? (
                            <button className="button" type="button" onClick={() => closeThread(thread.id)}>
                              关闭会话
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
