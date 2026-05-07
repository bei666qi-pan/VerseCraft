"use client";

import type { ChapterDefinition, ChapterProgress, ChapterState } from "@/lib/chapters";
import { formatChapterTitle } from "@/lib/chapters";

export function ChapterHeaderPill({
  definition,
  chapterState,
  progress,
  reviewing,
  onOpenNavigator,
  onReturnToActive,
}: {
  definition: ChapterDefinition;
  chapterState?: ChapterState | null;
  progress?: ChapterProgress;
  reviewing: boolean;
  onOpenNavigator: () => void;
  onReturnToActive: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-[#ded8ce] bg-[#fbf8f2]/96 px-4 py-2">
      <button
        type="button"
        data-testid="chapter-header-pill"
        onClick={onOpenNavigator}
        className="flex w-full items-center justify-between gap-3 rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-4 py-2 text-left shadow-[0_6px_14px_rgba(73,63,51,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] active:scale-[0.99]"
      >
        <span className="min-w-0">
          <span className="block vc-reading-serif text-[16px] leading-none text-[#174d46]">
            {reviewing ? "回看本章 · " : ""}
            {formatChapterTitle(definition, chapterState)}
          </span>
          <span className="mt-1 block truncate text-[12px] leading-none text-[#4f706a]/85">
            {progress?.lastObjectiveText ?? definition.objective}
          </span>
        </span>
        <span className="shrink-0 text-[13px] text-[#2f746a]">目录</span>
      </button>
      {reviewing ? (
        <button
          type="button"
          data-testid="chapter-return-current-inline"
          onClick={onReturnToActive}
          className="mt-2 w-full rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-3 py-1.5 vc-reading-serif text-[14px] text-[#174d46] active:scale-[0.99]"
        >
          回到正在阅读
        </button>
      ) : null}
    </div>
  );
}
