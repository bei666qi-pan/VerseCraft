import assert from "node:assert/strict";
import test from "node:test";
import {
  autoParagraphizeNarrative,
  prepareStreamingNarrativeForRender,
  splitNarrativeIntoParas,
} from "./narrative";

test("prepareStreamingNarrativeForRender: strips trailing unclosed BLOOD open", () => {
  assert.equal(
    prepareStreamingNarrativeForRender("前{{BLOOD}}后"),
    "前后"
  );
});

test("prepareStreamingNarrativeForRender: keeps closed BLOOD block", () => {
  const s = "x{{BLOOD}}a{{/BLOOD}}y";
  assert.equal(prepareStreamingNarrativeForRender(s), s);
});

test("prepareStreamingNarrativeForRender: only last unclosed block is stripped", () => {
  assert.equal(
    prepareStreamingNarrativeForRender("{{BLOOD}}a{{/BLOOD}}{{BLOOD}}b"),
    "{{BLOOD}}a{{/BLOOD}}b"
  );
});

test("prepareStreamingNarrativeForRender: removes lone opening **", () => {
  assert.equal(prepareStreamingNarrativeForRender("foo**bar"), "foobar");
});

test("prepareStreamingNarrativeForRender: keeps paired **", () => {
  assert.equal(prepareStreamingNarrativeForRender("a**b**c"), "a**b**c");
});

test("prepareStreamingNarrativeForRender: leading lone **", () => {
  assert.equal(prepareStreamingNarrativeForRender("**x"), "x");
});

test("splitNarrativeIntoParas: prefers blank line paragraphs", () => {
  const p = splitNarrativeIntoParas("a\n\nb\n\nc");
  assert.deepEqual(p, ["a", "b", "c"]);
});

test("splitNarrativeIntoParas: falls back to single newline paragraphs when no blank lines", () => {
  const p = splitNarrativeIntoParas("a\nb\nc");
  assert.deepEqual(p, ["a", "b", "c"]);
});

test("autoParagraphizeNarrative: keeps short text unchanged", () => {
  const input = "你推开门，屋内很安静。";
  assert.equal(autoParagraphizeNarrative(input, { minParaChars: 60 }), input);
});

test("autoParagraphizeNarrative: keeps explicit paragraph text unchanged", () => {
  const input = "第一段。\n\n第二段。";
  assert.equal(autoParagraphizeNarrative(input, { minParaChars: 40 }), input);
});

test("autoParagraphizeNarrative: splits long text by sentence punctuation", () => {
  const input =
    "你沿着走廊缓慢前进，墙上的灯影在地面拉长，空气里混着潮气与金属味道。你在拐角停下脚步，先听见远处轻微的脚步回声，再看到门缝里一线晃动的光。你压低呼吸，把手掌贴在冰凉的墙面上，确认四周没有新的动静后，才继续向前。";
  const out = autoParagraphizeNarrative(input, { minParaChars: 55 });
  assert.match(out, /\n\n/);
  assert.equal(out.replace(/\n\n/g, ""), input);
});

test("autoParagraphizeNarrative: does not rewrite list-like lines", () => {
  const input =
    "1. 我先检查门锁是否完好。\n2. 我侧耳确认走廊是否有人。\n3. 我再决定是否开门。";
  assert.equal(autoParagraphizeNarrative(input, { minParaChars: 30 }), input);
});

test("autoParagraphizeNarrative: avoids splitting right before opening quote", () => {
  const input =
    "我刚要开口，门后传来急促脚步声，空气里的铁锈味更重了。 “别出声。”她压低嗓音提醒我，然后用手势示意我贴墙移动。";
  const out = autoParagraphizeNarrative(input, { minParaChars: 40 });
  assert.doesNotMatch(out, /。\s*\n\n\s*[“「『"]/);
});
