"use client";

import type { ChapterId, ChapterState, ChapterSummary } from "@/lib/chapters";
import { formatChapterTitle, selectChapterNavigatorItems } from "@/lib/chapters";

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitExcerpt(value: string): string[] {
  return value
    .split(/(?<=[。！？!?])\s+|(?<=[。！？!?])/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 2);
}

function getSummaryExcerpt(summary: ChapterSummary | undefined, active: boolean, unlocked: boolean): string {
  const direct = splitExcerpt(summary?.summaryForPlayer ?? "");
  if (direct.length > 0) return direct.join("");

  const fallback = splitExcerpt(
    [
      ...(Array.isArray(summary?.resultLines) ? summary.resultLines : []),
      ...(Array.isArray(summary?.clueLines) ? summary.clueLines : []),
      summary?.hook,
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(" ")
  );
  if (fallback.length > 0) return fallback.join("");

  if (active) return "这一章正在展开，新的回声还在纸页间等待回应。";
  if (unlocked) return "故事已经翻到这里，沿着上一章留下的回声继续读下去。";
  return "故事还没有写到这一页。";
}

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
  const items = selectChapterNavigatorItems(chapterState);
  return (
    <div className="absolute inset-x-3 bottom-[calc(7.8rem+env(safe-area-inset-bottom))] z-40">
      <section
        data-testid="chapter-navigator"
        className="rounded-[12px] border border-[#d39a70]/60 bg-[#06131d]/98 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.38),inset_0_0_24px_rgba(217,151,105,0.06)]"
        aria-label="小说目录"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="vc-reading-serif text-[22px] font-semibold leading-none text-[#ffd08b]">小说目录</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭小说目录"
            className="rounded-full border border-[#d39a70]/35 px-3 py-1 text-[14px] text-[#e7bb8f]"
          >
            关闭
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item) => {
            const canOpen = item.completed || item.active || item.reviewing || item.unlocked;
            const summary = chapterState.summariesByChapterId[item.definition.id];
            const statusText = item.active || item.reviewing ? "正在阅读" : item.completed ? "可回看" : item.unlocked ? "继续阅读" : "尚未写到";
            const actionText = item.active || item.reviewing ? "正在阅读" : item.completed ? "回看本章" : item.unlocked ? "继续阅读" : "未写到";
            const excerpt = getSummaryExcerpt(summary, item.active || item.reviewing, item.unlocked);
            return (
              <button
                key={item.definition.id}
                type="button"
                data-testid="chapter-nav-item"
                data-chapter-id={item.definition.id}
                disabled={!canOpen}
                aria-current={item.active || item.reviewing ? "page" : undefined}
                onClick={() => {
                  if (item.completed) {
                    onReviewChapter(item.definition.id);
                    return;
                  }
                  if (item.active || item.reviewing) {
                    onReturnToActive();
                    return;
                  }
                  if (item.unlocked) onEnterNext?.();
                }}
                className={`grid min-h-[74px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] border px-3 py-2 text-left transition ${
                  item.active || item.reviewing
                    ? "border-[#e5ad78]/80 bg-[#10202b] text-[#ffd08b] shadow-[0_0_18px_rgba(239,177,127,0.18)]"
                    : item.completed
                      ? "border-[#d39a70]/35 bg-[#071721] text-[#e7bb8f]"
                      : item.unlocked
                        ? "border-[#d39a70]/45 bg-[#091923] text-[#e7bb8f]"
                        : "border-[#38505d]/35 bg-[#05101a] text-[#7f8589]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block vc-reading-serif text-[17px] leading-tight">
                    {formatChapterTitle(item.definition)}
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-current/75">
                    {excerpt}
                  </span>
                </span>
                <span className="shrink-0 text-[13px]">{statusText === "正在阅读" ? statusText : actionText}</span>
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
            回到正在阅读
          </button>
        ) : null}
      </section>
    </div>
  );
}
