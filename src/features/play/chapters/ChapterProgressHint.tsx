"use client";

import type { ChapterDefinition, ChapterProgress } from "@/lib/chapters";

export function ChapterProgressHint({
  definition,
  progress,
}: {
  definition: ChapterDefinition;
  progress?: ChapterProgress;
}) {
  if (!progress || progress.status !== "active") return null;
  if (progress.turnCount < definition.targetTurns) return null;
  if (progress.stateChangeCount > 0 && progress.keyChoiceCount >= definition.minKeyChoices) return null;
  return (
    <div
      data-testid="chapter-progress-hint"
      className="mx-5 mb-2 rounded-[14px] border border-[#d8d1c6] bg-[#fffdf8]/92 px-4 py-3 vc-reading-serif text-[14px] leading-relaxed text-[#4f706a] shadow-[0_8px_18px_rgba(73,63,51,0.1)]"
    >
      这一章已经接近整理点。继续沿当前线索行动，系统会在状态沉淀后给出章末总结。
    </div>
  );
}
