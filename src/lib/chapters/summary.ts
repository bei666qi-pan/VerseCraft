import type { ChapterDefinition, ChapterProgress, ChapterSummary, ChapterTurnSignals } from "./types";

const DEFAULT_RECAP =
  "这一章的余波暂时停在这里。你已经在黑暗里留下了一个选择，新的回声正把故事推向下一页。";

function cleanLines(lines: readonly string[] | undefined, max = 5): string[] {
  if (!Array.isArray(lines)) return [];
  return Array.from(
    new Set(
      lines
        .map((line) => cleanParagraph(line, 220))
        .filter((line) => line.length > 0)
    )
  ).slice(0, max);
}

function cleanParagraph(value: unknown, max = 520): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function fallbackResult(definition: ChapterDefinition, progress: ChapterProgress): string[] {
  if (definition.order === 1) {
    return [
      "你已经确认这片空间并不安稳，第一道异常也在门缝与回声之间露出边缘。",
      "你的介入被世界记住了，它会在下一章继续回响。",
    ];
  }
  if (progress.stateChangeCount > 0) {
    return ["上一章留下的线索继续向深处延伸，局势也因此换了新的方向。"];
  }
  return ["这一章暂时停在一个可回望的顿点，仍有回声留给下一页。"];
}

function splitRecapParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}|(?<=[。！？!?])\s+/)
    .map((line) => cleanParagraph(line, 240))
    .filter(Boolean)
    .slice(0, 2);
}

function buildSummaryForPlayer(input: {
  definition: ChapterDefinition;
  progress: ChapterProgress;
  signals: ChapterTurnSignals;
  closeDecision?: {
    playerRecapCandidate?: string;
  } | null;
}): string {
  const decisionRecap = cleanParagraph(input.closeDecision?.playerRecapCandidate, 520);
  if (decisionRecap) return splitRecapParagraphs(decisionRecap).join("\n\n");

  const resultLines = cleanLines(input.signals.resultLines, 2);
  const clueLines = cleanLines(input.signals.clueLines, 2);
  const source = [...resultLines, ...clueLines];
  if (source.length > 0) return splitRecapParagraphs(source.join(" ")).join("\n\n");

  const fallback = fallbackResult(input.definition, input.progress);
  return splitRecapParagraphs(fallback.join(" ")).join("\n\n") || DEFAULT_RECAP;
}

export function buildChapterSummary(input: {
  definition: ChapterDefinition;
  progress: ChapterProgress;
  signals: ChapterTurnSignals;
  completedAt?: number;
  nextObjective?: string;
  closeDecision?: {
    playerRecapCandidate?: string;
  } | null;
}): ChapterSummary {
  const { definition, progress, signals } = input;
  const decisionRecap = cleanLines(
    input.closeDecision?.playerRecapCandidate ? [input.closeDecision.playerRecapCandidate] : [],
    1
  );
  const resultLines = decisionRecap.length > 0 ? decisionRecap : cleanLines(signals.resultLines);
  const obtainedLines = cleanLines(signals.obtainedLines);
  const lostLines = cleanLines(signals.lostLines);
  const relationshipLines = cleanLines(signals.relationshipLines);
  const clueLines = cleanLines(signals.clueLines);
  return {
    chapterId: definition.id,
    title: definition.title,
    completedAt: input.completedAt ?? Date.now(),
    summaryForPlayer: buildSummaryForPlayer(input),
    resultLines: resultLines.length > 0 ? resultLines : fallbackResult(definition, progress),
    obtainedLines,
    lostLines,
    relationshipLines,
    clueLines:
      clueLines.length > 0
        ? clueLines
        : definition.order === 1
          ? ["新的线索已经指向下一处可回望的暗处。"]
          : [],
    nextObjective: input.nextObjective ?? "沿着刚出现的线索继续深入。",
    hook: definition.endHook,
  };
}
