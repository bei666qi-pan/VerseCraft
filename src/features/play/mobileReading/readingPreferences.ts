import type { CSSProperties } from "react";

export type ReadingTextSize = "small" | "medium" | "large";
export type ReadingLineHeight = "compact" | "comfortable" | "relaxed";
export type ReadingRhythm = "slow" | "default" | "tight";
export type ReadingDensity = "brief" | "default" | "detailed";

export type ReadingPreferences = {
  textSize: ReadingTextSize;
  lineHeight: ReadingLineHeight;
  rhythm: ReadingRhythm;
  density: ReadingDensity;
};

export type ReadingPreferenceKey = keyof ReadingPreferences;

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  textSize: "medium",
  lineHeight: "comfortable",
  rhythm: "default",
  density: "default",
};

export const READING_PREFERENCE_GROUPS = [
  {
    key: "textSize",
    label: "字体",
    options: [
      { value: "small", label: "偏小" },
      { value: "medium", label: "标准" },
      { value: "large", label: "偏大" },
    ],
  },
  {
    key: "lineHeight",
    label: "行距",
    options: [
      { value: "compact", label: "紧凑" },
      { value: "comfortable", label: "舒适" },
      { value: "relaxed", label: "宽松" },
    ],
  },
  {
    key: "rhythm",
    label: "节奏",
    options: [
      { value: "slow", label: "舒缓" },
      { value: "default", label: "默认" },
      { value: "tight", label: "紧凑" },
    ],
  },
  {
    key: "density",
    label: "篇幅",
    options: [
      { value: "brief", label: "精简" },
      { value: "default", label: "默认" },
      { value: "detailed", label: "详写" },
    ],
  },
] as const satisfies readonly {
  key: ReadingPreferenceKey;
  label: string;
  options: readonly { value: string; label: string }[];
}[];

const TEXT_SIZE_VALUES: Record<ReadingTextSize, { story: string; option: string }> = {
  small: { story: "20px", option: "20px" },
  medium: { story: "22px", option: "22px" },
  large: { story: "24px", option: "23px" },
};

const LINE_HEIGHT_VALUES: Record<ReadingLineHeight, { story: string; option: string }> = {
  compact: { story: "40px", option: "1.08" },
  comfortable: { story: "46.64px", option: "1.18" },
  relaxed: { story: "52px", option: "1.28" },
};

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeReadingPreferences(raw: unknown): ReadingPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_READING_PREFERENCES };
  }
  const value = raw as Partial<Record<ReadingPreferenceKey, unknown>>;
  return {
    textSize: pickAllowed(value.textSize, ["small", "medium", "large"], DEFAULT_READING_PREFERENCES.textSize),
    lineHeight: pickAllowed(
      value.lineHeight,
      ["compact", "comfortable", "relaxed"],
      DEFAULT_READING_PREFERENCES.lineHeight
    ),
    rhythm: pickAllowed(value.rhythm, ["slow", "default", "tight"], DEFAULT_READING_PREFERENCES.rhythm),
    density: pickAllowed(value.density, ["brief", "default", "detailed"], DEFAULT_READING_PREFERENCES.density),
  };
}

export function setReadingPreferenceValue<K extends ReadingPreferenceKey>(
  preferences: ReadingPreferences,
  key: K,
  value: ReadingPreferences[K]
): ReadingPreferences {
  return normalizeReadingPreferences({ ...preferences, [key]: value });
}

export function readingPreferencesToCssVars(preferences: ReadingPreferences): CSSProperties {
  const normalized = normalizeReadingPreferences(preferences);
  const text = TEXT_SIZE_VALUES[normalized.textSize];
  const line = LINE_HEIGHT_VALUES[normalized.lineHeight];
  return {
    "--vc-story-font-size": text.story,
    "--vc-story-line-height": line.story,
    "--vc-option-font-size": text.option,
    "--vc-option-line-height": line.option,
  } as CSSProperties;
}
