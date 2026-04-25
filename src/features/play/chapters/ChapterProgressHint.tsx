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
      className="mx-4 mb-2 rounded-[8px] border border-[#d39a70]/28 bg-[#07131d]/82 px-3 py-2 vc-reading-serif text-[14px] leading-relaxed text-[#c99473]"
    >
      这一章已经接近整理点。继续沿当前线索行动，系统会在状态沉淀后给出章末总结。
    </div>
  );
}
