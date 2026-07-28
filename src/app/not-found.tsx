import type { Metadata } from "next";
import Link from "next/link";
import { VerseCraftPaperDivider, VerseCraftPaperMark } from "@/components/VerseCraftPaperFrame";

export const metadata: Metadata = {
  title: "页面不存在",
  description: "你访问的页面不存在或已被移动。",
};

export default function NotFound() {
  return (
    <main className="vc-state-page">
      <section className="vc-state-panel max-w-[27rem]">
        <VerseCraftPaperMark className="mx-auto h-16 w-16" />
        <p className="vc-reading-serif mt-6 text-[clamp(3.6rem,18vw,5.4rem)] font-semibold leading-none tracking-[-0.08em] text-vc-seal" aria-hidden="true">
          404
        </p>
        <h1 className="vc-reading-serif mt-4 text-[clamp(1.8rem,7vw,2.25rem)] font-semibold leading-tight tracking-[-0.025em] text-vc-ink-deep">
          此页不在卷宗之中
        </h1>
        <VerseCraftPaperDivider className="mx-auto mt-5 w-[11rem]" />
        <p className="mx-auto mt-5 max-w-sm text-center text-sm leading-7 text-vc-ink-soft">
          你寻找的页面不存在，或已被移动。请回到首页继续你的故事。
        </p>
        <Link href="/" className="vc-primary-action mt-7">
          返回首页
        </Link>
      </section>
    </main>
  );
}
