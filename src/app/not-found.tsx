import type { Metadata } from "next";
import Link from "next/link";
import { VerseCraftPaperMark } from "@/components/VerseCraftPaperFrame";

export const metadata: Metadata = {
  title: "页面不存在",
  description: "你访问的页面不存在或已被移动。",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f3ec] p-6 text-[#164f4d]">
      <VerseCraftPaperMark className="h-16 w-16" />
      <p className="vc-reading-serif mt-6 text-5xl font-black tracking-tighter text-[#8d3f35]" aria-hidden="true">
        404
      </p>
      <h1 className="vc-reading-serif mt-5 text-[1.65rem] font-semibold leading-none text-[#0d5a4e]">
        此页不在卷宗之中
      </h1>
      <p className="mt-4 max-w-xs text-center text-sm leading-relaxed text-[#4f625c]">
        你寻找的页面不存在，或已被移动。请回到首页继续你的故事。
      </p>
      <Link
        href="/"
        className="vc-reading-serif mt-8 rounded-[16px] border border-[#0a403a] bg-[#244f45] px-8 py-3 text-[1.05rem] font-semibold text-[#fffdf8] shadow-[inset_0_0_0_4px_rgba(255,255,255,0.08),0_10px_22px_rgba(27,79,69,0.18)] transition hover:bg-[#1c453d]"
      >
        返回首页
      </Link>
    </main>
  );
}
