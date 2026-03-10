"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";

const REHYDRATE_TIMEOUT_MS = 4000;

export default function HydrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isHydrated = useGameStore((state) => state.isHydrated);
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDeadlinePassed(true), REHYDRATE_TIMEOUT_MS);
    void Promise.resolve(useGameStore.persist.rehydrate())
      .finally(() => {
        clearTimeout(timeoutId);
        useGameStore.getState().setHydrated(true);
      });
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (deadlinePassed && !isHydrated) {
      useGameStore.getState().setHydrated(true);
    }
  }, [deadlinePassed, isHydrated]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        读取世界线中...
      </div>
    );
  }

  return <>{children}</>;
}
