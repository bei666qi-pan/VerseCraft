// src/hooks/usePresenceHeartbeat.ts
"use client";

import { useEffect, useRef } from "react";

const INTERVAL_MS = 30_000;
const THROTTLE_MS = 25_000;

type Args = {
  enabled: boolean;
  sessionId: string;
  page: string;
  guestId?: string | null;
};

function pickGuestBody(guest: string | null | undefined) {
  const t = String(guest ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * Wall-clock play time via `POST /api/presence/heartbeat` (30s, only when tab visible + window focused).
 * SSR-safe: browser APIs only inside `useEffect`.
 */
export function usePresenceHeartbeat(args: Args) {
  const { enabled, sessionId, page, guestId = null } = args;
  const sid = sessionId?.trim() || "guest";
  const lastAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const buildBody = (beacon: boolean) => {
      const vis = document.visibilityState === "visible";
      const focused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
      return JSON.stringify({
        sessionId: sid,
        page,
        guestId: pickGuestBody(guestId),
        context: { visible: vis, focused },
        beacon,
      });
    };

    const postFetch = (body: string) => {
      void fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "include",
        keepalive: true,
        cache: "no-store",
      }).catch(() => {});
    };

    const tick = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const now = Date.now();
      if (now - lastAt.current < THROTTLE_MS) return;
      lastAt.current = now;
      postFetch(buildBody(false));
    };

    tick();
    const id = window.setInterval(tick, INTERVAL_MS);

    const onVisOrFocus = () => {
      tick();
    };
    const onOnline = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const body = buildBody(true);
      if (typeof navigator.sendBeacon === "function") {
        const ok = navigator.sendBeacon("/api/presence/heartbeat", new Blob([body], { type: "application/json" }));
        if (ok) return;
      }
      postFetch(body);
    };
    const onPageHide = () => {
      if (typeof navigator.sendBeacon === "function") {
        const body = JSON.stringify({
          sessionId: sid,
          page,
          guestId: pickGuestBody(guestId),
          context: { visible: true, focused: true },
          beacon: true,
        });
        void navigator.sendBeacon("/api/presence/heartbeat", new Blob([body], { type: "application/json" }));
      }
    };

    document.addEventListener("visibilitychange", onVisOrFocus);
    window.addEventListener("focus", onVisOrFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisOrFocus);
      window.removeEventListener("focus", onVisOrFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, sid, page, guestId]);
}
