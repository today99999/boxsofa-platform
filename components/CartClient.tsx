"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CART_KEY, ORDERS_KEY, type CartItem, type LocalOrder } from "@/lib/cart";
import { trackEvent } from "@/lib/analytics";
import { CatalogText } from "@/components/CatalogText";
import { LeadCapture } from "@/components/LeadCapture";
import { useTranslation } from "@/components/useTranslation";
import { europeDeliveryCountries } from "@/lib/europeShipping";

type CheckoutForm = {
  customerName: string;
  phone: string;
  email: string;
  countryCode: string;
  address: string;
};

type CustomerProfileResponse = {
  ok: boolean;
  mode: "local" | "supabase";
  message?: string;
  profile?: {
    email?: string;
    full_name?: string | null;
    phone?: string | null;
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

const emptyCheckoutForm: CheckoutForm = {
  customerName: "",
  phone: "",
  email: "",
  countryCode: "ES",
  address: ""
};

function money(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function hasCheckoutInput(form: CheckoutForm) {
  return Boolean(form.customerName || form.phone || form.email || form.address);
}

function formatSavedAddress(address: CustomerProfileResponse["address"]) {
  if (!address) return "";
  const cityLine = [address.postal_code, address.city].filter(Boolean).join(" ");
  return [address.line1, address.line2, cityLine, address.province]
    .filter(Boolean)
    .join(", ");
}

export function CartClient() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CartItem[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<LocalOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(emptyCheckoutForm);
  const [profileMode, setProfileMode] = useState<"local" | "supabase">("local");
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    setItems(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));

    fetch("/api/customer/profile")
      .then((response) => response.json() as Promise<CustomerProfileResponse>)
      .then((result) => {
        if (!result.ok || result.mode !== "supabase") {
          setProfileMode("local");
          return;
        }

        const savedAddress = formatSavedAddress(result.address);
        const savedForm: CheckoutForm = {
          customerName: result.address?.recipient || result.profile?.full_name || "",
          phone: result.address?.phone || result.profile?.phone || "",
          email: result.profile?.email || "",
          countryCode: result.address?.country_code || "ES",
          address: savedAddress
        };

        setProfileMode("supabase");
        if (hasCheckoutInput(savedForm)) {
          setProfileMessage("Saved customer delivery details have been loaded.");
          setCheckoutForm((current) => (hasCheckoutInput(current) ? current : savedForm));
        }
      })
      .catch(() => setProfileMode("local"));
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.priceEur * item.quantity, 0), [items]);
  const cartSummary = useMemo(
    () => items.map((item) => `${item.quantity} x ${item.name} (${item.color})`).join("; "),
    [items]
  );
  const shipping = 0;
  const total = subtotal + shipping;

  function updateCheckoutField<Field extends keyof CheckoutForm>(field: Field, value: CheckoutForm[Field]) {
    setCheckoutForm((current) => ({ ...current, [field]: value }));
  }

  function saveCart(nextItems: CartItem[]) {
    setItems(nextItems);
    localStorage.setItem(CART_KEY, JSON.stringify(nextItems));
    window.dispatchEvent(new Event("boxsofa-cart-updated"));
  }

  function updateQuantity(id: string, quantity: number) {
    saveCart(items.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item)));
  }

  function removeItem(id: string) {
    saveCart(items.filter((item) => item.id !== id));
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0 || isSubmitting) return;

    const payload = {
      customerName: checkoutForm.customerName,
      phone: checkoutForm.phone,
      email: checkoutForm.email,
      countryCode: checkoutForm.countryCode,
      address: checkoutForm.address,
      items,
      subtotalEur: subtotal,
      discountEur: 0,
      shippingEur: shipping,
      totalEur: total
    };

    setIsSubmitting(true);
    setOrderError("");

    try {
      const response = await fetch(`/api/orders${window.location.search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
        order?: LocalOrder;
        checkoutUrl?: string | null;
      };

      if (!response.ok || !result.ok || !result.order) {
        throw new Error(result.message || "Order submit failed.");
      }

      const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      localStorage.setItem(ORDERS_KEY, JSON.stringify([result.order, ...orders]));
      trackEvent("order_submit", { valueEur: total });
      localStorage.removeItem(CART_KEY);
      setItems([]);

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }

      setSubmittedOrder(result.order);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Order submit failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submittedOrder) {
    return (
      <div className="panel success-panel">
        <h1>{t("orderSubmitted")}</h1>
        <p>
          {t("orderNumber")}: {submittedOrder.id}
        </p>
        <p>{t("paymentNote")}</p>
        <a className="button primary" href="/orders">
          {t("viewOrders")}
        </a>
      </div>
    );
  }

  return (
    <div className="checkout-layout">
      <section className="panel">
        <h1>{t("cartTitle")}</h1>
        {items.length === 0 ? (
          <p>{t("emptyCart")}</p>
        ) : (
          <div className="cart-list">
            {items.map((item) => (
              <article className="cart-row" key={item.id}>
                <img src={item.image} alt={item.name} />
                <div>
                  <strong><CatalogText text={item.name} kind="name" /></strong>
                  <p><CatalogText text={item.color} kind="color" /></p>
                  <p>{money(item.priceEur)}</p>
                </div>
                <input
                  min={1}
                  type="number"
                  value={item.quantity}
                  onChange={(event) => updateQuantity(item.id, Number(event.target.value))}
                />
                <button className="button" type="button" onClick={() => removeItem(item.id)}>
                  {t("remove")}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="panel checkout-form" onSubmit={submitOrder}>
        <div>
          <h2>{t("deliveryInfo")}</h2>
          {profileMessage ? <p className="checkout-profile-note">{profileMessage}</p> : null}
          {profileMode === "local" ? (
            <p className="checkout-profile-note muted">Login as a customer to reuse saved delivery details.</p>
          ) : null}
        </div>
        <label>
          {t("name")}
          <input
            name="customerName"
            required
            value={checkoutForm.customerName}
            onChange={(event) => updateCheckoutField("customerName", event.target.value)}
          />
        </label>
        <label>
          {t("phone")}
          <input
            name="phone"
            required
            value={checkoutForm.phone}
            onChange={(event) => updateCheckoutField("phone", event.target.value)}
          />
        </label>
        <label>
          {t("email")}
          <input
            name="email"
            required
            type="email"
            value={checkoutForm.email}
            onChange={(event) => updateCheckoutField("email", event.target.value)}
          />
        </label>
        <label>
          {t("country")}
          <select
            name="countryCode"
            required
            value={checkoutForm.countryCode}
            onChange={(event) => updateCheckoutField("countryCode", event.target.value)}
          >
            {europeDeliveryCountries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("address")}
          <textarea
            name="address"
            required
            rows={4}
            value={checkoutForm.address}
            onChange={(event) => updateCheckoutField("address", event.target.value)}
          />
        </label>
        <div className="summary-lines">
          <span>{t("subtotal")}</span>
          <strong>{money(subtotal)}</strong>
          <span>{t("shipping")}</span>
          <strong>{money(shipping)}</strong>
          <span>{t("total")}</span>
          <strong>{money(total)}</strong>
        </div>
        {orderError ? <p className="form-error">{orderError}</p> : null}
        <button className="button primary" disabled={items.length === 0 || isSubmitting} type="submit">
          {isSubmitting ? "Submitting..." : t("submitOrder")}
        </button>
      </form>
      {items.length > 0 ? <LeadCapture source="cart" cartSummary={cartSummary} /> : null}
    </div>
  );
}
