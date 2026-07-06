/**
 * chapterContextPacket.ts — 章节余量信息包
 *
 * 在每回合 prompt 中注入当前章节的进度信息，让 AI DM 明确知道：
 * - 当前是第几章、共几章
 * - 本章已进行的回合数
 * - 本章预计剩余回合数
 * - 本章核心冲突/目标
 * - 章末钩子提示
 *
 * 这解决了调研报告中的「留存断层」问题：玩家需要叙事闭合感和阶段性目标。
 */

const CHAPTER_RE = /当前章节\[第(\d+)章\/(\d+)章\|(.+?)\|已进行(\d+)回合\|预计剩余(\d+)-(\d+)回合\|核心冲突:(.+?)(?:\||\])/;
const CHAPTER_SIMPLE_RE = /当前章节\[(.+?)\]/;

interface ParsedChapterInfo {
  currentChapter: number | null;
  totalChapters: number | null;
  chapterTitle: string | null;
  turnsElapsed: number | null;
  turnsRemainingMin: number | null;
  turnsRemainingMax: number | null;
  coreConflict: string | null;
  rawTag: string | null;
}

function parseChapterInfo(playerContext: string): ParsedChapterInfo {
  const m = playerContext.match(CHAPTER_RE);
  if (m) {
    return {
      currentChapter: Number.parseInt(m[1] ?? "0", 10) || null,
      totalChapters: Number.parseInt(m[2] ?? "0", 10) || null,
      chapterTitle: (m[3] ?? "").trim() || null,
      turnsElapsed: Number.parseInt(m[4] ?? "0", 10) || null,
      turnsRemainingMin: Number.parseInt(m[5] ?? "0", 10) || null,
      turnsRemainingMax: Number.parseInt(m[6] ?? "0", 10) || null,
      coreConflict: (m[7] ?? "").trim() || null,
      rawTag: m[0],
    };
  }
  // Fallback: try simple format
  const sm = playerContext.match(CHAPTER_SIMPLE_RE);
  return {
    currentChapter: null,
    totalChapters: null,
    chapterTitle: sm ? (sm[1] ?? "").trim() : null,
    turnsElapsed: null,
    turnsRemainingMin: null,
    turnsRemainingMax: null,
    coreConflict: null,
    rawTag: sm ? sm[0] : null,
  };
}

function clamp(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + "…";
}

/**
 * 构建章节余量提示块。
 * 告诉 AI DM 当前叙事处于哪个阶段、还有多少空间、以及章末应该如何处理。
 */
export function buildChapterContextPacket(args: {
  playerContext: string;
  maxChars?: number;
}): string {
  const info = parseChapterInfo(args.playerContext);
  if (!info.rawTag && !info.chapterTitle) return "";

  const maxChars = args.maxChars ?? 400;
  const lines: string[] = [];

  if (info.currentChapter && info.totalChapters) {
    const progressPercent = Math.round((info.currentChapter / info.totalChapters) * 100);

    lines.push(`当前章节：第 ${info.currentChapter} 章 / 共 ${info.totalChapters} 章（整体进度 ${progressPercent}%）`);

    if (info.chapterTitle) {
      lines.push(`本章标题：${info.chapterTitle}`);
    }

    if (info.coreConflict) {
      lines.push(`本章核心冲突：${info.coreConflict}`);
    }

    if (info.turnsElapsed !== null && info.turnsRemainingMin !== null) {
      const remainingHint =
        info.turnsRemainingMax && info.turnsRemainingMax > info.turnsRemainingMin
          ? `${info.turnsRemainingMin}-${info.turnsRemainingMax}`
          : `${info.turnsRemainingMin}`;

      lines.push(`本章已进行 ${info.turnsElapsed} 回合，预计剩余约 ${remainingHint} 回合`);

      // 动态章末指导
      if (info.turnsRemainingMin <= 2) {
        lines.push("【章末阶段】距离本章结束很近。请开始收束线索、推进核心冲突至高潮或转折点。");
        lines.push("章末回合应包含：关键 reveal 或重大后果、人物态度明确变化、下一章的悬念钩子。");
      } else if (info.turnsRemainingMin <= 5) {
        lines.push("【章中后期】核心冲突应在推进中。每次调查/对话应提供可验证的新线索。");
      } else {
        lines.push("【章初/章中】可以铺陈氛围、建立人物关系、设置伏笔。不急于揭示核心真相。");
      }
    }
  } else if (info.chapterTitle) {
    lines.push(`当前章节：${info.chapterTitle}`);
  }

  if (lines.length === 0) return "";
  const fullText = `## 【章节进度 — 叙事节奏参考】\n${lines.join("\n")}`;
  return clamp(fullText, maxChars);
}

/**
 * 紧凑版：仅保留最关键信息
 */
export function buildChapterContextPacketCompact(args: {
  playerContext: string;
  maxChars?: number;
}): string {
  const info = parseChapterInfo(args.playerContext);
  if (!info.currentChapter && !info.chapterTitle) return "";

  const maxChars = args.maxChars ?? 160;
  const parts: string[] = [];

  if (info.currentChapter) {
    parts.push(`第${info.currentChapter}/${info.totalChapters ?? "?"}章`);
  }
  if (info.turnsRemainingMin !== null) {
    const tag =
      info.turnsRemainingMin <= 2 ? "章末" :
        info.turnsRemainingMin <= 5 ? "章中后" : "章中";
    parts.push(`余~${info.turnsRemainingMin}回(${tag})`);
  }
  if (info.coreConflict) {
    parts.push(info.coreConflict.slice(0, 20));
  }

  const fullText = `【章节】${parts.join(" | ")}`;
  return clamp(fullText, maxChars);
}
