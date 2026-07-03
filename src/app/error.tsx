"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearVersecraftStorage } from "@/lib/resilientStorage";
import { VerseCraftPaperMark } from "@/components/VerseCraftPaperFrame";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[VerseCraft] Client error:", error);
  }, [error]);

  async function handleClearStorageAndHome() {
    await clearVersecraftStorage();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f3ec] p-6 text-[#164f4d]">
      <VerseCraftPaperMark className="h-16 w-16" />
      <h1 className="vc-reading-serif mt-6 text-[1.65rem] font-semibold leading-none text-[#0d5a4e]">
        页面加载出错
      </h1>
      <p className="mt-4 max-w-xs text-center text-sm leading-relaxed text-[#4f625c]">
        页面渲染时发生异常。请尝试刷新；若反复出现，可清除本机缓存后重试。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="vc-reading-serif mt-8 rounded-[16px] border border-[#0a403a] bg-[#244f45] px-8 py-3 text-[1.05rem] font-semibold text-[#fffdf8] shadow-[inset_0_0_0_4px_rgba(255,255,255,0.08),0_10px_22px_rgba(27,79,69,0.18)] transition hover:bg-[#1c453d]"
      >
        重试
      </button>
      <button
        type="button"
        onClick={handleClearStorageAndHome}
        className="mt-4 rounded-[16px] border border-[#c9a06a] bg-[#fffaf0] px-6 py-2.5 text-sm font-medium text-[#8d5a2b] transition hover:bg-[#fdf3e3]"
      >
        清除本机缓存并返回首页
      </button>
      <Link
        href="/"
        className="mt-5 text-sm text-[#7d8a84] underline-offset-4 transition hover:text-[#164f4d] hover:underline"
      >
        返回首页
      </Link>
    </main>
  );
}
