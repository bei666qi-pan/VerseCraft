"use client";

import { useEffect } from "react";

const CHUNK_ERROR_KEY = "versecraft-chunk-retry";
const CHUNK_ERROR_COUNT_KEY = "versecraft-chunk-retry-count";
const MAX_CHUNK_RELOADS = 3;
const CHUNK_RECOVERY_IN_FLIGHT_KEY = "versecraft-chunk-recovery-inflight";

function isChunkLoadError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.name === "ChunkLoadError" ||
      err.message?.includes("ChunkLoadError") ||
      err.message?.includes("Loading chunk") ||
      err.message?.includes("Failed to fetch dynamically imported module")
    );
  }
  return false;
}

function isStaleServerActionError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = String(err.message ?? "");
    return (
      err.name === "UnrecognizedActionError" ||
      msg.includes("failed-to-find-server-action") ||
      msg.includes("Server Action") && msg.includes("was not found")
    );
  }
  const s = String(err ?? "");
  return s.includes("failed-to-find-server-action") || (s.includes("Server Action") && s.includes("was not found"));
}

export default function ChunkErrorHandler() {
  useEffect(() => {
    const recoverFromChunkError = async () => {
      const inFlight = sessionStorage.getItem(CHUNK_RECOVERY_IN_FLIGHT_KEY);
      if (inFlight === "1") return;
      sessionStorage.setItem(CHUNK_RECOVERY_IN_FLIGHT_KEY, "1");
      try {
        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
        }
        if (typeof caches !== "undefined" && "keys" in caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
        }
      } catch {
        // ignore cleanup failures
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.set("__chunk_recover", String(Date.now()));
        window.location.replace(url.toString());
      }
    };

    const attemptRecovery = (err: unknown, event?: Event) => {
      const refreshed = sessionStorage.getItem(CHUNK_ERROR_KEY);
      if (refreshed === "1") {
        sessionStorage.removeItem(CHUNK_ERROR_KEY);
        return;
      }

      const count = Number(sessionStorage.getItem(CHUNK_ERROR_COUNT_KEY) ?? "0");
      if (Number.isFinite(count) && count >= MAX_CHUNK_RELOADS) {
        console.warn("[ChunkErrorHandler] 达到最大重载次数，停止继续 reload。", {
          count,
          error: String(err),
        });
        return;
      }

      event?.preventDefault();
      sessionStorage.setItem(CHUNK_ERROR_KEY, "1");
      sessionStorage.setItem(CHUNK_ERROR_COUNT_KEY, String((Number.isFinite(count) ? count : 0) + 1));
      void recoverFromChunkError();
    };

    const handler = (event: ErrorEvent) => {
      const err = event?.error ?? event?.message;
      if (!isChunkLoadError(err) && !isStaleServerActionError(err)) return;
      attemptRecovery(err, event);
    };

    const unhandled = (event: PromiseRejectionEvent) => {
      const err = event?.reason;
      if (!isChunkLoadError(err) && !isStaleServerActionError(err)) return;
      attemptRecovery(err, event);
    };

    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", unhandled);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", unhandled);
    };
  }, []);

  return null;
}
