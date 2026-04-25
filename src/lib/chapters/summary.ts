import type { ChapterDefinition, ChapterProgress, ChapterSummary, ChapterTurnSignals } from "./types";

function cleanLines(lines: readonly string[] | undefined, max = 5): string[] {
  if (!Array.isArray(lines)) return [];
  return Array.from(
    new Set(
      lines
        .map((line) => String(line ?? "").trim())
        .filter((line) => line.length > 0)
    )
  ).slice(0, max);
}

function fallbackResult(definition: ChapterDefinition, progress: ChapterProgress): string[] {
  if (definition.order === 1) {
    return ["你确认了当前区域存在异常。", "第一次行动已经留下可追踪的后果。"];
  }
  if (progress.stateChangeCount > 0) {
    return ["你沿着上一章的线索继续深入，并让局势发生了新的变化。"];
  }
  return ["你完成了本章目标的一段推进。"];
}

export function buildChapterSummary(input: {
  definition: ChapterDefinition;
  progress: ChapterProgress;
  signals: ChapterTurnSignals;
  completedAt?: number;
  nextObjective?: string;
}): ChapterSummary {
  const { definition, progress, signals } = input;
  const resultLines = cleanLines(signals.resultLines);
  const obtainedLines = cleanLines(signals.obtainedLines);
  const lostLines = cleanLines(signals.lostLines);
  const relationshipLines = cleanLines(signals.relationshipLines);
  const clueLines = cleanLines(signals.clueLines);
  return {
    chapterId: definition.id,
    title: definition.title,
    completedAt: input.completedAt ?? Date.now(),
    resultLines: resultLines.length > 0 ? resultLines : fallbackResult(definition, progress),
    obtainedLines,
    lostLines,
    relationshipLines,
    clueLines:
      clueLines.length > 0
        ? clueLines
        : definition.order === 1
          ? ["新的线索已经指向下一处调查点。"]
          : [],
    nextObjective: input.nextObjective ?? "沿着刚出现的线索继续深入。",
    hook: definition.endHook,
  };
}
