"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VerseCraft] Client error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-slate-100">
      <h1 className="text-xl font-semibold">加载出错</h1>
      <p className="mt-2 max-w-md text-center text-sm text-slate-400">
        页面渲染时发生异常。请尝试刷新或清除浏览器缓存后重试。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-xl bg-white/10 px-6 py-3 text-sm font-medium transition hover:bg-white/20"
      >
        重试
      </button>
      <a
        href="/"
        className="mt-4 text-sm text-slate-500 hover:text-slate-300"
      >
        返回首页
      </a>
    </main>
  );
}
