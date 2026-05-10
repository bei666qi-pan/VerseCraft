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

test("formatUserNarrativeForDisplay: long input is truncated with first-person prefix", () => {
  const longInput = "在这个混乱的走廊里我决定先把那扇看起来异常的门检查一遍然后再考虑要不要继续往更深处走因为这里的灯光实在太暗了让人很不安";
  const result = formatUserNarrativeForDisplay(longInput);
  assert.ok(result.startsWith("我"), `should start with 我, got: ${result}`);
  assert.ok(result.endsWith("。") || result.endsWith("…。"), `should end with punctuation, got: ${result}`);
  assert.ok(!result.includes("调整了行动节奏"), "must NOT contain legacy fallback text");
});

test("formatUserNarrativeForDisplay: input with emoji gets first-person wrapping, not fallback", () => {
  const input = "我打开那扇门🚪看看里面";
  const result = formatUserNarrativeForDisplay(input);
  assert.ok(!result.includes("调整了行动节奏"), "must NOT contain legacy fallback text");
  assert.ok(result.length > 0, "should not be empty");
});

test("formatUserNarrativeForDisplay: input over 40 chars with special chars avoids legacy fallback", () => {
  const input = "我决定先去「一楼大厅」看看有没有什么线索，这里的氛围太诡异了";
  const result = formatUserNarrativeForDisplay(input);
  assert.ok(!result.includes("调整了行动节奏"), "must NOT contain legacy fallback text");
  assert.ok(result.startsWith("我"), `should start with 我, got: ${result}`);
});

