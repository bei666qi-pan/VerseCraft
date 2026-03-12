"use client";

import { useEffect, useState } from "react";

export function StorageDegradedBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("storage-degraded", handler);
    return () => window.removeEventListener("storage-degraded", handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center bg-amber-600/95 px-4 py-2 text-center text-sm font-medium text-white shadow-lg"
    >
      进度无法持久保存，请关闭隐私模式或检查存储权限
    </div>
  );
}
