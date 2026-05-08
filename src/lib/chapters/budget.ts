import type { ChapterDefinition } from "./types";

export type ChapterNarrativeBudget = {
  targetTextChars: [number, number];
  hardTextChars: number;
};

const CHAPTER_TEXT_BUDGETS = {
  first: { targetTextChars: [900, 1800], hardTextChars: 2200 },
  second: { targetTextChars: [1200, 2200], hardTextChars: 2600 },
  standard: { targetTextChars: [1200, 2400], hardTextChars: 3000 },
  climax: { targetTextChars: [1800, 3500], hardTextChars: 4200 },
  ending: { targetTextChars: [2200, 4000], hardTextChars: 5000 },
} as const satisfies Record<string, ChapterNarrativeBudget>;

export function resolveChapterNarrativeBudget(
  definition: Pick<ChapterDefinition, "order" | "kind" | "targetTextChars" | "hardTextChars"> | null | undefined
): ChapterNarrativeBudget {
  if (!definition) return CHAPTER_TEXT_BUDGETS.standard;
  if (definition.order === 1) return CHAPTER_TEXT_BUDGETS.first;
  if (definition.order === 2) return CHAPTER_TEXT_BUDGETS.second;
  if (definition.kind === "climax") return CHAPTER_TEXT_BUDGETS.climax;
  if (definition.kind === "ending") return CHAPTER_TEXT_BUDGETS.ending;
  const hardTextChars = Number.isFinite(definition.hardTextChars)
    ? Math.max(200, Math.trunc(definition.hardTextChars))
    : CHAPTER_TEXT_BUDGETS.standard.hardTextChars;
  const [rawMin, rawMax] = definition.targetTextChars ?? CHAPTER_TEXT_BUDGETS.standard.targetTextChars;
  const min = Math.max(80, Math.min(hardTextChars - 20, Math.trunc(rawMin)));
  const max = Math.max(min + 20, Math.min(hardTextChars, Math.trunc(rawMax)));
  return { targetTextChars: [min, max], hardTextChars };
}
