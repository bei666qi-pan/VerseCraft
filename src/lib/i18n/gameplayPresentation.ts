import { hasWrongPlayerFacingLanguage, type GameLanguage } from "./language";

export type LocalizedGameplayPresentation = {
  narrative: string;
  options: string[];
};

export type LocalizedStoryEntry = {
  index: number;
  content: string;
};

/** Player-facing fields that appear in the play surface and must share its language. */
export function hasWrongGameplayTurnLanguage(
  turn: { narrative?: unknown; options?: unknown; decision_options?: unknown },
  language: GameLanguage
): boolean {
  const texts = [
    turn.narrative,
    ...(Array.isArray(turn.options) ? turn.options : []),
    ...(Array.isArray(turn.decision_options) ? turn.decision_options : []),
  ];
  return texts.some((text) => typeof text === "string" && hasWrongPlayerFacingLanguage(text, language));
}

function compactText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * The language switch only changes presentation, never the authoritative game
 * state. This parser therefore accepts exactly the display fields it can safely
 * replace: the latest narrative and its actionable choices.
 */
export function parseLocalizedGameplayPresentation(
  raw: string,
  language: GameLanguage,
  expectedOptionCount: number
): { ok: true; value: LocalizedGameplayPresentation } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "not_object" };

  const record = parsed as Record<string, unknown>;
  const narrative = compactText(record.narrative, 6_000);
  const options = Array.isArray(record.options)
    ? record.options.map((option) => compactText(option, 240)).filter(Boolean)
    : [];

  if (!narrative) return { ok: false, reason: "missing_narrative" };
  if (expectedOptionCount > 0 && options.length !== expectedOptionCount) {
    return { ok: false, reason: "option_count_mismatch" };
  }
  if (options.some((option) => option.length < 2)) return { ok: false, reason: "invalid_option" };

  // English display copy must not silently retain Chinese source prose. IDs such
  // as B1 are unaffected by this check, while proper names are transliterated by
  // the localization prompt below.
  if ([narrative, ...options].some((text) => hasWrongPlayerFacingLanguage(text, language))) {
    return { ok: false, reason: "english_contains_cjk" };
  }

  return { ok: true, value: { narrative, options } };
}

/**
 * Parse a bounded language-switch history batch. Indices are supplied by the
 * client and must return one-for-one, so a late response can never overwrite
 * a different log entry after a save changes.
 */
export function parseLocalizedStoryEntries(
  raw: string,
  language: GameLanguage,
  expected: readonly LocalizedStoryEntry[]
): { ok: true; value: LocalizedStoryEntry[] } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const entries = parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).entries)
    ? (parsed as Record<string, unknown>).entries
    : null;
  if (!entries || entries.length !== expected.length) return { ok: false, reason: "entry_count_mismatch" };

  const expectedIndexes = expected.map((entry) => entry.index);
  const localized: LocalizedStoryEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return { ok: false, reason: "invalid_entry" };
    const record = entry as Record<string, unknown>;
    const index = Number(record.index);
    const content = compactText(record.content, 6_000);
    if (!Number.isInteger(index) || !expectedIndexes.includes(index) || !content) {
      return { ok: false, reason: "invalid_entry" };
    }
    if (hasWrongPlayerFacingLanguage(content, language)) {
      return { ok: false, reason: "english_contains_cjk" };
    }
    localized.push({ index, content });
  }
  if (new Set(localized.map((entry) => entry.index)).size !== expectedIndexes.length) {
    return { ok: false, reason: "duplicate_entry_index" };
  }
  return { ok: true, value: localized.sort((a, b) => a.index - b.index) };
}

export function localizedCodexClassification(language: GameLanguage, type: "npc" | "anomaly" | null): string | null {
  if (type === "npc") return language === "en-US" ? "Person" : "人物";
  if (type === "anomaly") return language === "en-US" ? "Anomaly" : "异常";
  return null;
}
