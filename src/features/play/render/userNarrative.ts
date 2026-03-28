function hasTerminalPunct(s: string): boolean {
  return /[。！？!?…]$/.test(s.trim());
}

function ensureQuestionMark(s: string): string {
  const t = s.trim().replace(/[。!！…]+$/g, "");
  if (/[?？]$/.test(t)) return t;
  return `${t}？`;
}

function ensureStatementPunct(s: string): string {
  const t = s.trim();
  if (!t) return "";
  if (hasTerminalPunct(t)) return t;
  return `${t}。`;
}

function looksLikeQuestion(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/[?？]$/.test(t)) return true;
  if (t.length > 22) return false;
  return /(哪里|哪儿|哪位|哪个|哪条|哪边|怎么|为何|为什么|什么|是否|是不是|能不能|可以吗|行吗|对吗|吗|么|呢)$/.test(t);
}

function looksLikeActionPhrase(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.startsWith("我")) return false;
  return /^(查看|检查|观察|调查|搜索|翻找|打开|关上|进入|离开|前往|走向|靠近|后退|躲开|躲避|攻击|格挡|闪避|使用|装备|点燃|对话|询问)/.test(
    t
  );
}

/**
 * Formats player input for history display only.
 * - Does NOT change any gameplay logic.
 * - Keeps first-person full sentence as-is.
 * - Makes short questions/dialogue more natural.
 */
export function formatUserNarrativeForDisplay(content: string): string {
  const text = String(content ?? "").trim();
  if (!text) return "";

  // Already a first-person sentence; keep the user's voice.
  if (/^我[\u4e00-\u9fa5a-zA-Z0-9，。！？!?,.;:：\s]+$/.test(text)) return text;

  // Short, safe-ish plain input: turn it into natural utterance / action.
  if (/^[\u4e00-\u9fa5a-zA-Z0-9，。！？!?,.;:：\s]{1,40}$/.test(text)) {
    const compact = text.replace(/\s+/g, " ").trim();

    if (looksLikeQuestion(compact)) {
      const q = ensureQuestionMark(compact);
      return `“${q}”`;
    }

    if (looksLikeActionPhrase(compact)) {
      return ensureStatementPunct(`我${compact}`);
    }

    return ensureStatementPunct(compact);
  }

  return `你调整了行动节奏，继续向前推进。`;
}

const QUOTE_ONLY_DISPLAY = /^“([^”]+)”\s*$/;
const LEGACY_BLURT_DISPLAY = /^“([^”]+)”我脱口而出。\s*$/;
const MIN_QUOTED_UTTERANCE_LEN = 3;

/**
 * Inner text between curly quotes for display lines produced by {@link formatUserNarrativeForDisplay}
 * (short questions), or legacy `…我脱口而出。` lines.
 */
export function extractQuotedUtteranceForDedup(displayedUserLine: string): string | null {
  const t = String(displayedUserLine ?? "").trim();
  const m = QUOTE_ONLY_DISPLAY.exec(t) ?? LEGACY_BLURT_DISPLAY.exec(t);
  return m?.[1] ?? null;
}

export function shouldSuppressUserDisplayEntry(
  prevFormattedUser: string,
  nextAssistantNarrative: string
): boolean {
  const inner = extractQuotedUtteranceForDedup(prevFormattedUser);
  if (!inner || inner.trim().length < MIN_QUOTED_UTTERANCE_LEN) return false;
  const narrative = String(nextAssistantNarrative ?? "");
  return narrative.includes(`“${inner}”`);
}

export type PlayStoryDisplayEntryForDedup = {
  role: "assistant" | "user";
  content: string;
  logIndex: number;
};

/** Drops a user row when the following assistant narrative already embeds the same quoted line. */
export function filterDisplayEntriesForUserQuoteDedup(
  entries: readonly PlayStoryDisplayEntryForDedup[]
): PlayStoryDisplayEntryForDedup[] {
  const out: PlayStoryDisplayEntryForDedup[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]!;
    if (e.role === "user") {
      const formatted = formatUserNarrativeForDisplay(e.content);
      const next = entries[i + 1];
      if (
        next?.role === "assistant" &&
        shouldSuppressUserDisplayEntry(formatted, next.content)
      ) {
        continue;
      }
    }
    out.push(e);
  }
  return out;
}

