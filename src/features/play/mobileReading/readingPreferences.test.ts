import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_READING_PREFERENCES,
  normalizeReadingPreferences,
  readingPreferencesToCssVars,
  setReadingPreferenceValue,
} from "./readingPreferences";
import { useGameStore } from "@/store/useGameStore";

test("reading preferences normalize missing and invalid values to defaults", () => {
  assert.deepEqual(normalizeReadingPreferences(null), DEFAULT_READING_PREFERENCES);
  assert.deepEqual(
    normalizeReadingPreferences({
      textSize: "huge",
      lineHeight: "wide",
      rhythm: "rush",
      density: "long",
    }),
    DEFAULT_READING_PREFERENCES
  );
});

test("reading preferences map text size and line height to CSS variables", () => {
  const prefs = setReadingPreferenceValue(
    setReadingPreferenceValue(DEFAULT_READING_PREFERENCES, "textSize", "large"),
    "lineHeight",
    "relaxed"
  );
  const style = readingPreferencesToCssVars(prefs) as Record<string, string>;
  assert.equal(style["--vc-story-font-size"], "24px");
  assert.equal(style["--vc-story-line-height"], "52px");
  assert.equal(style["--vc-option-font-size"], "23px");
});

test("useGameStore stores reading preferences through the public action", () => {
  const previous = useGameStore.getState().readingPreferences;
  useGameStore.setState({ readingPreferences: { ...DEFAULT_READING_PREFERENCES } });
  useGameStore.getState().setReadingPreference("textSize", "small");
  useGameStore.getState().setReadingPreference("lineHeight", "compact");
  assert.equal(useGameStore.getState().readingPreferences.textSize, "small");
  assert.equal(useGameStore.getState().readingPreferences.lineHeight, "compact");
  useGameStore.setState({ readingPreferences: previous });
});
