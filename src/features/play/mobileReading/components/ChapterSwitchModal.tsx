"use client";

import { ChapterTocList } from "@/features/play/chapters";
import type { ChapterId, ChapterState } from "@/lib/chapters";
import { useGameStore } from "@/store/useGameStore";

function OrnamentLine({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[#9fb0aa] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#d8d1c6]" />
      <span className="text-[14px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#d8d1c6]" />
    </div>
  );
}

export function ChapterSwitchModal({
  chapterState,
  open,
  onClose,
  onSelectChapter,
}: {
  chapterState: ChapterState;
  open: boolean;
  onClose: () => void;
  onSelectChapter: (chapterId: ChapterId) => void;
}) {
  const language = useGameStore((state) => state.language);
  const isEnglish = language === "en-US";
  if (!open) return null;
  return (
    <div
      data-testid="chapter-switch-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#ede7de]/78 px-7 py-[max(2rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-switch-title"
    >
      <section className="relative w-full max-w-[360px] rounded-[24px] border border-[#d8d1c6] bg-vc-paper-bright/96 px-6 pb-8 pt-8 text-[#174d46] shadow-[0_18px_44px_rgba(73,63,51,0.16),inset_0_1px_0_rgba(255,255,255,0.92)]">
        <div className="pointer-events-none absolute inset-2 rounded-[21px] border border-[#ebe5dc]" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          data-testid="chapter-switch-close"
          className="absolute right-6 top-7 z-10 rounded-full border border-[#d8d1c6] bg-vc-paper-bright px-4 py-2 vc-reading-serif text-[16px] leading-none text-[#174d46] shadow-[0_6px_14px_rgba(73,63,51,0.1)] transition hover:bg-white active:scale-95"
        >
          {isEnglish ? "Close" : "关闭"}
        </button>
        <header className="text-center">
          <h2 id="chapter-switch-title" className="pointer-events-none vc-reading-serif text-[32px] font-semibold leading-none text-[#174d46]">
            {isEnglish ? "Switch chapter" : "切换章节"}
          </h2>
          <p className="mt-3 vc-reading-serif text-[16px] leading-none text-vc-ink-soft">
            {isEnglish ? "Scroll to view unlocked chapters" : "上滑查看已解锁章节"}
          </p>
        </header>
        <OrnamentLine className="mt-6" />
        <div
          data-testid="chapter-switch-list"
          className="relative mt-5 max-h-[54vh] overflow-y-auto pr-1 [scrollbar-color:#8fa79f_transparent] [scrollbar-width:thin]"
        >
          <ChapterTocList
            chapterState={chapterState}
            rowTestId="chapter-switch-item"
            allowEnterNext={false}
            titleStyle="dot"
            language={language}
            onReviewChapter={onSelectChapter}
            onReturnToActive={() => onSelectChapter(chapterState.activeChapterId)}
          />
        </div>
        <OrnamentLine className="mx-auto mt-7 w-[48%]" />
      </section>
    </div>
  );
}
