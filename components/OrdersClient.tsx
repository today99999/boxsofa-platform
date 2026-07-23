"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { CatalogText } from "@/components/CatalogText";
import { useTranslation } from "@/components/useTranslation";
import { ORDERS_KEY, type LocalOrder } from "@/lib/cart";
import { OptimizedImage } from "@/components/OptimizedImage";

type CustomerOrderResponse = { ok: boolean; mode: "local" | "supabase"; orders?: LocalOrder[]; message?: string };
type OrderSource = "Local orders" | "Customer database";
type CustomerProfileResponse = {
  ok: boolean;
  mode: "local" | "supabase";
  message?: string;
  profile?: {
    email?: string;
    full_name?: string | null;
    phone?: string | null;
    preferred_locale?: "zh" | "en" | "es" | "fr" | "de";
    total_paid_eur?: number;
    is_member?: boolean;
    marketing_consent?: boolean;
  } | null;
  address?: {
    country_code?: string | null;
    recipient?: string | null;
    phone?: string | null;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
  } | null;
};

type CustomerProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  countryCode: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  marketingConsent: boolean;
};

const emptyProfileForm: CustomerProfileForm = {
  fullName: "",
  email: "",
  phone: "",
  countryCode: "ES",
  line1: "",
  line2: "",
  city: "",
  province: "",
  postalCode: "",
  marketingConsent: false
};

function statusText(status: LocalOrder["status"], t: ReturnType<typeof useTranslation>["t"]) {
  return {
    pending_confirm: t("statusPending"),
    paid_confirmed: t("statusPaid"),
    shipped: t("statusShipped"),
    cancelled: t("statusCancelled")
  }[status];
}

function orderStep(status: LocalOrder["status"]) {
  return {
    pending_confirm: 1,
    paid_confirmed: 2,
    shipped: 3,
    cancelled: 0
  }[status];
}

function orderNotice(order: LocalOrder) {
  if (order.status === "cancelled") {
    return {
      title: "Order cancelled",
      body: "This order has been cancelled and reserved stock has been released. Contact BoxSofa support if this was unexpected.",
      next: "No payment is required for this order."
    };
  }

  if (order.status === "shipped") {
    return {
      title: "On the way",
      body: order.trackingNumber
        ? "Your sofa has left our warehouse. Use the tracking number below to follow the shipment once the carrier updates it."
        : "Your sofa has been marked as shipped. Tracking details will appear here after the carrier update.",
      next: "Cross-border delivery is usually 23-30 days."
    };
  }

  if (order.status === "paid_confirmed") {
    return {
      title: "Payment confirmed",
      body: "BoxSofa has confirmed your payment. We are preparing the sofa and will update this page with carrier details after dispatch.",
      next: "Next step: warehouse preparation and tracking number."
    };
  }

  return {
    title: "Waiting for payment confirmation",
    body: "We have received your order. BoxSofa will contact you to confirm the payment method before the order moves forward.",
    next: "Next step: merchant confirms payment and reserves the shipment."
  };
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN");
}

export function OrdersClient() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [orderSource, setOrderSource] = useState<OrderSource>("Local orders");
  const [syncMessage, setSyncMessage] = useState("");
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [lastOrderSyncAt, setLastOrderSyncAt] = useState<string | null>(null);
  const [profileMode, setProfileMode] = useState<"local" | "supabase">("local");
  const [profileForm, setProfileForm] = useState<CustomerProfileForm>(emptyProfileForm);
  const [profileMessage, setProfileMessage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const loadCustomerOrders = useCallback(async () => {
    const localOrders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]") as LocalOrder[];
    setOrders(localOrders);
    setIsLoadingOrders(true);
    setLoginRequired(false);
    setSyncMessage("");

    try {
      const response = await fetch("/api/customer/orders", { cache: "no-store" });
      const result = (await response.json()) as CustomerOrderResponse;
      if (!result.ok) {
        if (response.status === 401 || result.message === "Customer login is required.") {
          setOrders([]);
          setOrderSource("Customer database");
          setLoginRequired(true);
        }
        setSyncMessage(result.message || "Customer database orders are unavailable. Showing local orders for now.");
        return;
      }
      if (result.mode === "supabase") {
        setOrders(result.orders ?? []);
        setOrderSource("Customer database");
        setLastOrderSyncAt(new Date().toISOString());
      } else {
        setOrderSource("Local orders");
      }
    } catch {
      setSyncMessage("Customer database orders are unavailable. Showing local orders for now.");
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomerOrders();
  }, [loadCustomerOrders]);

  useEffect(() => {
    fetch("/api/customer/profile")
      .then((response) => response.json() as Promise<CustomerProfileResponse>)
      .then((result) => {
        if (!result.ok) {
          setProfileMessage(result.message || "Customer profile is unavailable.");
          return;
        }

        setProfileMode(result.mode);
        if (result.mode === "local") {
          setProfileMessage("Sign in with a customer email account to save profile and address details.");
          return;
        }

        setProfileForm({
          fullName: result.profile?.full_name ?? "",
          email: result.profile?.email ?? "",
          phone: result.profile?.phone ?? "",
          countryCode: result.address?.country_code ?? "ES",
          line1: result.address?.line1 ?? "",
          line2: result.address?.line2 ?? "",
          city: result.address?.city ?? "",
          province: result.address?.province ?? "",
          postalCode: result.address?.postal_code ?? "",
          marketingConsent: result.profile?.marketing_consent ?? false
        });
      })
      .catch(() => setProfileMessage("Customer profile is unavailable."));
  }, []);

  const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const pendingOrders = orders.filter((order) => order.status === "pending_confirm");
  const confirmedOrders = orders.filter((order) => order.status === "paid_confirmed" || order.status === "shipped");
  const pendingTotal = pendingOrders.reduce((sum, order) => sum + order.totalEur, 0);
  const itemCount = orders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const confirmedSpend = confirmedOrders.reduce((sum, order) => sum + order.totalEur, 0);
  const membershipTarget = 300;
  const membershipProgress = Math.min(100, Math.round((confirmedSpend / membershipTarget) * 100));
  const remainingForMember = Math.max(0, membershipTarget - confirmedSpend);
  const memberActive = confirmedSpend >= membershipTarget;

  function updateProfileField<Field extends keyof CustomerProfileForm>(field: Field, value: CustomerProfileForm[Field]) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage("");

    try {
      const response = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profileForm.fullName,
          phone: profileForm.phone,
          marketingConsent: profileForm.marketingConsent,
          address: {
            recipient: profileForm.fullName,
            phone: profileForm.phone,
            countryCode: profileForm.countryCode,
            line1: profileForm.line1,
            line2: profileForm.line2,
            city: profileForm.city,
            province: profileForm.province,
            postalCode: profileForm.postalCode
          }
        })
      });
      const result = (await response.json()) as { ok: boolean; message?: string };
      setProfileMessage(result.ok ? "Profile saved." : result.message || "Could not save profile.");
    } catch {
      setProfileMessage("Could not save profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  return (
    <section className="customer-dashboard">
      <div className="panel customer-overview-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">BoxSofa Customer</p>
            <h1>{t("customerDashboard")}</h1>
          </div>
          <div className="customer-sync-actions" hidden={loginRequired}>
            <span className="status">{orderSource}</span>
            <button className="button" disabled={isLoadingOrders} onClick={loadCustomerOrders} type="button">
              {isLoadingOrders ? "Updating..." : "Refresh status"}
            </button>
          </div>
        </div>
        {!loginRequired && lastOrderSyncAt ? <p className="customer-sync-note">Last updated: {formatDate(lastOrderSyncAt)}</p> : null}
        {!loginRequired && syncMessage ? <p className="customer-sync-note">{syncMessage}</p> : null}

        {loginRequired ? (
          <div className="customer-login-required">
            <strong>Sign in to view your orders</strong>
            <p>Your orders, member discount progress and saved delivery details are available only after customer login.</p>
            <Link className="button primary" href="/login">
              Sign in
            </Link>
          </div>
        ) : null}

        <div className="customer-metrics" hidden={loginRequired}>
          <article className="stat-card">
            <span>{t("pendingOrders")}</span>
            <strong>{pendingOrders.length}</strong>
          </article>
          <article className="stat-card">
            <span>{t("pendingAmount")}</span>
            <strong>EUR {pendingTotal.toFixed(0)}</strong>
          </article>
          <article className="stat-card">
            <span>{t("statusPaid")}</span>
            <strong>{confirmedOrders.length}</strong>
          </article>
          <article className="stat-card">
            <span>{t("itemCount")}</span>
            <strong>{itemCount}</strong>
          </article>
        </div>

        <div className="membership-panel" hidden={loginRequired}>
          <div className="membership-head">
            <div>
              <strong>{t("memberProgress")}</strong>
              <p>{t("memberProgressNote")}</p>
            </div>
            <span className={`member-badge ${memberActive ? "active" : ""}`}>
              {memberActive ? "Member 10% off" : `EUR ${remainingForMember.toFixed(0)} to member`}
            </span>
          </div>
          <div className="progress-track" aria-label={`Membership progress ${membershipProgress}%`}>
            <span style={{ width: `${membershipProgress}%` }} />
          </div>
          <p>
            {t("confirmedSpend")}: EUR {confirmedSpend.toFixed(0)} / EUR {membershipTarget}
          </p>
        </div>
      </div>

      <div className="panel customer-profile-panel" hidden={loginRequired}>
        <div className="panel-head">
          <div>
            <p className="eyebrow">Customer Profile</p>
            <h2>Profile and delivery address</h2>
          </div>
          <span className="status">{profileMode === "supabase" ? "Saved in database" : "Local test mode"}</span>
        </div>
        <form className="customer-profile-form" onSubmit={saveProfile}>
          <label>
            Full name
            <input
              value={profileForm.fullName}
              onChange={(event) => updateProfileField("fullName", event.target.value)}
              placeholder="Customer name"
            />
          </label>
          <label>
            Email
            <input value={profileForm.email} disabled placeholder="Login email" />
          </label>
          <label>
            Phone
            <input
              value={profileForm.phone}
              onChange={(event) => updateProfileField("phone", event.target.value)}
              placeholder="+34 ..."
            />
          </label>
          <label>
            Country
            <input
              value={profileForm.countryCode}
              onChange={(event) => updateProfileField("countryCode", event.target.value.toUpperCase().slice(0, 2))}
              placeholder="ES"
            />
          </label>
          <label className="wide-field">
            Address line
            <input
              value={profileForm.line1}
              onChange={(event) => updateProfileField("line1", event.target.value)}
              placeholder="Street, building, floor"
            />
          </label>
          <label className="wide-field">
            Address details
            <input
              value={profileForm.line2}
              onChange={(event) => updateProfileField("line2", event.target.value)}
              placeholder="Apartment, gate, delivery note"
            />
          </label>
          <label>
            City
            <input value={profileForm.city} onChange={(event) => updateProfileField("city", event.target.value)} />
          </label>
          <label>
            Province
            <input value={profileForm.province} onChange={(event) => updateProfileField("province", event.target.value)} />
          </label>
          <label>
            Postal code
            <input value={profileForm.postalCode} onChange={(event) => updateProfileField("postalCode", event.target.value)} />
          </label>
          <label className="customer-consent wide-field">
            <input
              checked={profileForm.marketingConsent}
              onChange={(event) => updateProfileField("marketingConsent", event.target.checked)}
              type="checkbox"
            />
            Email me order updates and BoxSofa offers.
          </label>
          <div className="customer-profile-actions wide-field">
            <button className="button primary" disabled={profileMode !== "supabase" || isSavingProfile} type="submit">
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
            {profileMessage ? <span>{profileMessage}</span> : null}
          </div>
        </form>
      </div>

      <div className="panel" hidden={loginRequired}>
        <div className="panel-head">
          <h2>{t("myOrderList")}</h2>
          <span className="status">{t("logisticsEta")}</span>
        </div>
        {sortedOrders.length === 0 ? (
          <div className="empty-state">
            <strong>{t("noOrders")}</strong>
            <p>{t("noOrdersNote")}</p>
          </div>
        ) : (
          <div className="order-list customer-order-list">
            {sortedOrders.map((order) => {
              const step = orderStep(order.status);
              const notice = orderNotice(order);
              return (
                <article className="order-card customer-order-card" key={order.id}>
                  <div className="customer-order-head">
                    <div>
                      <span>{t("orderNumber")}</span>
                      <strong>{order.id}</strong>
                      <p>{formatDate(order.createdAt)}</p>
                    </div>
                    <span className={`order-status ${order.status}`}>{statusText(order.status, t)}</span>
                  </div>

                  {order.status === "cancelled" ? (
                    <div className="customer-order-progress cancelled" aria-label={statusText(order.status, t)}>
                      <span>{t("statusCancelled")}</span>
                    </div>
                  ) : (
                    <div className="customer-order-progress" aria-label={statusText(order.status, t)}>
                      <span className={step >= 1 ? "active" : ""}>{t("orderSubmitted")}</span>
                      <span className={step >= 2 ? "active" : ""}>{t("paidConfirmedAt")}</span>
                      <span className={step >= 3 ? "active" : ""}>{t("statusShipped")}</span>
                    </div>
                  )}

                  <div className={`customer-order-notice ${order.status}`}>
                    <div>
                      <strong>{notice.title}</strong>
                      <p>{notice.body}</p>
                    </div>
                    <span>{notice.next}</span>
                  </div>

                  <div className="customer-order-grid">
                    <div className="customer-order-info">
                      <span>{t("orderTotal")}</span>
                      <strong>EUR {order.totalEur.toFixed(2)}</strong>
                      <p>
                        {t("recipient")}: {order.customerName} / {order.phone}
                      </p>
                      <p>{order.address}</p>
                    </div>
                    <div className="customer-order-info logistics-box">
                      <span>{t("logistics")}</span>
                      <strong>
                        {order.status === "cancelled" ? t("statusCancelled") : order.trackingNumber ? `${order.carrier ? `${order.carrier} ` : ""}${order.trackingNumber}` : t("logisticsPending")}
                      </strong>
                      {order.paidConfirmedAt ? <p>{t("paidConfirmedAt")}: {formatDate(order.paidConfirmedAt)}</p> : null}
                      {order.shippedAt ? <p>{t("shippedAt")}: {formatDate(order.shippedAt)}</p> : null}
                    </div>
                  </div>

                  <div className="customer-order-items">
                    {order.items.map((item) => (
                      <div className="customer-order-item" key={item.id}>
                        <OptimizedImage alt={item.name} sizes="64px" src={item.image} />
                        <div>
                          <strong>
                            <CatalogText text={item.name} kind="name" />
                          </strong>
                          <p>
                            <CatalogText text={item.color} kind="color" /> / EUR {item.priceEur.toFixed(0)} x {item.quantity}
                          </p>
                        </div>
                        <div className="customer-order-actions">
                          <Link className="button" href={`/product/${item.slug}`}>
                            View
                          </Link>
                          <Link className="button" href={`/product/${item.slug}`}>
                            Review
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
