"use client";

import type { ChapterDefinition, ChapterSummary } from "@/lib/chapters";
import { formatChapterTitle } from "@/lib/chapters";
import { ChapterSummaryList } from "./ChapterSummaryList";

export function ChapterEndSheet({
  open,
  definition,
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
  summary: ChapterSummary | null;
  hasNextChapter: boolean;
  hasPreviousChapter: boolean;
  onEnterNext: () => void;
  onReviewChapter: () => void;
  onReviewPrevious: () => void;
  onDismiss: () => void;
}) {
  if (!open || !definition || !summary) return null;
  return (
    <div className="absolute inset-x-3 bottom-[calc(7.8rem+env(safe-area-inset-bottom))] z-50">
      <section
        data-testid="chapter-end-sheet"
        className="max-h-[68dvh] overflow-y-auto rounded-[14px] border border-[#d39a70]/70 bg-[#06131d]/98 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.42),0_0_26px_rgba(239,177,127,0.12),inset_0_0_24px_rgba(217,151,105,0.06)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`${formatChapterTitle(definition)}完成`}
      >
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#b98563]/25 pb-3">
          <div>
            <p className="vc-reading-serif text-[18px] leading-none text-[#ffd08b]">
              第{definition.order}章完成
            </p>
            <h2 className="mt-2 vc-reading-serif text-[26px] font-semibold leading-none text-[#ffbd7d]">
              {definition.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="暂收章末总结"
            className="rounded-full border border-[#d39a70]/35 px-3 py-1 text-[14px] text-[#e7bb8f]"
          >
            暂收
          </button>
        </div>
        <ChapterSummaryList summary={summary} />
        <div className="mt-5 grid gap-2">
          {hasNextChapter ? (
            <button
              type="button"
              data-testid="chapter-next-button"
              onClick={onEnterNext}
              className="rounded-full border border-[#e5ad78]/80 bg-[#151b20] px-4 py-3 vc-reading-serif text-[18px] font-semibold text-[#ffd08b] shadow-[0_0_20px_rgba(239,177,127,0.25)]"
            >
              进入下一章
            </button>
          ) : null}
          <button
            type="button"
            data-testid="chapter-review-button"
            onClick={onReviewChapter}
            className="rounded-full border border-[#d39a70]/45 px-4 py-2.5 vc-reading-serif text-[16px] text-[#e7bb8f]"
          >
            回顾本章
          </button>
          {hasPreviousChapter ? (
            <button
              type="button"
              data-testid="chapter-previous-button"
              onClick={onReviewPrevious}
              className="rounded-full border border-[#d39a70]/35 px-4 py-2.5 vc-reading-serif text-[16px] text-[#d6a07b]"
            >
              返回上一章
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
