"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BgmPlayer } from "@/components/BgmPlayer";

/** Client-side auth guard to avoid server redirect() which can trigger React hooks order issues (Next.js #78396) */
export function PlayAuthGuard({
  authorized,
  children,
}: {
  authorized: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!authorized) {
      router.replace("/");
    }
  }, [authorized, router]);

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f172a] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
          <p className="text-sm text-slate-400">验证身份中...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <BgmPlayer />
      {children}
    </>
  );
}
