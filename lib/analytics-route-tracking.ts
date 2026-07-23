import { products } from "./catalog.ts";
import type { AnalyticsEvent, AnalyticsEventType } from "./analytics.ts";

export type RouteTrackingFields = Pick<AnalyticsEvent, "productId" | "productSlug" | "productName">;
export type NavigationTracker = (type: AnalyticsEventType, fields?: RouteTrackingFields) => unknown;

// Query parameter order is normalized, but each changed query value is a distinct
// navigation. Hash-only changes are deliberately ignored because they do not load a
// new page or product view.
export function navigationTrackingKey(pathname: string, search = "") {
  const normalizedPath = pathname || "/";
  const params = Array.from(new URLSearchParams(search).entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const normalizedSearch = new URLSearchParams(params).toString();
  return normalizedSearch ? `${normalizedPath}?${normalizedSearch}` : normalizedPath;
}

export function productTrackingFieldsForPath(pathname: string): RouteTrackingFields | null {
  const match = pathname.match(/^\/product\/([^/]+)\/?$/);
  if (!match) return null;
  const product = products.find((item) => item.slug === match[1]);
  if (!product) return null;
  return {
    productId: product.id,
    productSlug: product.slug,
    productName: product.name
  };
}

export function createNavigationTrackingCoordinator(track: NavigationTracker) {
  let lastTrackedKey: string | null = null;

  return {
    track(pathname: string, search = "") {
      const key = navigationTrackingKey(pathname, search);
      if (key === lastTrackedKey) return false;
      lastTrackedKey = key;
      track("page_view");
      const product = productTrackingFieldsForPath(pathname);
      if (product) track("product_view", product);
      return true;
    },
    reset() {
      lastTrackedKey = null;
    }
  };
}
