import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNarrativeLanguageInstruction,
  normalizeGameLanguage,
} from "./language";

test("normalizeGameLanguage defaults unknown persisted values to Chinese", () => {
  assert.equal(normalizeGameLanguage("en-US"), "en-US");
  assert.equal(normalizeGameLanguage("zh-TW"), "zh-CN");
  assert.equal(normalizeGameLanguage(null), "zh-CN");
});

test("English narrative instruction preserves JSON and canonical facts", () => {
  const instruction = buildNarrativeLanguageInstruction("en-US");
  assert.match(instruction, /field in English/i);
  assert.match(instruction, /JSON keys/i);
  assert.match(instruction, /canonical IDs/i);
});
