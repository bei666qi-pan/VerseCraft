"use client";

import { useRouter } from "next/navigation";
import { VerseCraftDarkPageFrame } from "@/components/VerseCraftDarkPageFrame";
import { VerseCraftOrnament } from "@/components/VerseCraftOrnament";
import { INTRO_CTA, INTRO_PARAGRAPHS, INTRO_TITLE } from "./introContent";

function CardCorner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute h-11 w-11 border-[#b56c3c]/85 ${className}`}
      aria-hidden
    />
  );
}

export function IntroPageClient() {
  const router = useRouter();

  return (
    <VerseCraftDarkPageFrame contentClassName="flex min-h-[100dvh] flex-col px-7 pb-[calc(1.6rem+env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <button
        type="button"
        data-testid="intro-back-home"
        onClick={() => router.push("/")}
        className="inline-flex h-14 w-fit items-center gap-3 rounded-full border border-[#d1874a]/95 bg-[#07131d]/58 px-5 vc-reading-serif text-[24px] font-semibold leading-none text-[#e3a260] shadow-[0_0_18px_rgba(213,126,61,0.13),inset_0_0_12px_rgba(213,126,61,0.05)] transition hover:bg-[#0c1c28] active:scale-[0.98]"
      >
        <span className="text-[31px] leading-none">←</span>
        <span>回到首页</span>
      </button>

      <section className="flex flex-1 items-center justify-center py-8 min-[430px]:py-10">
        <article
          data-testid="intro-prologue-card"
          className="relative w-full max-w-[430px] rounded-[30px] border border-[#a7643b]/92 bg-[#080e12]/78 px-7 py-10 shadow-[0_0_32px_rgba(0,0,0,0.38),inset_0_0_34px_rgba(224,132,61,0.035)]"
        >
          <div className="pointer-events-none absolute inset-[7px] rounded-[24px] border border-[#b56c3c]/58" aria-hidden />
          <span
            className="pointer-events-none absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center border border-[#b56c3c]/90 bg-[#07131d]"
            aria-hidden
          >
            <span className="h-2 w-2 border border-[#d89354]" />
          </span>
          <CardCorner className="left-5 top-5 rounded-tl-[18px] border-l border-t" />
          <CardCorner className="right-5 top-5 rounded-tr-[18px] border-r border-t" />
          <CardCorner className="bottom-5 left-5 rounded-bl-[18px] border-b border-l" />
          <CardCorner className="bottom-5 right-5 rounded-br-[18px] border-b border-r" />

          <header className="relative z-10 text-center">
            <h1 className="vc-reading-serif text-[48px] font-semibold leading-none text-[#d9a160] drop-shadow-[0_0_12px_rgba(236,173,103,0.16)] min-[430px]:text-[54px]">
              {INTRO_TITLE}
            </h1>
            <VerseCraftOrnament className="mx-auto mt-7 w-[72%]" />
          </header>

          <div className="relative z-10 mt-12 space-y-10">
            {INTRO_PARAGRAPHS.map((paragraph, index) => (
              <section key={paragraph}>
                <p className="whitespace-pre-line vc-reading-serif text-[31px] font-semibold leading-[1.85] text-[#d7a05f] drop-shadow-[0_0_8px_rgba(214,142,79,0.12)] min-[430px]:text-[34px]">
                  {paragraph}
                </p>
                {index < INTRO_PARAGRAPHS.length - 1 ? (
                  <VerseCraftOrnament className="mx-auto mt-8 w-[88%]" />
                ) : null}
              </section>
            ))}
          </div>

          <button
            type="button"
            data-testid="intro-start-create"
            onClick={() => router.push("/create")}
            className="relative z-10 mt-12 flex h-[74px] w-full items-center justify-center overflow-hidden rounded-[18px] border border-[#d59253]/95 bg-[#392314]/82 vc-reading-serif text-[41px] font-semibold leading-none text-[#e8ad69] shadow-[0_0_20px_rgba(230,134,61,0.2),inset_0_0_24px_rgba(255,177,92,0.11)] transition hover:bg-[#432816] active:scale-[0.99]"
          >
            <span className="pointer-events-none absolute inset-x-10 bottom-0 h-5 bg-[#f6a047]/35 blur-xl" aria-hidden />
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[22px]" aria-hidden>
              ◇
            </span>
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[22px]" aria-hidden>
              ◇
            </span>
            <span className="relative z-10">{INTRO_CTA}</span>
          </button>
        </article>
      </section>
    </VerseCraftDarkPageFrame>
  );
}
