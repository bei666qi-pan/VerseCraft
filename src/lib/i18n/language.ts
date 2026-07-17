export const GAME_LANGUAGES = ["zh-CN", "en-US"] as const;

export type GameLanguage = (typeof GAME_LANGUAGES)[number];

export function normalizeGameLanguage(value: unknown): GameLanguage {
  return value === "en-US" ? "en-US" : "zh-CN";
}

/**
 * A compact, request-scoped instruction. The world registry stays canonical;
 * only player-facing prose and action labels change language.
 */
export function buildNarrativeLanguageInstruction(language: GameLanguage): string {
  if (language === "en-US") {
    return [
      "【Response language · mandatory】Write every player-facing natural-language field in English: narrative, options, decision_options, task titles/descriptions, codex observations, and next_chapter_title_candidate.",
      "Keep canonical IDs and established proper names unchanged when they are identifiers. Preserve the JSON keys and all structured-data contracts exactly. Use natural English dialogue punctuation and keep the first-person POV.",
    ].join("\n");
  }
  return [
    "【响应语言·强制】所有面向玩家的自然语言字段使用简体中文：narrative、options、decision_options、任务标题/说明、图鉴 observation 与 next_chapter_title_candidate。",
    "canonical ID 与既有专有名词按事实源保留；JSON 键和全部结构化数据契约不得改变。保持第一人称叙事。",
  ].join("\n");
}

export function languageDisplayName(language: GameLanguage): string {
  return language === "en-US" ? "English" : "简体中文";
}
