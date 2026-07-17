"use client";

import { selectChapterTocRows, type ChapterId, type ChapterState, type ChapterTocRow } from "@/lib/chapters";
import { formatChapterTitle } from "@/lib/chapters";
import type { GameLanguage } from "@/lib/i18n/language";

function displayRowTitle(row: ChapterTocRow, titleStyle: "colon" | "dot", language: GameLanguage): string {
  const title = language === "en-US" ? formatChapterTitle(row.definition, undefined, language) : row.title;
  return titleStyle === "dot" ? title.replace("：", "·") : title;
}

/**
 * 章节目录的唯一行渲染实现。`ChapterNavigator`（小说目录内嵌面板）与
 * `ChapterSwitchModal`（设置里的切换章节弹窗）都只负责各自的外层容器，
 * 具体每一行的状态判断、文案与交互全部来自这里 + `selectChapterTocRows`。
 */
export function ChapterTocList({
  chapterState,
  rowTestId = "chapter-toc-item",
  allowEnterNext = true,
  titleStyle = "colon",
  language = "zh-CN",
  onReviewChapter,
  onReturnToActive,
  onEnterNext,
}: {
  chapterState: ChapterState;
  /** 行元素的 data-testid；两个入口各自沿用原有的 `chapter-nav-item` / `chapter-switch-item`。 */
  rowTestId?: string;
  /** 设置里的切换章节弹窗不允许从这里"跳到下一章"，只允许回看/返回；小说目录允许。 */
  allowEnterNext?: boolean;
  /** 设置弹窗历史上用"·"分隔标题，小说目录用原始的"："。 */
  titleStyle?: "colon" | "dot";
  language?: GameLanguage;
  onReviewChapter: (chapterId: ChapterId) => void;
  onReturnToActive: () => void;
  onEnterNext?: () => void;
}) {
  const rows = selectChapterTocRows(chapterState);
  return (
    <div className="divide-y divide-[#ded8ce]">
      {rows.map((row) => {
        const blockedForward = row.action === "enter" && !allowEnterNext;
        const selectable = row.selectable && !blockedForward;
        const highlight = row.status === "current" || row.status === "reviewing";
        return (
          <button
            key={row.id}
            type="button"
            data-testid={rowTestId}
            data-chapter-id={row.id}
            data-chapter-status={row.status}
            disabled={!selectable}
            aria-current={highlight ? "page" : undefined}
            onClick={() => {
              if (!selectable) return;
              if (row.action === "review") onReviewChapter(row.id);
              else if (row.action === "return") onReturnToActive();
              else if (row.action === "enter") onEnterNext?.();
            }}
            className={`flex min-h-[84px] w-full items-center justify-between gap-4 py-4 text-left transition ${
              highlight
                ? "my-2 rounded-[14px] border border-[#d8d1c6] bg-[#f4f6f2] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                : selectable
                  ? "px-4 text-[#174d46] hover:bg-[#f6f2ec] active:scale-[0.99]"
                  : "px-4 text-[#8b8a84] opacity-70"
            }`}
          >
            <span className="min-w-0">
              <span className="block vc-reading-serif text-[19px] font-semibold leading-tight">
                {displayRowTitle(row, titleStyle, language)}
              </span>
              <span className="mt-1 block vc-reading-serif text-[13px] leading-none text-[#6c7f79]">
                {language === "en-US" ? ({ reviewing: "Reviewing", current: "Current chapter", completed: "Unlocked · Review", unlocked: "Unlocked", locked: "Locked" } as const)[row.status] : row.statusLabel}
              </span>
              {row.excerpt ? (
                <span className="mt-1.5 block text-[12px] leading-relaxed text-current/75">{row.excerpt}</span>
              ) : null}
            </span>
            <span
              className={`shrink-0 vc-reading-serif text-[15px] ${
                highlight ? "rounded-full border border-[#cfc8bc] bg-vc-paper-bright px-3 py-1" : ""
              }`}
            >
              {language === "en-US" ? ({ review: "Review", return: "Return", enter: "Continue", none: row.status === "locked" ? "Not yet" : "Reading" } as const)[row.action] : row.actionLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
