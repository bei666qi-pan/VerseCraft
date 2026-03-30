export const DISPLAY_NARRATIVE_FALLBACK = "本回合叙事数据异常，已自动拦截，请重试。";

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

export function isProtocolLeakLikeText(text: string): boolean {
  const t = String(text ?? "");
  if (!t) return false;

  if (/__VERSECRAFT_FINAL__/.test(t)) return true;
  // Tool-call / agent protocol leakage (e.g. MiniMax tool calls): should never be player-visible.
  if (/<\s*minimax:tool_call\b/i.test(t)) return true;
  if (/<\s*invoke\b/i.test(t)) return true;
  if (/<\s*end_turn\s*>/i.test(t)) return true;
  if (/\{\s*"is_action_legal"\s*:/.test(t)) return true;
  if (/"is_death"\s*:/.test(t)) return true;
  if (/"consumes_time"\s*:/.test(t)) return true;
  if (/"sanity_damage"\s*:/.test(t)) return true;

  const escapedNewline = countMatches(t, /\\n/g);
  const escapedQuote = countMatches(t, /\\"/g);
  if (escapedNewline >= 6 || escapedQuote >= 8 || escapedNewline + escapedQuote >= 12) return true;

  // 明显协议碎片形态：JSON 键值对与括号残片密集，且含 DM 核心键。
  if (/[{}]/.test(t) && /:\s*(true|false|\d+|".*?")/.test(t) && /is_action_legal|is_death|sanity_damage/.test(t)) {
    return true;
  }
  return false;
}

export function sanitizeDisplayedNarrative(raw: string): {
  text: string;
  blocked: boolean;
} {
  const t = String(raw ?? "").trim();
  if (!t) return { text: "", blocked: false };
  if (isProtocolLeakLikeText(t)) {
    return { text: DISPLAY_NARRATIVE_FALLBACK, blocked: true };
  }
  return { text: t, blocked: false };
}

export function sanitizeDisplayedOptionText(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (isProtocolLeakLikeText(t)) return "";
  return t;
}
