"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";

export function GameProvider({ children }: { children: React.ReactNode }) {
  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);

  useEffect(() => {
    void Promise.resolve(useGameStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, [setHydrated]);

  if (!isHydrated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <p className="animate-pulse text-lg text-neutral-400">
          Forging Possibilities...
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
