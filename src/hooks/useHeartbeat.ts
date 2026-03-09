"use client";

import { useEffect } from "react";
import { pingPresence } from "@/app/actions/telemetry";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const pulse = () => {
      void pingPresence().catch(() => {
        // Silent failure: heartbeat should never break gameplay flow.
      });
    };

    pulse();
    const timer = setInterval(pulse, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [enabled]);
}
