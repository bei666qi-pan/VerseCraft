import assert from "node:assert/strict";
import test from "node:test";
import { formatUserNarrativeForDisplay } from "./userNarrative";

test("formatUserNarrativeForDisplay: empty -> empty", () => {
  assert.equal(formatUserNarrativeForDisplay(""), "");
  assert.equal(formatUserNarrativeForDisplay("   "), "");
});

test("formatUserNarrativeForDisplay: keeps first-person sentences as-is", () => {
  const input = "我推开门观察四周。";
  assert.equal(formatUserNarrativeForDisplay(input), input);
});

test("formatUserNarrativeForDisplay: short question becomes natural utterance", () => {
  assert.equal(
    formatUserNarrativeForDisplay("上面是哪里"),
    "“上面是哪里？”"
  );
});

test("formatUserNarrativeForDisplay: question keeps existing question mark", () => {
  assert.equal(
    formatUserNarrativeForDisplay("上面是哪里？"),
    "“上面是哪里？”"
  );
});

test("formatUserNarrativeForDisplay: short action phrase gains first-person prefix", () => {
  assert.equal(formatUserNarrativeForDisplay("查看门锁"), "我查看门锁。");
});

test("formatUserNarrativeForDisplay: short statement gets terminal punctuation", () => {
  assert.equal(formatUserNarrativeForDisplay("停一下"), "停一下。");
});

