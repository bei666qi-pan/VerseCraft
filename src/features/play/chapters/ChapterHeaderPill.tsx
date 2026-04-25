"use client";

import type { ChapterDefinition, ChapterProgress } from "@/lib/chapters";
import { formatChapterTitle } from "@/lib/chapters";

export function ChapterHeaderPill({
  definition,
  progress,
  reviewing,
  onOpenNavigator,
  onReturnToActive,
}: {
  definition: ChapterDefinition;
  progress?: ChapterProgress;
  reviewing: boolean;
  onOpenNavigator: () => void;
  onReturnToActive: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-[#b98563]/10 bg-[#03101a]/90 px-4 py-2">
      <button
        type="button"
        data-testid="chapter-header-pill"
        onClick={onOpenNavigator}
        className="flex w-full items-center justify-between gap-3 rounded-full border border-[#d39a70]/35 bg-[#07131d]/82 px-4 py-2 text-left shadow-[inset_0_0_14px_rgba(217,151,105,0.05)] active:scale-[0.99]"
      >
        <span className="min-w-0">
          <span className="block vc-reading-serif text-[16px] leading-none text-[#ffd08b]">
            {reviewing ? "回顾中 · " : ""}{formatChapterTitle(definition)}
          </span>
          <span className="mt-1 block truncate text-[12px] leading-none text-[#c99473]/85">
            {progress?.lastObjectiveText ?? definition.objective}
          </span>
        </span>
        <span className="shrink-0 text-[13px] text-[#e8ad79]">章节</span>
      </button>
      {reviewing ? (
        <button
          type="button"
          data-testid="chapter-return-current-inline"
          onClick={onReturnToActive}
          className="mt-2 w-full rounded-full border border-[#d39a70]/25 px-3 py-1.5 vc-reading-serif text-[14px] text-[#ffd08b] active:scale-[0.99]"
        >
          回到当前章
        </button>
      ) : null}
    </div>
  );
}
