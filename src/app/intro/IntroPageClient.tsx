"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, FileText, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { useGameStore } from "@/store/useGameStore";
import { VerseCraftLogoMark } from "@/components/VerseCraftLogo";
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
  return <VerseCraftLogoMark className="h-8 w-8" priority sizes="32px" />;
}

function SectionRule() {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-vc-ink/30 to-vc-ink/70" />
      <span className="h-3 w-3 rotate-45 bg-vc-ink" />
    </span>
  );
}

function EmptyWorldCard({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={joinClass(
        "flex h-full w-full items-center justify-center rounded-[1.65rem] border border-vc-line",
        "bg-[linear-gradient(145deg,#ece5db,#faf7f1_42%,#e9e1d5)]",
        "shadow-[inset_0_0_42px_rgba(32,69,63,0.08)]",
        isActive && "border-vc-line-warm"
      )}
      aria-hidden
    >
      <span className="h-20 w-20 rounded-full border border-vc-line/70 bg-white/30" />
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
        // Intentionally use plain /assets/* paths (not next/image's /_next/image proxy) so the
        // CDN suffix cache rule applies to every format variant.
        <picture>
          {slide.imageBasePath ? (
            <>
              <source
                type="image/avif"
                srcSet={`${slide.imageBasePath}-480w.avif 480w, ${slide.imageBasePath}-720w.avif 720w, ${slide.imageBasePath}-940w.avif 940w`}
                sizes="(min-width: 1024px) 680px, 90vw"
              />
              <source
                type="image/webp"
                srcSet={`${slide.imageBasePath}-480w.webp 480w, ${slide.imageBasePath}-720w.webp 720w, ${slide.imageBasePath}-940w.webp 940w`}
                sizes="(min-width: 1024px) 680px, 90vw"
              />
            </>
          ) : null}
          <img
            src={slide.imageSrc}
            alt={slide.imageAlt ?? slide.title}
            className="h-full w-full object-cover"
            decoding="async"
            draggable={false}
          />
        </picture>
      ) : (
        <EmptyWorldCard isActive={isActive} />
      )}

      {slide.worldId === "xingni_taichu" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071a1c]/95 via-[#102c2d]/65 to-transparent px-6 pb-6 pt-24 text-[#fff8e7]" aria-hidden>
          <p className="text-[11px] font-semibold tracking-[.28em] text-[#f5dca3]">TAICHU REALM</p>
          <h3 className="mt-2 vc-reading-serif text-[30px] font-semibold tracking-[.1em]">星逆·太初</h3>
          <p className="mt-2 text-[13px] tracking-[.08em] text-[#fff8e7]/84">当前开放 · 青石县</p>
        </div>
      ) : null}

      {slide.available && onIntro ? (
        <button
          type="button"
          data-testid="intro-world-info"
          onClick={onIntro}
          className="absolute right-[4.2%] top-[2.4%] inline-flex h-10 items-center gap-2 rounded-full border border-vc-line-warm bg-vc-paper-bright px-4 text-[15px] font-semibold text-vc-ink vc-shadow-float transition hover:bg-vc-paper-raised active:scale-[0.98] min-[430px]:h-11 min-[430px]:text-[16px]"
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
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-[#efe8dd]/78 px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-world-modal-title"
    >
      <section className="relative w-full max-w-[360px] animate-fade-in-up rounded-[1.6rem] border border-vc-line-warm bg-vc-paper-raised px-6 py-7 text-vc-ink vc-shadow-modal">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-vc-paper-bright text-vc-ink vc-shadow-float transition active:scale-95"
          aria-label="关闭世界观介绍"
        >
          <X size={20} strokeWidth={2.1} />
        </button>
        <p className="text-[13px] font-medium tracking-[0.24em] text-vc-ink-faint">WORLD INTRO</p>
        <h2 id="intro-world-modal-title" className="vc-reading-serif mt-3 text-[32px] font-semibold text-vc-ink-deep">
          {slide.introTitle}
        </h2>
        <div className="mt-5 space-y-4 text-[15px] leading-7 text-vc-ink-soft">
          {slide.introBody.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function IntroPageClient({ xingniEnabled = true }: { xingniEnabled?: boolean }) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isIntroOpen, setIsIntroOpen] = useState(false);
  const [isNavPending, startNavTransition] = useTransition();
  const guestId = useGameStore((state) => state.guestId ?? "guest_intro");

  // 提前预取 /create 的 RSC payload 与 JS chunk：
  // CTA 点击后不再现场拉包，消除「进入公寓」的高延迟跳转
  useEffect(() => {
    router.prefetch("/create");
  }, [router]);

  const activeSlide: IntroWorldSlide = INTRO_WORLD_SLIDES[activeIndex];
  const activeAvailable = activeSlide.available && (activeSlide.worldId !== "xingni_taichu" || xingniEnabled);
  const previousSlide = INTRO_WORLD_SLIDES[(activeIndex - 1 + INTRO_WORLD_SLIDES.length) % INTRO_WORLD_SLIDES.length];
  const nextSlide = INTRO_WORLD_SLIDES[(activeIndex + 1) % INTRO_WORLD_SLIDES.length];
  const activeCtaLabel = activeAvailable
    ? (activeSlide.ctaLabel ?? INTRO_CTA)
    : activeSlide.worldId === "xingni_taichu"
      ? "暂不可进入"
      : INTRO_DISABLED_CTA;

  const dots = useMemo(() => INTRO_WORLD_SLIDES.map((slide) => slide.id), []);

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + INTRO_WORLD_SLIDES.length) % INTRO_WORLD_SLIDES.length);
    setIsIntroOpen(false);
  };

  const handleCta = () => {
    if (!activeAvailable || isNavPending) return;
    const worldId = activeSlide.worldId ?? "dark_moon_prologue";
    void trackGameplayEvent({
      eventName: "world_selected",
      sessionId: guestId,
      page: "/intro",
      source: "world_selector",
      payload: { worldId, mapId: worldId === "xingni_taichu" ? "xingni_qingshi_county" : "dark_moon_apartment" },
    }).catch(() => {});
    // useTransition 跟踪导航挂起态：点击即刻有视觉反馈，杜绝“点了没反应”
    startNavTransition(() => {
      router.push(`/create?world=${worldId}`);
    });
  };

  return (
    <main className="relative h-[100svh] min-h-[100svh] overflow-hidden bg-vc-paper text-vc-ink">
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

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[480px] flex-col px-5 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-[max(0.72rem,env(safe-area-inset-top))] lg:max-w-[720px]">
        <header className="flex items-center justify-between">
          <button
            type="button"
            data-testid="intro-back-home"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2.5 text-left text-vc-ink transition active:scale-[0.98]"
            aria-label="返回首页"
          >
            <BrandMark />
            <span className="vc-reading-serif text-[25px] font-semibold leading-none min-[430px]:text-[30px]">
              {INTRO_BRAND}
            </span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/82 text-vc-ink-deep vc-shadow-float transition active:scale-95 min-[430px]:h-12 min-[430px]:w-12"
            aria-label="关闭"
          >
            <X size={26} strokeWidth={2.1} />
          </button>
        </header>

        <section className="mt-[clamp(1.35rem,4.2svh,2.5rem)] animate-fade-in-up text-center">
          <div className="flex items-center gap-4">
            <SectionRule />
            <h1 className="vc-reading-serif shrink-0 text-[clamp(2rem,8.8vw,2.55rem)] font-semibold leading-none tracking-[0.18em] text-vc-ink-deep">
              {INTRO_PAGE_TITLE}
            </h1>
            <SectionRule />
          </div>
          <p className="mt-[clamp(0.65rem,2.1svh,1rem)] text-[clamp(1rem,4.4vw,1.25rem)] font-medium tracking-[0.36em] text-vc-ink-soft">
            {INTRO_PAGE_SUBTITLE}
          </p>
        </section>

        <section className="relative mt-[clamp(1.25rem,3.8svh,2.5rem)] flex min-h-0 flex-1 flex-col items-center">
          <div className="relative h-[clamp(19rem,45svh,31rem)] min-h-0 w-full lg:h-[clamp(24rem,52svh,34rem)]">
            <div className="absolute left-1/2 top-0 h-full w-[82%] -translate-x-[164%] overflow-hidden rounded-[1.65rem] shadow-[0_1rem_2rem_rgba(21,39,36,0.22)]">
              <WorldCard slide={previousSlide} isActive={false} isSide />
            </div>
            <div className="absolute left-1/2 top-0 h-full w-[82%] translate-x-[64%] overflow-hidden rounded-[1.65rem] shadow-[0_1rem_2rem_rgba(21,39,36,0.22)]">
              <WorldCard slide={nextSlide} isActive={false} isSide />
            </div>
            <div
              key={activeSlide.id}
              className="absolute left-1/2 top-0 h-full w-[82%] -translate-x-1/2"
            >
              <WorldCard
                slide={activeSlide}
                isActive
                onIntro={activeSlide.available ? () => setIsIntroOpen(true) : undefined}
              />
            </div>
          </div>

          <div className="mt-[clamp(0.85rem,2.4svh,1.5rem)] flex w-full items-center justify-center gap-7 text-vc-ink-faint">
            <button
              type="button"
              data-testid="intro-carousel-prev"
              onClick={() => move(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/45 hover:text-vc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vc-accent/60 active:scale-95"
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
                    "h-2.5 w-2.5 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vc-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vc-paper",
                    index === activeIndex ? "scale-125 bg-vc-accent" : "bg-vc-line hover:bg-vc-ink-faint"
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
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/45 hover:text-vc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vc-accent/60 active:scale-95"
              aria-label="下一个世界观"
            >
              <ChevronRight size={21} strokeWidth={1.6} />
            </button>
          </div>

          <button
            type="button"
            data-testid="intro-start-create"
            onClick={handleCta}
            disabled={!activeAvailable}
            data-pending={isNavPending ? "true" : undefined}
            className={joinClass(
              "group relative mt-[clamp(1rem,2.9svh,2rem)] flex h-[clamp(3.75rem,7.4svh,4.55rem)] w-[82%] max-w-[22.5rem] items-center justify-center overflow-hidden rounded-full border text-center vc-reading-serif text-[clamp(1.65rem,7.4vw,2.2rem)] font-semibold leading-none tracking-[0.18em] transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vc-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-vc-paper",
              activeAvailable
                ? joinClass(
                    "border-white/80 bg-[linear-gradient(180deg,#1a4741,#163f3a_38%,#08222a)] text-[#efe7df]",
                    "shadow-[0_0.65rem_1.15rem_rgba(26,40,37,0.20),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-8px_16px_rgba(4,18,22,0.55)]",
                    "hover:shadow-[0_0.9rem_1.6rem_rgba(26,40,37,0.28),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-8px_16px_rgba(4,18,22,0.5)] hover:brightness-[1.07]",
                    "active:scale-[0.982] active:brightness-95",
                    isNavPending && "brightness-[1.05] saturate-[0.92]"
                  )
                : "border-[#d6cec3] bg-[#e4ded4] text-[#9c9489] shadow-[0_0.65rem_1.15rem_rgba(26,40,37,0.1)]"
            )}
            aria-disabled={!activeAvailable}
            aria-busy={isNavPending || undefined}
          >
            {/* 悬停微光扫过 */}
            {activeAvailable ? (
              <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full" aria-hidden>
                <span className="absolute inset-y-0 left-[-55%] w-[42%] -skew-x-[18deg] bg-gradient-to-r from-transparent via-white/12 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[340%]" />
              </span>
            ) : null}
            <span
              className="pointer-events-none absolute left-8 flex items-center text-[#6b9089]/42 transition-opacity"
              aria-hidden
            >
              {isNavPending ? (
                <Loader2 size={22} strokeWidth={2.2} className="animate-spin text-[#9dbcb4]/80" />
              ) : (
                "✦"
              )}
            </span>
            <span className="relative z-10" data-testid="intro-start-create-label">
              {isNavPending ? "推门而入…" : activeCtaLabel}
            </span>
            <span
              className={joinClass(
                "pointer-events-none absolute right-8 text-[#6b9089]/42",
                isNavPending && "animate-breathe"
              )}
              aria-hidden
            >
              ✦
            </span>
          </button>
        </section>
      </div>

      {isIntroOpen ? <IntroModal slide={activeSlide} onClose={() => setIsIntroOpen(false)} /> : null}
    </main>
  );
}
