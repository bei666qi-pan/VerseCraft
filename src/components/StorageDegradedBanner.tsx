"use client";

import { useEffect, useState } from "react";

const DEFAULT_STORAGE_DEGRADED_MESSAGE = "本地存储读取较慢，已进入临时恢复模式";

export function StorageDegradedBanner() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState(DEFAULT_STORAGE_DEGRADED_MESSAGE);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: unknown }>).detail;
      const nextMessage =
        typeof detail?.message === "string" && detail.message.trim()
          ? detail.message.trim()
          : DEFAULT_STORAGE_DEGRADED_MESSAGE;
      setMessage(nextMessage);
      setVisible(true);
    };
    window.addEventListener("storage-degraded", handler);
    return () => window.removeEventListener("storage-degraded", handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="pointer-events-none fixed top-0 left-0 right-0 z-[100] flex items-center justify-center bg-amber-600/95 px-4 py-2 text-center text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}
