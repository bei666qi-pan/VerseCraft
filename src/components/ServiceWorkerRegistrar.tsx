"use client";

import { useEffect } from "react";

const BUILD_ID_STORAGE_KEY = "versecraft:buildId";
const LAST_RELOAD_AT_KEY = "versecraft:lastBuildReloadAt";
const CHECK_INTERVAL_MS = 30_000;
const MIN_RELOAD_GAP_MS = 5 * 60 * 1000;

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    let mounted = true;
    const isProd = process.env.NODE_ENV === "production";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const isAdminRoute = pathname.startsWith("/saiduhsa");
    const safeGet = (key: string): string | null => {
      try {
        return localStorage.getItem(key);
      } catch {
        try {
          return sessionStorage.getItem(key);
        } catch {
          return null;
        }
      }
    };
    const safeSet = (key: string, value: string): void => {
      try {
        localStorage.setItem(key, value);
        return;
      } catch {
        try {
          sessionStorage.setItem(key, value);
        } catch {
          // ignore
        }
      }
    };

    if (!isProd && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        void Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      });
    }

    if (isProd && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW registration failed — non-critical */
      });
    }

    // Dev/HMR and admin console should not auto-reload by build-id polling.
    if (!isProd || isAdminRoute) {
      return () => {
        mounted = false;
      };
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
        const prev = safeGet(BUILD_ID_STORAGE_KEY);
        if (!prev) {
          safeSet(BUILD_ID_STORAGE_KEY, serverBuildId);
          return;
        }
        if (prev !== serverBuildId && mounted) {
          const lastReloadAt = Number(safeGet(LAST_RELOAD_AT_KEY) ?? "0");
          const now = Date.now();
          if (Number.isFinite(lastReloadAt) && now - lastReloadAt < MIN_RELOAD_GAP_MS) {
            safeSet(BUILD_ID_STORAGE_KEY, serverBuildId);
            return;
          }
          // Record build change only; avoid auto reload loops in client runtime.
          safeSet(LAST_RELOAD_AT_KEY, String(now));
          safeSet(BUILD_ID_STORAGE_KEY, serverBuildId);
          return;
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
