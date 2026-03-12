"use client";

import { useEffect } from "react";
import { pingPresence } from "@/app/actions/telemetry";

const HEARTBEAT_INTERVAL_MS = 60_000;
const PASSIVE_POLL_INTERVAL_MS = 15_000;

export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let lastPingAt = 0;
    let passiveTimer: ReturnType<typeof setInterval> | null = null;

    const maybePing = () => {
      const now = Date.now();
      if (now - lastPingAt < HEARTBEAT_INTERVAL_MS) {
        return;
      }
      lastPingAt = now;
      void pingPresence().catch(() => {
        // Silent failure: heartbeat should never break gameplay flow.
      });
    };

    const handleUserActivity = () => {
      maybePing();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleUserActivity();
      }
    };

    // Initial ping on mount to mark session active.
    maybePing();

    // Merge heartbeats into active operations and user interactions.
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      window.addEventListener("click", handleUserActivity);
      window.addEventListener("keydown", handleUserActivity);
      window.addEventListener("pointerdown", handleUserActivity);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // Lightweight passive polling as a safety net, debounced by maybePing.
    passiveTimer = setInterval(maybePing, PASSIVE_POLL_INTERVAL_MS);

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
  }, [enabled]);
}

