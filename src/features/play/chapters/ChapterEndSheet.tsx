"use client";

import type { ChapterDefinition, ChapterState, ChapterSummary } from "@/lib/chapters";
import { formatChapterTitle, getChapterDisplayName } from "@/lib/chapters";
import { ChapterSummaryList } from "./ChapterSummaryList";

export function ChapterEndSheet({
  open,
  definition,
  chapterState,
  summary,
  hasNextChapter,
  hasPreviousChapter,
  onEnterNext,
  onReviewChapter,
  onReviewPrevious,
  onDismiss,
}: {
  open: boolean;
  definition: ChapterDefinition | null;
  chapterState?: ChapterState | null;
  summary: ChapterSummary | null;
  hasNextChapter: boolean;
  hasPreviousChapter: boolean;
  onEnterNext: () => void;
  onReviewChapter: () => void;
  onReviewPrevious: () => void;
  onDismiss: () => void;
}) {
  if (!open || !definition || !summary) return null;
  const displayTitle = summary.title || getChapterDisplayName(definition, chapterState);
  return (
    <div className="absolute inset-x-3 bottom-[calc(7.8rem+env(safe-area-inset-bottom))] z-50">
      <section
        data-testid="chapter-end-sheet"
        className="max-h-[68dvh] overflow-y-auto rounded-[16px] border border-[#d8d1c6] bg-[#fffdf8]/98 p-4 text-[#174d46] shadow-[0_18px_44px_rgba(73,63,51,0.16),inset_0_1px_0_rgba(255,255,255,0.92)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`${formatChapterTitle(definition, chapterState)} 章节留页`}
      >
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#ded8ce] pb-3">
          <div className="min-w-0">
            <p className="vc-reading-serif text-[18px] leading-none text-[#4f706a]">
              本章留页
            </p>
            <h2 className="mt-2 vc-reading-serif text-[26px] font-semibold leading-tight text-[#174d46]">
              {displayTitle || formatChapterTitle(definition, chapterState)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="暂时停在这里"
            className="shrink-0 rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-3 py-1 text-[14px] text-[#4f706a] shadow-[0_6px_14px_rgba(73,63,51,0.08)]"
          >
            暂时停在这里
          </button>
        </div>
        <ChapterSummaryList summary={summary} />
        <div className="mt-5 grid gap-2">
          {hasNextChapter ? (
            <button
              type="button"
              data-testid="chapter-next-button"
              onClick={onEnterNext}
              className="rounded-full border border-[#2f746a]/30 bg-[#2f746a] px-4 py-3 vc-reading-serif text-[18px] font-semibold text-[#fffdf8] shadow-[0_9px_18px_rgba(47,116,106,0.16)]"
            >
              继续下一章
            </button>
          ) : null}
          <button
            type="button"
            data-testid="chapter-review-button"
            onClick={onReviewChapter}
            className="rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-4 py-2.5 vc-reading-serif text-[16px] text-[#174d46] shadow-[0_6px_14px_rgba(73,63,51,0.08)]"
          >
            回看本章
          </button>
          {hasPreviousChapter ? (
            <button
              type="button"
              data-testid="chapter-previous-button"
              onClick={onReviewPrevious}
              className="rounded-full border border-[#d8d1c6] px-4 py-2.5 vc-reading-serif text-[16px] text-[#4f706a]"
            >
              回看上一章
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export const ChapterRecapSheet = ChapterEndSheet;
