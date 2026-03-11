"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useGameStore as usePersistStore } from "@/store/gameStore";

export default function HydrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);
  const hasRehydratedRef = useRef(false);

  useEffect(() => {
    // React 18/19 严格模式下会双重挂载，用 ref 确保 rehydrate 只调用一次，避免 IDB 事务冲突
    if (hasRehydratedRef.current) return;
    hasRehydratedRef.current = true;

    const rehydrateMain = useGameStore.persist.rehydrate();
    const rehydratePersist =
      (usePersistStore as { persist?: { rehydrate: () => Promise<unknown> } })
        .persist?.rehydrate?.() ?? Promise.resolve();

    void Promise.all([
      Promise.resolve(rehydrateMain),
      Promise.resolve(rehydratePersist),
    ]).finally(() => {
      setHydrated(true);
    });
  }, [setHydrated]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        读取世界线中...
      </div>
    );
  }

  return <>{children}</>;
}
