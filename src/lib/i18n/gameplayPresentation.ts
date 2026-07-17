import { hasWrongPlayerFacingLanguage, type GameLanguage } from "./language";

export type LocalizedGameplayPresentation = {
  narrative: string;
  options: string[];
};

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

export function localizedCodexClassification(language: GameLanguage, type: "npc" | "anomaly" | null): string | null {
  if (type === "npc") return language === "en-US" ? "Person" : "人物";
  if (type === "anomaly") return language === "en-US" ? "Anomaly" : "异常";
  return null;
}
