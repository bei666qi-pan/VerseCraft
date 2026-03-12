"use client";

import { useEffect, useRef } from "react";
import { ensureStorageReady } from "@/lib/resilientStorage";
import { useGameStore } from "@/store/useGameStore";
import { useGameStore as usePersistStore } from "@/store/gameStore";
import { useAchievementsStore } from "@/store/useAchievementsStore";

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

    const runRehydrate = async () => {
      await ensureStorageReady();
      const rehydrateMain = useGameStore.persist.rehydrate();
      const rehydratePersist =
        (usePersistStore as { persist?: { rehydrate: () => Promise<unknown> } })
          .persist?.rehydrate?.() ?? Promise.resolve();
      const rehydrateAchievements =
        (useAchievementsStore as { persist?: { rehydrate: () => Promise<unknown> } }).persist?.rehydrate?.() ??
        Promise.resolve();
      await Promise.all([
        Promise.resolve(rehydrateMain),
        Promise.resolve(rehydratePersist),
        Promise.resolve(rehydrateAchievements),
      ]);
    };

    const done = () => setHydrated(true);
    const timeout = setTimeout(done, 8000);

    void runRehydrate().finally(() => {
      clearTimeout(timeout);
      done();
    });

    return () => clearTimeout(timeout);
  }, [setHydrated]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-white/10 backdrop-blur-sm" />
        <div className="h-4 w-36 animate-pulse rounded-lg bg-white/5" />
        <p className="text-sm text-slate-400">读取世界线中...</p>
      </div>
    );
  }

  return <>{children}</>;
}
