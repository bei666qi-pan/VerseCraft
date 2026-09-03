/**
 * 章节推进门控（Chapter Advance Gate）。
 *
 * 约束（CLAUDE.md §章节 Director 计划与字数约束 / AGENTS.md §2.3）：
 *   - 第一章是产品硬编码章节（标题固定为 `暗月初醒`），advance 无需 seed。
 *   - 第二章及之后：进入下一章之前必须存在有效的 `Director NextChapterSeed`。
 *     标题必须通过 `sanitizeChapterTitleCandidate`（即必须是 AI 生成的、可读、唯一）。
 *     Plan 的其他字段（promise / mainQuestion / emotionalTone / mustEchoMemoryIds /
 *     inheritedThreadIds）作为引导参考，不强制由 Writer 严格遵循。
 *   - gate 失败时 `shouldCompleteChapter` 直接返回 false，章节不会 advance；
 *     `pendingChapterEndId` 保持不变，玩家可继续累积叙事直到 Director 给出有效 plan。
 *
 * 这是纯函数，方便在 store / engine / live test 中复用，不引入任何随机或副作用。
 */
import type { ChapterDefinition, ChapterId, ChapterState } from "./types";
import type { PacingChapterState, NextChapterSeed } from "@/lib/chapters/pacing/types";
import { isUniqueChapterTitleKey } from "./engine";
import { sanitizeChapterTitleCandidate } from "./title";

export type ChapterAdvanceGateReason =
  | "director_plan_missing"
  | "director_title_missing"
  | "director_title_weak"
  | "director_title_duplicate"
  | "no_next_chapter_definition";

export type ChapterAdvanceGate =
  | { ok: true }
  | { ok: false; reason: ChapterAdvanceGateReason; detail?: string };

/**
 * 取章节的 Director plan（NextChapterSeed）。Director state 可能来自：
 *   - store 的 `state.chapterPacing.chapter`
 *   - 外部传入的 `PacingChapterState`
 *   - 测试里的纯函数调用
 */
export function pickDirectorNextChapterSeed(input: {
  directorChapter?: PacingChapterState | null;
}): NextChapterSeed | null {
  if (!input.directorChapter) return null;
  const seed = input.directorChapter.nextChapterSeed;
  if (!seed || typeof seed.title !== "string" || !seed.title.trim()) return null;
  return seed;
}

export function evaluateChapterAdvanceGate(input: {
  state: ChapterState;
  definition: ChapterDefinition;
  nextDefinition: ChapterDefinition | null;
  directorChapter?: PacingChapterState | null;
}): ChapterAdvanceGate {
  const { state, definition, nextDefinition, directorChapter } = input;

  // 第一章：产品硬编码章节，advance 无需 seed。
  if (definition.order === 1) {
    if (!nextDefinition) return { ok: false, reason: "no_next_chapter_definition" };
    return { ok: true };
  }

  if (!nextDefinition) return { ok: false, reason: "no_next_chapter_definition" };

  const seed = pickDirectorNextChapterSeed({ directorChapter });
  if (!seed) return { ok: false, reason: "director_plan_missing" };

  const sanitizedTitle = sanitizeChapterTitleCandidate(seed.title, 32);
  if (!sanitizedTitle) return { ok: false, reason: "director_title_missing" };
  if (!isUniqueChapterTitleKey(state, nextDefinition.id, sanitizedTitle)) {
    return { ok: false, reason: "director_title_duplicate", detail: sanitizedTitle };
  }

  return { ok: true };
}

export function summarizeAdvanceGate(gate: ChapterAdvanceGate): string {
  if (gate.ok) return "advance_gate:ok";
  return `advance_gate:blocked:${gate.reason}${gate.detail ? `:${gate.detail}` : ""}`;
}

/** 旧存档一次性回填：在 chapter ≥ 2 缺 title 时根据 narrative 派生出暂定 title。 */
export function deriveMigrationFallbackTitle(args: {
  chapterId: ChapterId;
  narrative?: string | null;
  resultLines?: readonly string[] | null;
  hook?: string | null;
}): string | null {
  const candidates = [
    args.narrative,
    ...(Array.isArray(args.resultLines) ? args.resultLines : []),
    args.hook,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizeChapterTitleCandidate(candidate, 32);
    if (sanitized && sanitized.length >= 2) return sanitized;
  }
  return null;
}
