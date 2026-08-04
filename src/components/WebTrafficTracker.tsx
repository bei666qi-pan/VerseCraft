"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { classifyWebTrafficSource } from "@/lib/analytics/webTraffic";

const VISITOR_ID_STORAGE_KEY = "versecraft.web_traffic_visitor_id.v1";

function randomId(): string {
  return globalThis.crypto?.randomUUID?.().replaceAll("-", "_") ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getVisitorId(): string | null {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,96}$/.test(existing)) return existing;
    const visitorId = randomId();
    window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);
    return visitorId;
  } catch {
    return null;
  }
}

export default function WebTrafficTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/saiduhsa") || pathname.startsWith("/preview")) return;
    const visitorId = getVisitorId();
    if (!visitorId) return;
    const eventId = randomId();
    void fetch("/api/analytics/page-view", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname,
        visitorId,
        eventId,
        trafficSource: classifyWebTrafficSource(document.referrer, window.location.origin),
      }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
