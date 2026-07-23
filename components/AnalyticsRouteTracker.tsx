"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ANALYTICS_SERVER_READY_EVENT,
  isAnalyticsServerReady,
  trackEvent
} from "@/lib/analytics";
import { createNavigationTrackingCoordinator, navigationTrackingKey } from "@/lib/analytics-route-tracking";

const routeTracker = createNavigationTrackingCoordinator(trackEvent);

export function AnalyticsRouteTracker() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const navigationKey = useMemo(() => navigationTrackingKey(pathname, search), [pathname, search]);
  const [readinessRevision, setReadinessRevision] = useState(0);

  useEffect(() => {
    const handleReadinessChange = () => setReadinessRevision((revision) => revision + 1);
    window.addEventListener(ANALYTICS_SERVER_READY_EVENT, handleReadinessChange);
    handleReadinessChange();
    return () => window.removeEventListener(ANALYTICS_SERVER_READY_EVENT, handleReadinessChange);
  }, []);

  useEffect(() => {
    if (!isAnalyticsServerReady()) {
      routeTracker.reset();
      return;
    }
    routeTracker.track(pathname, search);
  }, [navigationKey, pathname, readinessRevision, search]);

  return null;
}
