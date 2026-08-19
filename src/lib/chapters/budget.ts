import type { ChapterDefinition } from "./types";

export type ChapterNarrativeBudget = {
  targetTextChars: [number, number];
  hardTextChars: number;
};

/**
 * 章节叙事预算统一约束：
 *   - 任何章节正文（不含空白）必须落在 [2000, 5000] 字之间。
 *   - hardTextChars 为收口硬上限，超过由 narrative validator 截断/重写。
 *   - first/second 是开局与第二章的产品曲线偏短，但仍必须满足 2000 字下限。
 *   - 详见 CLAUDE.md §章节 Director 计划与字数约束 与 AGENTS.md §3.5。
 */
export const MIN_CHAPTER_NARRATIVE_CHARS = 2000;
export const MAX_CHAPTER_NARRATIVE_CHARS = 5000;
export const HARD_CHAPTER_NARRATIVE_CHARS = 5200;

const CHAPTER_TEXT_BUDGETS = {
  first: { targetTextChars: [MIN_CHAPTER_NARRATIVE_CHARS, 3500], hardTextChars: 4200 },
  second: { targetTextChars: [MIN_CHAPTER_NARRATIVE_CHARS, 4000], hardTextChars: 4500 },
  standard: { targetTextChars: [MIN_CHAPTER_NARRATIVE_CHARS, MAX_CHAPTER_NARRATIVE_CHARS], hardTextChars: HARD_CHAPTER_NARRATIVE_CHARS },
  climax: { targetTextChars: [2200, 4500], hardTextChars: HARD_CHAPTER_NARRATIVE_CHARS },
  ending: { targetTextChars: [2500, MAX_CHAPTER_NARRATIVE_CHARS], hardTextChars: HARD_CHAPTER_NARRATIVE_CHARS },
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
    ? Math.max(MIN_CHAPTER_NARRATIVE_CHARS + 20, Math.trunc(definition.hardTextChars))
    : CHAPTER_TEXT_BUDGETS.standard.hardTextChars;
  const [rawMin, rawMax] = definition.targetTextChars ?? CHAPTER_TEXT_BUDGETS.standard.targetTextChars;
  const min = Math.max(MIN_CHAPTER_NARRATIVE_CHARS, Math.min(hardTextChars - 20, Math.trunc(rawMin)));
  const max = Math.max(min + 20, Math.min(hardTextChars, Math.trunc(rawMax)));
  return { targetTextChars: [min, max], hardTextChars };
}
