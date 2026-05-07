import type { ChapterDefinition, ChapterId, ChapterState } from "./types";

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

const LEGACY_HARDCODED_TITLES = new Set(["门后回声"]);

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

export function getChapterStoredTitle(state: ChapterState | null | undefined, chapterId: ChapterId): string | null {
  return sanitizeChapterTitleCandidate(state?.chapterTitlesById?.[chapterId]);
}

export function getChapterDisplayName(
  definition: ChapterDefinition | null | undefined,
  state?: ChapterState | null
): string {
  if (!definition) return "暗月初醒";
  const stored = getChapterStoredTitle(state, definition.id);
  if (stored) return stored;
  if (definition.order === 1) return sanitizeChapterTitleCandidate(definition.title, 32) ?? definition.title;
  return "";
}

export function formatChapterTitle(
  definition: ChapterDefinition | null | undefined,
  state?: ChapterState | null
): string {
  if (!definition) return "第一章：暗月初醒";
  const orderText = `第${toChineseChapterOrder(definition.order)}章`;
  const title = getChapterDisplayName(definition, state);
  return title ? `${orderText}：${title}` : orderText;
}
