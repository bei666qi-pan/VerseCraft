"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";

export default function PlayLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);
  const user = useGameStore((s) => s.user);

  useEffect(() => {
    if (isHydrated) return;
    void Promise.resolve(useGameStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, [isHydrated, setHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace("/");
    }
  }, [isHydrated, user, router]);

  if (!isHydrated || !user) {
    return <main className="min-h-screen bg-black" />;
  }

  return <>{children}</>;
}
