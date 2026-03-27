/**
 * 协议污染识别与净化（可在服务端 final 输出层复用）：
 * - 原则：状态层保守，展示层容错；
 * - 仅清洗 narrative 文本，不参与结构字段“脑补”。
 */

export type NarrativeLeakFlag =
  | "embedded_dm_key"
  | "second_object_tail"
  | "top_level_object_fragment"
  | "excessive_escape_sequences";

export interface NarrativeLeakAnalysis {
  flags: NarrativeLeakFlag[];
  hasLeak: boolean;
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

export function analyzeNarrativeLeak(text: string): NarrativeLeakAnalysis {
  const t = String(text ?? "");
  const flags = new Set<NarrativeLeakFlag>();
  if (!t) return { flags: [], hasLeak: false };

  if (
    /"is_death"\s*:/.test(t) ||
    /"sanity_damage"\s*:/.test(t) ||
    /"consumes_time"\s*:/.test(t) ||
    /"is_action_legal"\s*:/.test(t)
  ) {
    flags.add("embedded_dm_key");
  }

  if (/\}\s*\{\s*"is_action_legal"\s*:/.test(t) || /\n{1,3}\s*\{\s*"is_action_legal"\s*:/.test(t)) {
    flags.add("second_object_tail");
  }

  if (/^\s*\{\s*"is_action_legal"\s*:/.test(t) || /,\s*"is_action_legal"\s*:/.test(t)) {
    flags.add("top_level_object_fragment");
  }

  // 裸转义异常：大量 `\n` / `\"` 往往意味着协议残片直接透传。
  const escapedNewlineCount = countMatches(t, /\\n/g);
  const escapedQuoteCount = countMatches(t, /\\"/g);
  if (escapedNewlineCount >= 6 || escapedQuoteCount >= 8 || escapedNewlineCount + escapedQuoteCount >= 12) {
    flags.add("excessive_escape_sequences");
  }

  return { flags: [...flags], hasLeak: flags.size > 0 };
}

export function hasProtocolLeakSignature(text: string): boolean {
  return analyzeNarrativeLeak(text).hasLeak;
}

export function stripTrailingLeakedObject(text: string): string {
  const t = String(text ?? "");
  if (!t) return "";
  // 仅裁“换行后追加的第二段对象”，避免把正文内正常 `{...}` 误截断。
  const marker = t.search(/\n{1,3}\s*\{\s*"is_action_legal"\s*:/);
  if (marker <= 0) return t;
  return t.slice(0, marker).trimEnd();
}

function decodeEscapesLight(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export interface NarrativeSanitizeResult {
  narrative: string;
  degraded: boolean;
  flags: NarrativeLeakFlag[];
}

/**
 * 服务端 final 输出前净化 narrative：
 * 1) 先裁掉尾随第二段对象
 * 2) 再做轻量转义还原，避免 `\n\n` / `\"` 裸展示
 * 3) 仍命中泄漏特征则降级（不透传脏原文）
 */
export function sanitizeNarrativeLeakageForFinal(raw: string): NarrativeSanitizeResult {
  const original = String(raw ?? "");
  let cleaned = stripTrailingLeakedObject(original);
  cleaned = decodeEscapesLight(cleaned).trim();

  const post = analyzeNarrativeLeak(cleaned);
  if (!cleaned || post.hasLeak) {
    return {
      narrative: "本回合输出疑似协议污染，已拦截写回。请重试同一行动。",
      degraded: true,
      flags: post.flags.length > 0 ? post.flags : ["embedded_dm_key"],
    };
  }
  return { narrative: cleaned, degraded: false, flags: post.flags };
}
