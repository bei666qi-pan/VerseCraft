"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";

export default function HydrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isHydrated = useGameStore((state) => state.isHydrated);

  useEffect(() => {
    void Promise.resolve(useGameStore.persist.rehydrate()).then(() => {
      useGameStore.getState().setHydrated(true);
    });
  }, []);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        读取世界线中...
      </div>
    );
  }

  return <>{children}</>;
}
