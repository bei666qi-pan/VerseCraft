"use client";

import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";

export default function OfflinePage(props: AppPageDynamicProps) {
  useClientPageDynamicProps(props);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f3ec] text-[#164f4d]">
      <div className="relative mb-6">
        <p className="relative text-6xl font-black tracking-tighter text-[#8d3f35]">
          ⚠
        </p>
      </div>
      <h1 className="vc-reading-serif text-[1.65rem] font-semibold leading-none text-[#0d5a4e]">
        连接已中断
      </h1>
      <p className="mt-4 max-w-xs text-center text-sm leading-relaxed text-[#4f625c]">
        如月公寓的信号被深渊吞噬。请检查网络连接后重试。
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        className="vc-reading-serif mt-8 rounded-[16px] border border-[#0a403a] bg-[#244f45] px-8 py-3 text-[1.05rem] font-semibold text-[#fffdf8] shadow-[inset_0_0_0_4px_rgba(255,255,255,0.08),0_10px_22px_rgba(27,79,69,0.18)] transition hover:bg-[#1c453d]"
      >
        重新连接
      </button>
    </main>
  );
}
