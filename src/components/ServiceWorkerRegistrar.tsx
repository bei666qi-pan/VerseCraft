"use client";

import { useEffect } from "react";

const BUILD_ID_STORAGE_KEY = "versecraft:buildId";
const CHECK_INTERVAL_MS = 30_000;

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    let mounted = true;

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW registration failed — non-critical */
      });
    }

    const checkBuildId = async () => {
      try {
        const res = await fetch("/api/build-id", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        const serverBuildId =
          typeof data.buildId === "string" && data.buildId.length > 0 ? data.buildId : "unknown";
        const prev = localStorage.getItem(BUILD_ID_STORAGE_KEY);
        if (!prev) {
          localStorage.setItem(BUILD_ID_STORAGE_KEY, serverBuildId);
          return;
        }
        if (prev !== serverBuildId && mounted) {
          localStorage.setItem(BUILD_ID_STORAGE_KEY, serverBuildId);
          window.location.reload();
        }
      } catch {
        /* ignore */
      }
    };

    void checkBuildId();
    const timer = window.setInterval(() => {
      void checkBuildId();
    }, CHECK_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
