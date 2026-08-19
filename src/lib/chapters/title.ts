import type { ChapterDefinition, ChapterId, ChapterState, ChapterSummary } from "./types";
import type { GameLanguage } from "@/lib/i18n/language";
import { getChapterDefinition } from "./definitions";

const CHINESE_ORDER_LABELS: Record<number, string> = {
  1: "一",
  2: "二",
  3: "三",
  4: "四",
  5: "五",
  6: "六",
  7: "七",
  8: "八",
  9: "九",
  10: "十",
};

const LEGACY_HARDCODED_TITLES = new Set(["门后回声", "沿当前线索继续推进", "继续推进当前线索"]);

/** Narrative-hook style lines misused as readable chapter subtitles in the shell header. */
export function isWeakChapterBookmarkSnippet(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/^新的线索/.test(t)) return true;
  if (/当前线索/.test(t) && /(继续|推进|深入|调查)/.test(t)) return true;
  if (/^(沿|顺着)?当前线索(继续)?(推进|深入|调查)?$/.test(t)) return true;
  if (/^(继续|推进|深入)(当前|本章|下一处)?线索/.test(t)) return true;
  if (/^上一章/.test(t)) return true;
  if (/沿着.*章/.test(t)) return true;
  if (/沿第[一二三四五六七八九十\d]+章/.test(t)) return true;
  if (/可回望/.test(t) && /新的线索|暗处/.test(t)) return true;
  if (/门后更深/.test(t)) return true;
  if (/指向下一处/.test(t)) return true;
  return false;
}

export function toChineseChapterOrder(order: number): string {
  const safe = Number.isFinite(order) ? Math.max(1, Math.trunc(order)) : 1;
  if (CHINESE_ORDER_LABELS[safe]) return CHINESE_ORDER_LABELS[safe]!;
  if (safe > 10 && safe < 20) return `十${CHINESE_ORDER_LABELS[safe - 10] ?? safe - 10}`;
  return String(safe);
}

export function sanitizeChapterTitleCandidate(value: unknown, maxChars = 24): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[`*_~#<>[\]{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^第[一二三四五六七八九十\d]+\s*章[：:、.\-\s]*/u, "")
    .replace(/^[《「“'"]+|[》」”'"]+$/g, "")
    .trim();
  if (!cleaned) return null;
  const clipped = cleaned.length <= maxChars ? cleaned : cleaned.slice(0, maxChars).trim();
  if (!clipped || LEGACY_HARDCODED_TITLES.has(clipped)) return null;
  return clipped;
}

function compactTitleSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (isWeakChapterBookmarkSnippet(value)) return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[《》「」『』“”"'`*_~#<>[\]{}\\]/g, "")
    .replace(/^(我|你|他|她|他们|她们|我们|玩家)?(确认|发现|看见|听见|找到|意识到|注意到|察觉到|走向|进入|离开|继续|沿着|打开|关上|靠近|询问|记录|留下|指向|面对|获得|失去|完成|更新|揭开)+/u, "")
    .replace(/[，。！？；：,.!?;:、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const first = cleaned.split(/\s+/).find((part) => part.trim().length >= 2) ?? cleaned;
  return sanitizeChapterTitleCandidate(first, 22);
}

export function deriveNextChapterTitleCandidate(input: {
  summary?: ChapterSummary | null;
  fallbackObjective?: string | null;
}): string | null {
  const summary = input.summary ?? null;
  const candidates = [
    input.fallbackObjective,
    summary?.nextObjective,
    ...(Array.isArray(summary?.resultLines) ? summary.resultLines : []),
    summary?.hook,
    ...(Array.isArray(summary?.clueLines) ? summary.clueLines : []),
  ];
  for (const candidate of candidates) {
    const title = compactTitleSource(candidate);
    if (title) return title;
  }
  return null;
}

export function getChapterStoredTitle(state: ChapterState | null | undefined, chapterId: ChapterId): string | null {
  return sanitizeChapterTitleCandidate(state?.chapterTitlesById?.[chapterId]);
}

export function getChapterDisplayName(
  definition: ChapterDefinition | null | undefined,
  state?: ChapterState | null,
  language: GameLanguage = "zh-CN"
): string {
  if (!definition) return language === "en-US" ? "Dark Moon Awakens" : "暗月初醒";
  if (language === "en-US") {
    const englishSeeds: Record<number, string> = { 1: "Dark Moon Awakens", 2: "Echoes Beyond the Door" };
    const stored = getChapterStoredTitle(state, definition.id);
    if (stored && !/[\u4e00-\u9fff]/.test(stored) && !isWeakChapterBookmarkSnippet(stored)) return stored;
    return englishSeeds[definition.order] ?? "";
  }
  const storedRaw = getChapterStoredTitle(state, definition.id);
  const stored = storedRaw && !isWeakChapterBookmarkSnippet(storedRaw) ? storedRaw : null;
  if (stored) return stored;
  if (definition.order === 1) return sanitizeChapterTitleCandidate(definition.title, 32) ?? definition.title;
  return "";
}

export function formatChapterTitle(
  definition: ChapterDefinition | null | undefined,
  state?: ChapterState | null,
  language: GameLanguage = "zh-CN"
): string {
  if (!definition) return language === "en-US" ? "Chapter 1: Dark Moon Awakens" : "第一章：暗月初醒";
  if (language === "en-US") {
    const title = getChapterDisplayName(definition, state, language);
    return title ? `Chapter ${definition.order}: ${title}` : `Chapter ${definition.order}`;
  }
  const orderText = `第${toChineseChapterOrder(definition.order)}章`;
  const title = getChapterDisplayName(definition, state);
  return title ? `${orderText}：${title}` : orderText;
}

/**
 * 把 Director 的 `nextChapterSeed.title` 落到 chapter ≥ 2 的 `chapterTitlesById[chapterId]`。
 * 第一章固定为 definition.title，绝不会被覆盖。
 *
 * 调用方：`recordChapterTurn` 末尾。属于纯函数：
 *   - 若当前章节已有 title，不做任何改动（标题稳定，避免覆盖已通过 seed 写入的合法标题）。
 *   - 若 Director 提供了非空且通过 sanitize 的 title，写入并返回新 map。
 *   - 否则返回原 map（`Map`/对象引用保持原样，便于 `Object.is` 比较）。
 */
export function ensureChapterTitleFromDirector(args: {
  state: ChapterState;
  chapterId: ChapterId;
  directorTitleCandidate: unknown;
}): { state: ChapterState; changed: boolean } {
  const { state, chapterId, directorTitleCandidate } = args;
  if (!state) return { state, changed: false };
  const existing = state.chapterTitlesById?.[chapterId];
  if (existing) return { state, changed: false };
  const definition = getChapterDefinitionForTitleFallback(chapterId);
  if (definition && definition.order === 1) return { state, changed: false };
  const sanitized = sanitizeChapterTitleCandidate(directorTitleCandidate, 32);
  if (!sanitized) return { state, changed: false };
  return {
    state: {
      ...state,
      chapterTitlesById: { ...(state.chapterTitlesById ?? {}), [chapterId]: sanitized },
    },
    changed: true,
  };
}

function getChapterDefinitionForTitleFallback(id: ChapterId) {
  try {
    return getChapterDefinition(id);
  } catch {
    return null;
  }
}
