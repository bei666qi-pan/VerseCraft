"use client";

import type { ChapterId, ChapterState } from "@/lib/chapters";
import { formatChapterTitle, selectChapterNavigatorItems } from "@/lib/chapters";

export function ChapterNavigator({
  open,
  chapterState,
  onClose,
  onReviewChapter,
  onReturnToActive,
}: {
  open: boolean;
  chapterState: ChapterState;
  onClose: () => void;
  onReviewChapter: (chapterId: ChapterId) => void;
  onReturnToActive: () => void;
}) {
  if (!open) return null;
  const items = selectChapterNavigatorItems(chapterState);
  return (
    <div className="absolute inset-x-3 bottom-[calc(7.8rem+env(safe-area-inset-bottom))] z-40">
      <section
        data-testid="chapter-navigator"
        className="rounded-[12px] border border-[#d39a70]/60 bg-[#06131d]/98 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.38),inset_0_0_24px_rgba(217,151,105,0.06)]"
        aria-label="章节导航"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="vc-reading-serif text-[22px] font-semibold leading-none text-[#ffd08b]">章节</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭章节导航"
            className="rounded-full border border-[#d39a70]/35 px-3 py-1 text-[14px] text-[#e7bb8f]"
          >
            关闭
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item) => {
            const disabled = !item.completed;
            const statusText = item.completed ? "可回顾" : item.active ? "当前推进中" : item.unlocked ? "已解锁" : "未解锁";
            const actionText = item.completed ? "回顾" : item.active ? "当前" : item.unlocked ? "待进入" : "锁定";
            return (
              <button
                key={item.definition.id}
                type="button"
                data-testid="chapter-nav-item"
                data-chapter-id={item.definition.id}
                disabled={disabled}
                aria-current={item.active || item.reviewing ? "page" : undefined}
                onClick={() => onReviewChapter(item.definition.id)}
                className={`flex min-h-[58px] w-full items-center justify-between rounded-[8px] border px-3 py-2 text-left transition ${
                  item.active || item.reviewing
                    ? "border-[#e5ad78]/80 bg-[#10202b] text-[#ffd08b] shadow-[0_0_18px_rgba(239,177,127,0.18)]"
                    : item.completed
                      ? "border-[#d39a70]/35 bg-[#071721] text-[#e7bb8f]"
                      : "border-[#38505d]/35 bg-[#05101a] text-[#7f8589]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block vc-reading-serif text-[17px] leading-none">
                    {formatChapterTitle(item.definition)}
                  </span>
                  <span className="mt-1 block truncate text-[12px]">
                    {statusText}
                  </span>
                </span>
                <span className="shrink-0 text-[13px]">{actionText}</span>
              </button>
            );
          })}
        </div>
        {chapterState.reviewChapterId ? (
          <button
            type="button"
            data-testid="chapter-return-current"
            onClick={onReturnToActive}
            className="mt-3 w-full rounded-full border border-[#d39a70]/45 px-4 py-2 vc-reading-serif text-[16px] text-[#ffd08b]"
          >
            回到当前章
          </button>
        ) : null}
      </section>
    </div>
  );
}
