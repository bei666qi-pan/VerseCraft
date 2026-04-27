"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  INTRO_BRAND,
  INTRO_CTA,
  INTRO_DISABLED_CTA,
  INTRO_PAGE_SUBTITLE,
  INTRO_PAGE_TITLE,
  INTRO_WORLD_SLIDES,
  type IntroWorldSlide,
} from "./introContent";

function joinClass(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function BrandMark() {
  return (
    <span
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span className="absolute h-9 w-3 rounded-full bg-[#114c47]" />
      <span className="absolute h-3 w-9 rounded-full bg-[#114c47]" />
      <span className="absolute h-6 w-6 rotate-45 rounded-[2px] bg-[#114c47]" />
    </span>
  );
}

function SectionRule() {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#1d4d48]/30 to-[#1d4d48]/70" />
      <span className="h-3 w-3 rotate-45 bg-[#1d4d48]" />
    </span>
  );
}

function EmptyWorldCard({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={joinClass(
        "flex h-full w-full items-center justify-center rounded-[1.65rem] border border-[#d8d0c4]",
        "bg-[linear-gradient(145deg,#ece5db,#faf7f1_42%,#e9e1d5)]",
        "shadow-[inset_0_0_42px_rgba(32,69,63,0.08)]",
        isActive && "border-[#c9c1b4]"
      )}
      aria-hidden
    >
      <span className="h-20 w-20 rounded-full border border-[#d5cdc0]/70 bg-white/30" />
    </div>
  );
}

function WorldCard({
  slide,
  isActive,
  isSide = false,
  onIntro,
}: {
  slide: IntroWorldSlide;
  isActive: boolean;
  isSide?: boolean;
  onIntro?: () => void;
}) {
  return (
    <article
      data-testid={isActive ? "intro-world-card" : undefined}
      data-world-id={slide.id}
      className={joinClass(
        "relative h-full w-full overflow-hidden rounded-[1.65rem]",
        "shadow-[0_1.25rem_2.2rem_rgba(21,39,36,0.25)]",
        isSide && "opacity-90"
      )}
      aria-label={slide.title}
    >
      {slide.imageSrc ? (
        // Intentionally use a plain /assets/*.jpg path so the CDN suffix cache rule applies.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.imageSrc}
          alt={slide.imageAlt ?? slide.title}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <EmptyWorldCard isActive={isActive} />
      )}

      {slide.available && onIntro ? (
        <button
          type="button"
          data-testid="intro-world-info"
          onClick={onIntro}
          className="absolute right-[4.2%] top-[2.4%] inline-flex h-10 items-center gap-2 rounded-full border border-white/38 bg-white/18 px-4 text-[15px] font-medium text-white shadow-[inset_0_0_22px_rgba(255,255,255,0.12),0_8px_18px_rgba(0,0,0,0.12)] backdrop-blur-md transition hover:bg-white/24 active:scale-[0.98] min-[430px]:h-11 min-[430px]:text-[16px]"
        >
          <FileText size={17} strokeWidth={1.9} />
          世界观介绍
        </button>
      ) : null}
    </article>
  );
}

function IntroModal({
  slide,
  onClose,
}: {
  slide: IntroWorldSlide;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="intro-world-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#173b36]/28 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-world-modal-title"
    >
      <section className="relative w-full max-w-[360px] rounded-[1.6rem] border border-[#d8cfc1] bg-[#f8f4ed] px-6 py-7 text-[#163f3a] shadow-[0_1.5rem_3.5rem_rgba(32,50,47,0.28)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/86 text-[#173f3a] shadow-[0_0.45rem_1rem_rgba(26,46,42,0.16)] transition active:scale-95"
          aria-label="关闭世界观介绍"
        >
          <X size={20} strokeWidth={2.1} />
        </button>
        <p className="text-[13px] font-medium tracking-[0.24em] text-[#6c7771]">WORLD INTRO</p>
        <h2 id="intro-world-modal-title" className="vc-reading-serif mt-3 text-[32px] font-semibold">
          {slide.introTitle}
        </h2>
        <div className="mt-5 space-y-4 text-[15px] leading-7 text-[#40524e]">
          {slide.introBody.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function IntroPageClient() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isIntroOpen, setIsIntroOpen] = useState(false);

  const activeSlide = INTRO_WORLD_SLIDES[activeIndex];
  const previousSlide = INTRO_WORLD_SLIDES[(activeIndex - 1 + INTRO_WORLD_SLIDES.length) % INTRO_WORLD_SLIDES.length];
  const nextSlide = INTRO_WORLD_SLIDES[(activeIndex + 1) % INTRO_WORLD_SLIDES.length];
  const activeCtaLabel = activeSlide.available ? INTRO_CTA : INTRO_DISABLED_CTA;

  const dots = useMemo(() => INTRO_WORLD_SLIDES.map((slide) => slide.id), []);

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + INTRO_WORLD_SLIDES.length) % INTRO_WORLD_SLIDES.length);
    setIsIntroOpen(false);
  };

  const handleCta = () => {
    if (!activeSlide.available) return;
    router.push("/create");
  };

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f7f3ed] text-[#153f3a]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_51%_9%,rgba(255,255,255,0.9),transparent_15rem),radial-gradient(circle_at_50%_34%,rgba(40,86,78,0.08),transparent_19rem),linear-gradient(180deg,#f8f5ef_0%,#f1ece4_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 18%, transparent 0 34%, rgba(27,76,70,0.28) 34.2% 34.4%, transparent 34.6%), radial-gradient(circle at 50% 18%, transparent 0 48%, rgba(27,76,70,0.2) 48.2% 48.35%, transparent 48.6%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(1.05rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <button
            type="button"
            data-testid="intro-back-home"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-3 text-left text-[#133f3a] transition active:scale-[0.98]"
            aria-label="返回首页"
          >
            <BrandMark />
            <span className="vc-reading-serif text-[30px] font-semibold leading-none min-[430px]:text-[34px]">
              {INTRO_BRAND}
            </span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/82 text-[#172d2a] shadow-[0_0.55rem_1.05rem_rgba(31,38,35,0.18)] transition active:scale-95 min-[430px]:h-14 min-[430px]:w-14"
            aria-label="关闭"
          >
            <X size={29} strokeWidth={2.1} />
          </button>
        </header>

        <section className="mt-10 text-center min-[430px]:mt-12">
          <div className="flex items-center gap-4">
            <SectionRule />
            <h1 className="vc-reading-serif shrink-0 text-[35px] font-semibold leading-none tracking-[0.18em] text-[#153f3a] min-[430px]:text-[41px]">
              {INTRO_PAGE_TITLE}
            </h1>
            <SectionRule />
          </div>
          <p className="mt-4 text-[18px] font-medium tracking-[0.36em] text-[#76736f] min-[430px]:text-[20px]">
            {INTRO_PAGE_SUBTITLE}
          </p>
        </section>

        <section className="relative mt-10 flex flex-1 flex-col items-center min-[430px]:mt-12">
          <div className="relative h-[min(58dvh,34rem)] max-h-[34rem] min-h-[26rem] w-full">
            <div className="absolute left-1/2 top-0 h-full w-[82%] -translate-x-[164%] overflow-hidden rounded-[1.65rem] shadow-[0_1rem_2rem_rgba(21,39,36,0.22)]">
              <WorldCard slide={previousSlide} isActive={false} isSide />
            </div>
            <div className="absolute left-1/2 top-0 h-full w-[82%] translate-x-[64%] overflow-hidden rounded-[1.65rem] shadow-[0_1rem_2rem_rgba(21,39,36,0.22)]">
              <WorldCard slide={nextSlide} isActive={false} isSide />
            </div>
            <div className="absolute left-1/2 top-0 h-full w-[82%] -translate-x-1/2">
              <WorldCard
                slide={activeSlide}
                isActive
                onIntro={activeSlide.available ? () => setIsIntroOpen(true) : undefined}
              />
            </div>
          </div>

          <div className="mt-6 flex w-full items-center justify-center gap-7 text-[#cfc9c0]">
            <button
              type="button"
              data-testid="intro-carousel-prev"
              onClick={() => move(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/45 active:scale-95"
              aria-label="上一个世界观"
            >
              <ChevronLeft size={21} strokeWidth={1.6} />
            </button>
            <div className="flex items-center gap-4" aria-label="世界观分页">
              {dots.map((id, index) => (
                <button
                  key={id}
                  type="button"
                  data-testid="intro-carousel-dot"
                  data-active={index === activeIndex ? "true" : "false"}
                  onClick={() => {
                    setActiveIndex(index);
                    setIsIntroOpen(false);
                  }}
                  className={joinClass(
                    "h-2.5 w-2.5 rounded-full transition",
                    index === activeIndex ? "scale-125 bg-[#0b5a51]" : "bg-[#d7d1c8]"
                  )}
                  aria-label={`切换到第 ${index + 1} 个世界观`}
                  aria-current={index === activeIndex ? "true" : undefined}
                />
              ))}
            </div>
            <button
              type="button"
              data-testid="intro-carousel-next"
              onClick={() => move(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/45 active:scale-95"
              aria-label="下一个世界观"
            >
              <ChevronRight size={21} strokeWidth={1.6} />
            </button>
          </div>

          <button
            type="button"
            data-testid="intro-start-create"
            onClick={handleCta}
            disabled={!activeSlide.available}
            className={joinClass(
              "relative mt-8 flex h-[4.55rem] w-[82%] max-w-[22.5rem] items-center justify-center overflow-hidden rounded-full border text-center vc-reading-serif text-[31px] font-semibold leading-none tracking-[0.18em] shadow-[0_0.65rem_1.15rem_rgba(26,40,37,0.18)] transition min-[430px]:text-[35px]",
              activeSlide.available
                ? "border-white/80 bg-[linear-gradient(180deg,#163f3a,#08222a)] text-[#efe7df] active:scale-[0.985]"
                : "border-[#d6cec3] bg-[#e4ded4] text-[#9c9489]"
            )}
            aria-disabled={!activeSlide.available}
          >
            <span className="pointer-events-none absolute left-8 text-[#6b9089]/42" aria-hidden>
              ✦
            </span>
            <span className="relative z-10" data-testid="intro-start-create-label">
              {activeCtaLabel}
            </span>
            <span className="pointer-events-none absolute right-8 text-[#6b9089]/42" aria-hidden>
              ✦
            </span>
          </button>
        </section>
      </div>

      {isIntroOpen ? <IntroModal slide={activeSlide} onClose={() => setIsIntroOpen(false)} /> : null}
    </main>
  );
}
