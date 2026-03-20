"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function PlayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VerseCraft /play] Error:", error?.message, error?.stack);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-slate-100">
      <h1 className="text-xl font-semibold">游戏加载出错</h1>
      <p className="mt-2 max-w-md text-center text-sm text-slate-400">
        {error?.message ?? "未知错误"}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-xl bg-white/10 px-6 py-3 text-sm font-medium transition hover:bg-white/20"
      >
        重试
      </button>
      <Link href="/" className="mt-4 text-sm text-slate-500 hover:text-slate-300">
        返回首页
      </Link>
    </main>
  );
}
