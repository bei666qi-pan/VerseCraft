"use client";

import type { ChapterId, ChapterState } from "@/lib/chapters";
import { ChapterTocList } from "./ChapterTocList";

export function ChapterNavigator({
  open,
  chapterState,
  onClose,
  onReviewChapter,
  onReturnToActive,
  onEnterNext,
}: {
  open: boolean;
  chapterState: ChapterState;
  onClose: () => void;
  onReviewChapter: (chapterId: ChapterId) => void;
  onReturnToActive: () => void;
  onEnterNext?: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-x-3 bottom-[calc(7.8rem+env(safe-area-inset-bottom))] z-40">
      <section
        data-testid="chapter-navigator"
        className="rounded-[16px] border border-[#d8d1c6] bg-[#fffdf8]/98 p-4 text-[#174d46] shadow-[0_18px_44px_rgba(73,63,51,0.16),inset_0_1px_0_rgba(255,255,255,0.92)]"
        aria-label="小说目录"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="vc-reading-serif text-[22px] font-semibold leading-none text-[#174d46]">小说目录</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭小说目录"
            className="rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-3 py-1 text-[14px] text-[#4f706a] shadow-[0_6px_14px_rgba(73,63,51,0.08)]"
          >
            关闭
          </button>
        </div>
        <div
          data-testid="chapter-nav-list"
          className="max-h-[54vh] overflow-y-auto pr-1 [scrollbar-color:#8fa79f_transparent] [scrollbar-width:thin]"
        >
          <ChapterTocList
            chapterState={chapterState}
            rowTestId="chapter-nav-item"
            allowEnterNext
            titleStyle="colon"
            onReviewChapter={onReviewChapter}
            onReturnToActive={onReturnToActive}
            onEnterNext={onEnterNext}
          />
        </div>
        {chapterState.reviewChapterId ? (
          <button
            type="button"
            data-testid="chapter-return-current"
            onClick={onReturnToActive}
            className="mt-3 w-full rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-4 py-2 vc-reading-serif text-[16px] text-[#174d46] shadow-[0_6px_14px_rgba(73,63,51,0.08)]"
          >
            回到正在阅读
          </button>
        ) : null}
      </section>
    </div>
  );
}
