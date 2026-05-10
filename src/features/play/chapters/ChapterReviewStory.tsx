"use client";

import { useMemo } from "react";
import type { ChapterReviewLogEntry, ChapterSummary } from "@/lib/chapters";
import { DMNarrativeBlock } from "@/features/play/render/narrative";
import {
  filterDisplayEntriesForUserQuoteDedup,
  formatUserNarrativeForDisplay,
} from "@/features/play/render/userNarrative";

function summaryFallbackLines(summary: ChapterSummary | null | undefined): string[] {
  if (!summary) return [];
  const lines = [
    summary.summaryForPlayer,
    ...(Array.isArray(summary.resultLines) ? summary.resultLines : []),
    ...(Array.isArray(summary.clueLines) ? summary.clueLines : []),
    summary.hook,
  ];
  return lines
    .map((line) => String(line ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function ChapterReviewStory({
  title,
  entries,
  summary,
  isLowSanity,
  isDarkMoon,
  onReturnToActive,
}: {
  title: string;
  entries: ChapterReviewLogEntry[];
  summary?: ChapterSummary | null;
  isLowSanity: boolean;
  isDarkMoon: boolean;
  onReturnToActive: () => void;
}) {
  const visibleEntries = useMemo(() => filterDisplayEntriesForUserQuoteDedup(entries), [entries]);
  const fallback = useMemo(() => summaryFallbackLines(summary), [summary]);

  return (
    <section
      data-testid="chapter-review-panel"
      className="px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+2rem+env(safe-area-inset-bottom))] pt-5"
      aria-label="章节留页"
    >
      <div>
        <div className="mb-4 border-b border-[#ded8ce] pb-3">
          <p className="vc-reading-serif text-[15px] leading-none text-[#4f706a]">章节留页，只读，不影响当前章节</p>
          <h2 className="mt-2 vc-reading-serif text-[26px] font-semibold leading-tight text-[#174d46]">
            {title}
          </h2>
        </div>
        <div data-testid="chapter-review-story" className="space-y-6 text-[#174d46]">
          {visibleEntries.length > 0 ? (
            visibleEntries.map((entry) =>
              entry.role === "user" ? (
                <p
                  key={entry.logIndex}
                  className="vc-reading-serif text-[var(--vc-story-font-size)] leading-[var(--vc-story-line-height)] tracking-normal text-[#174d46]"
                  style={{
                    fontSize: "var(--vc-story-font-size, 22px)",
                    lineHeight: "var(--vc-story-line-height, 46.64px)",
                  }}
                >
                  {formatUserNarrativeForDisplay(entry.content)}
                </p>
              ) : (
                <DMNarrativeBlock
                  key={entry.logIndex}
                  content={entry.content}
                  isDarkMoon={isDarkMoon}
                  isLowSanity={isLowSanity}
                />
              )
            )
          ) : fallback.length > 0 ? (
            fallback.map((line, index) => (
              <p key={`${index}-${line}`} className="vc-reading-serif text-[16px] leading-relaxed text-[#4f706a]">
                {line}
              </p>
            ))
          ) : (
            <p className="vc-reading-serif text-[16px] leading-relaxed text-[#4f706a]">
              这一章还没有留下可回看的正文。
            </p>
          )}
        </div>
        <button
          type="button"
          data-testid="chapter-return-current"
          onClick={onReturnToActive}
          className="mt-5 w-full rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-4 py-3 vc-reading-serif text-[17px] text-[#174d46] shadow-[0_6px_14px_rgba(73,63,51,0.1)]"
        >
          回到正在阅读
        </button>
      </div>
    </section>
  );
}
