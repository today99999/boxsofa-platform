"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getAnalyticsReadinessSnapshot,
  subscribeAnalyticsReadiness,
  trackEvent
} from "@/lib/analytics";
import { createNavigationTrackingCoordinator, navigationTrackingKey } from "@/lib/analytics-route-tracking";

const routeTracker = createNavigationTrackingCoordinator(trackEvent);

export function AnalyticsRouteTracker() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const navigationKey = useMemo(() => navigationTrackingKey(pathname, search), [pathname, search]);
  const [readiness, setReadiness] = useState(getAnalyticsReadinessSnapshot);

  useEffect(() => {
    return subscribeAnalyticsReadiness(setReadiness);
  }, []);

  useEffect(() => {
    routeTracker.reconcile(pathname, search, readiness);
  }, [navigationKey, pathname, readiness, search]);

  return null;
}
