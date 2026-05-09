"use client";

import { useEffect, useRef } from "react";
import { ensureStorageReady, notifyStorageDegraded } from "@/lib/resilientStorage";
import { migrateLegacyVersecraftGameStateVolume } from "@/lib/migrateLegacyGameState";
import { useGameStore } from "@/store/useGameStore";
import { useAchievementsStore } from "@/store/useAchievementsStore";
import {
  HYDRATION_HARD_DEADLINE_MS,
  HYDRATION_SOFT_DEADLINE_MS,
} from "@/lib/state/hydrationMode";

export default function HydrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);
  const setStorageMode = useGameStore((s) => s.setStorageMode);
  const hasRehydratedRef = useRef(false);

  useEffect(() => {
    // React 18/19 严格模式下会双重挂载，用 ref 确保 rehydrate 只调用一次，避免 IDB 事务冲突
    if (hasRehydratedRef.current) return;
    hasRehydratedRef.current = true;

    let settled = false;
    let hardReleased = false;
    let rehydrateFailed = false;
    const softDeadlineId = window.setTimeout(() => {
      if (settled) return;
      setStorageMode("degraded");
      notifyStorageDegraded("本地存储读取较慢，已进入临时恢复模式");
    }, HYDRATION_SOFT_DEADLINE_MS);
    const hardDeadlineId = window.setTimeout(() => {
      if (settled) return;
      hardReleased = true;
      setStorageMode("degraded");
      setHydrated(true);
      notifyStorageDegraded("本地存储读取较慢，已进入临时恢复模式");
    }, HYDRATION_HARD_DEADLINE_MS);

    const runRehydrate = async () => {
      await ensureStorageReady();
      const rehydrateMain = useGameStore.persist.rehydrate();
      const rehydrateAchievements =
        (useAchievementsStore as { persist?: { rehydrate: () => Promise<unknown> } }).persist?.rehydrate?.() ??
        Promise.resolve();
      await Promise.all([Promise.resolve(rehydrateMain), Promise.resolve(rehydrateAchievements)]);
      await migrateLegacyVersecraftGameStateVolume();
    };

    // 禁止在 rehydrate 完成前 setHydrated(true)：否则 isGameStarted 等仍为初始 false，
    // /play 会立刻 replace 离开，表现为「进 play 又回首页/去铸造」。
    void runRehydrate().catch((error) => {
      console.warn("[HydrationProvider] Rehydrate deadline fallback activated:", error);
      rehydrateFailed = true;
      setStorageMode("degraded");
      notifyStorageDegraded("本地存储读取较慢，已进入临时恢复模式");
    }).finally(() => {
      settled = true;
      window.clearTimeout(softDeadlineId);
      window.clearTimeout(hardDeadlineId);
      if (!hardReleased) {
        if (!rehydrateFailed) setStorageMode("normal");
        setHydrated(true);
      }
    });
    return () => {
      settled = true;
      window.clearTimeout(softDeadlineId);
      window.clearTimeout(hardDeadlineId);
    };
  }, [setHydrated, setStorageMode]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-[calc(var(--vc-vh,1svh)_*_100)] flex-col items-center justify-center gap-4 bg-background text-foreground">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-[#e5ded3]" />
        <div className="h-4 w-36 animate-pulse rounded-lg bg-white/5" />
        <p className="text-sm text-slate-400">读取世界线中...</p>
      </div>
    );
  }

  return <>{children}</>;
}
