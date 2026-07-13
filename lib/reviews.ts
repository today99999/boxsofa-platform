export type ProductReview = {
  id: string;
  styleId: string;
  productSlug: string;
  customerName: string;
  country: string;
  rating: number;
  comment: string;
  createdAt: string;
  pinned: boolean;
  deleted?: boolean;
};

export const REVIEWS_KEY = "boxsofa_product_reviews_v1";

export const seedReviews: ProductReview[] = [
  {
    id: "rv-chameleon-01",
    styleId: "变色龙（马里奥）沙发",
    productSlug: "chameleon-mario-sofa-01",
    customerName: "Emma L.",
    country: "Germany",
    rating: 5,
    comment: "The sofa arrived compressed and was easy to move into my apartment. It expanded well and feels very soft.",
    createdAt: "2026-06-20T09:30:00.000Z",
    pinned: true
  },
  {
    id: "rv-chameleon-02",
    styleId: "变色龙（马里奥）沙发",
    productSlug: "chameleon-mario-sofa-01",
    customerName: "Carlos M.",
    country: "Spain",
    rating: 5,
    comment: "Good size for a small living room. The color looks warm and the delivery estimate was clear.",
    createdAt: "2026-06-24T15:10:00.000Z",
    pinned: false
  },
  {
    id: "rv-single029-01",
    styleId: "单人029兔绒",
    productSlug: "single-029-fleece-01",
    customerName: "Sophie R.",
    country: "France",
    rating: 5,
    comment: "Very comfortable as a reading chair. Light enough to place by myself after opening the package.",
    createdAt: "2026-06-18T11:20:00.000Z",
    pinned: true
  },
  {
    id: "rv-eggshell-01",
    styleId: "蛋壳沙发",
    productSlug: "eggshell-sofa-03",
    customerName: "Marta G.",
    country: "Spain",
    rating: 4,
    comment: "Nice sofa bed for guests. The fabric feels soft and the expanded shape is stable.",
    createdAt: "2026-06-21T17:45:00.000Z",
    pinned: true
  },
  {
    id: "rv-tofu-01",
    styleId: "豆腐块高靠沙发1",
    productSlug: "tofu-highback-sofa-01",
    customerName: "Jonas K.",
    country: "Netherlands",
    rating: 5,
    comment: "The modular design is practical. We moved each piece through a narrow stairway without trouble.",
    createdAt: "2026-06-25T13:35:00.000Z",
    pinned: true
  },
  {
    id: "rv-pebble-01",
    styleId: "鹅卵石沙发",
    productSlug: "pebble-sofa-01",
    customerName: "Laura P.",
    country: "Italy",
    rating: 5,
    comment: "Beautiful statement sofa. The curved modules make the room look more relaxed and modern.",
    createdAt: "2026-06-22T10:05:00.000Z",
    pinned: true
  },
  {
    id: "rv-waffle-01",
    styleId: "华夫格沙发",
    productSlug: "waffle-sofa-04",
    customerName: "Nina B.",
    country: "Austria",
    rating: 5,
    comment: "Great compact lounge chair. The texture is cozy and the color options are useful.",
    createdAt: "2026-06-23T14:40:00.000Z",
    pinned: false
  },
  {
    id: "rv-cashew-01",
    styleId: "腰果沙发",
    productSlug: "cashew-sofa-05",
    customerName: "Oliver S.",
    country: "Germany",
    rating: 5,
    comment: "The double seat looks clean and minimal. Very good for a small studio apartment.",
    createdAt: "2026-06-26T08:25:00.000Z",
    pinned: false
  }
];

export function getStoredReviews() {
  const raw = localStorage.getItem(REVIEWS_KEY);
  if (!raw) {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(seedReviews));
    return seedReviews;
  }
  return JSON.parse(raw) as ProductReview[];
}

export function saveStoredReviews(reviews: ProductReview[]) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
  window.dispatchEvent(new Event("boxsofa-reviews-updated"));
}

export function visibleReviewsForStyle(reviews: ProductReview[], styleId: string) {
  return reviews
    .filter((review) => review.styleId === styleId && !review.deleted)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function averageRating(reviews: ProductReview[]) {
  const visible = reviews.filter((review) => !review.deleted);
  if (visible.length === 0) return 0;
  return visible.reduce((sum, review) => sum + review.rating, 0) / visible.length;
}
