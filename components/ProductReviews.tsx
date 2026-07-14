"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  averageRating,
  getStoredReviews,
  saveStoredReviews,
  type ProductReview,
  visibleReviewsForStyle
} from "@/lib/reviews";
import { useTranslation } from "@/components/useTranslation";

type Props = {
  productSlug: string;
  styleId: string;
};

type ReviewSubmitResponse = { ok: boolean; mode: "local" | "supabase"; message?: string; review?: ProductReview };
type ReviewListResponse = { ok: boolean; mode: "local" | "supabase"; message?: string; reviews?: ProductReview[] };

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}

export function ProductReviews({ productSlug, styleId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [country, setCountry] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function syncReviews() {
      setReviews(getStoredReviews());
    }

    syncReviews();
    void loadServerReviews();
    window.addEventListener("boxsofa-reviews-updated", syncReviews);
    return () => window.removeEventListener("boxsofa-reviews-updated", syncReviews);
  }, [productSlug, styleId]);

  async function loadServerReviews() {
    try {
      const response = await fetch(
        `/api/reviews?productSlug=${encodeURIComponent(productSlug)}&styleId=${encodeURIComponent(styleId)}`
      );
      const result = (await response.json()) as ReviewListResponse;
      if (!response.ok || !result.ok || !result.reviews) return;

      setReviews((current) => {
        const withoutServer = current.filter((review) => review.source !== "supabase");
        const byId = new Map<string, ProductReview>();
        [...result.reviews!, ...withoutServer].forEach((review) => byId.set(review.id, review));
        const nextReviews = Array.from(byId.values());
        saveStoredReviews(nextReviews);
        return nextReviews;
      });
    } catch {
      // Local seed reviews remain visible when the database cannot be reached.
    }
  }

  const visibleReviews = useMemo(() => visibleReviewsForStyle(reviews, styleId), [reviews, styleId]);
  const average = averageRating(visibleReviews);

  async function syncReview(review: ProductReview) {
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug: review.productSlug,
          styleId: review.styleId,
          customerName: review.customerName,
          country: review.country,
          rating: review.rating,
          comment: review.comment
        })
      });
      const result = (await response.json()) as ReviewSubmitResponse;
      if (!response.ok || !result.ok) {
        setMessage(result.message || "Review could not be submitted.");
        return false;
      }
      setMessage(
        result.mode === "supabase"
          ? "Thanks. Your review has been saved."
          : "Thanks. Your review has been added to the product page."
      );
      return result.review ?? review;
    } catch {
      setMessage("Review could not be submitted.");
      return null;
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerName.trim() || !country.trim() || !comment.trim()) {
      setMessage("Please complete your name, country and review.");
      return;
    }

    setIsSubmitting(true);
    const nextReview: ProductReview = {
      id: `rv-${Date.now()}`,
      styleId,
      productSlug,
      customerName: customerName.trim(),
      country: country.trim(),
      rating,
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
      pinned: false
    };

    const savedReview = await syncReview(nextReview);
    setIsSubmitting(false);
    if (!savedReview) return;

    const nextReviews = [savedReview, ...reviews.filter((review) => review.id !== savedReview.id)];
    setReviews(nextReviews);
    saveStoredReviews(nextReviews);
    setCustomerName("");
    setCountry("");
    setRating(5);
    setComment("");
  }

  return (
    <>
      <button className="button review-open-button" type="button" onClick={() => setOpen(true)}>
        {t("customerReviews")}
        <span>{visibleReviews.length ? `${average.toFixed(1)} / 5` : t("noReviews")}</span>
      </button>

      {open ? (
        <div className="review-modal" role="dialog" aria-modal="true" aria-label={t("customerReviews")}>
          <div className="review-modal-backdrop" onClick={() => setOpen(false)} />
          <section className="review-dialog">
            <div className="panel-head">
              <div>
                <h2>{t("customerReviews")}</h2>
                <p>
                  {visibleReviews.length
                    ? `${t("averageRating")} ${average.toFixed(1)} / 5, ${visibleReviews.length} ${t("reviewsCount")}`
                    : t("noReviews")}
                </p>
              </div>
              <button className="button" type="button" onClick={() => setOpen(false)}>
                {t("close")}
              </button>
            </div>

            <form className="review-form" onSubmit={submitReview}>
              <div className="review-form-grid">
                <label>
                  Name
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                </label>
                <label>
                  Country
                  <input value={country} onChange={(event) => setCountry(event.target.value)} />
                </label>
                <label>
                  Rating
                  <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value} / 5
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Review
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} />
              </label>
              <div className="review-form-actions">
                <button className="button primary" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Submitting..." : "Submit review"}
                </button>
                {message ? <span>{message}</span> : null}
              </div>
            </form>

            {visibleReviews.length === 0 ? (
              <div className="empty-state">
                <strong>{t("noReviews")}</strong>
                <p>{t("noReviewsNote")}</p>
              </div>
            ) : (
              <div className="review-list">
                {visibleReviews.map((review) => (
                  <article className={`review-card ${review.pinned ? "pinned" : ""}`} key={review.id}>
                    <div className="review-card-head">
                      <div>
                        <strong>{review.customerName}</strong>
                        <span>{review.country}</span>
                      </div>
                      <div className="review-rating" aria-label={`${review.rating} stars`}>
                        {stars(review.rating)}
                      </div>
                    </div>
                    {review.pinned ? <span className="status">{t("merchantPinned")}</span> : null}
                    <p>{review.comment}</p>
                    <small>{new Date(review.createdAt).toLocaleDateString("zh-CN")}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
