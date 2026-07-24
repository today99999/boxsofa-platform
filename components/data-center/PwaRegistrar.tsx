"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const legacyScope = `${window.location.origin}/`;

      await Promise.all(
        registrations
          .filter((registration) => {
            const worker = registration.active ?? registration.waiting ?? registration.installing;
            return registration.scope === legacyScope && worker && new URL(worker.scriptURL).pathname === "/sw.js";
          })
          .map((registration) => registration.unregister())
      );

      await navigator.serviceWorker.register("/sw.js", { scope: "/data-center" });
    })().catch(() => {
      // Installation is optional; the authenticated web application remains usable.
    });
  }, []);

  return null;
}
