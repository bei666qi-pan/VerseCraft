"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 60_000;
const PASSIVE_POLL_INTERVAL_MS = 15_000;

export function useHeartbeat(enabled: boolean, sessionId?: string, page?: string) {
  useEffect(() => {
    if (!enabled) return;

    let lastPingAt = 0;
    let passiveTimer: ReturnType<typeof setInterval> | null = null;
    let lastActivityAt = Date.now();

    const postHeartbeat = async (kind: "active" | "passive") => {
      const now = Date.now();
      if (now - lastPingAt < HEARTBEAT_INTERVAL_MS) {
        return;
      }
      lastPingAt = now;
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
      const visibility = typeof document !== "undefined" && document.visibilityState === "hidden" ? "hidden" : "visible";
      const guestId = sessionId && sessionId.startsWith("sess_") ? null : sessionId ?? null;
      // 兼容：历史调用把 guestId 直接当 sessionId 传入；一期先不破坏调用点。
      const effSessionId = sessionId && sessionId.startsWith("sess_") ? sessionId : `sess_${sessionId ?? "anon"}`;
      void fetch("/api/analytics/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: effSessionId,
          guestId,
          page: page ?? null,
          kind,
          visibility,
          userAgent: ua,
        }),
        cache: "no-store",
      }).catch(() => {
        // Silent failure: heartbeat should never break gameplay flow.
      });
    };

    const handleUserActivity = () => {
      lastActivityAt = Date.now();
      void postHeartbeat("active");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleUserActivity();
      } else {
        void postHeartbeat("passive");
      }
    };

    // Initial ping on mount to mark session active.
    void postHeartbeat("active");

    // Merge heartbeats into active operations and user interactions.
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      window.addEventListener("click", handleUserActivity);
      window.addEventListener("keydown", handleUserActivity);
      window.addEventListener("pointerdown", handleUserActivity);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // Lightweight passive polling as a safety net, debounced by maybePing.
    passiveTimer = setInterval(() => {
      // 15s 被动轮询：有互动则算 active，否则算 passive（read/idle 会在服务端按 visibility 分桶）
      const now = Date.now();
      const kind: "active" | "passive" = now - lastActivityAt < 25_000 ? "active" : "passive";
      void postHeartbeat(kind);
    }, PASSIVE_POLL_INTERVAL_MS);

    return () => {
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        window.removeEventListener("click", handleUserActivity);
        window.removeEventListener("keydown", handleUserActivity);
        window.removeEventListener("pointerdown", handleUserActivity);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (passiveTimer) {
        clearInterval(passiveTimer);
      }
    };
  }, [enabled, sessionId, page]);
}

