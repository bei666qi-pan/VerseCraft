import test from "node:test";
import assert from "node:assert/strict";
import {
  DISPLAY_NARRATIVE_FALLBACK,
  sanitizeDisplayedNarrative,
  sanitizeDisplayedOptionText,
} from "@/features/play/render/sanitizeDisplayedNarrative";

test("display sanitizer blocks protocol fragment narrative", () => {
  const out = sanitizeDisplayedNarrative('正文 {"is_action_legal":true,"is_death":false}');
  assert.equal(out.blocked, true);
  assert.equal(out.text, DISPLAY_NARRATIVE_FALLBACK);
});

test("display sanitizer keeps normal narrative", () => {
  const out = sanitizeDisplayedNarrative("你缓慢推开门，尘埃在光里漂浮。");
  assert.equal(out.blocked, false);
  assert.equal(out.text, "你缓慢推开门，尘埃在光里漂浮。");
});

test("display sanitizer filters protocol-like option text", () => {
  assert.equal(sanitizeDisplayedOptionText('{"is_action_legal":true}'), "");
  assert.equal(sanitizeDisplayedOptionText("我沿着走廊继续前进"), "我沿着走廊继续前进");
});

test("display sanitizer blocks screenshot-like mixed leakage sample", () => {
  const raw =
    '你向前一步，耳边响起低语。,"is_death":false,"consumes_time":true}{"is_action_legal":true,"sanity_damage":0}';
  const out = sanitizeDisplayedNarrative(raw);
  assert.equal(out.blocked, true);
  assert.equal(out.text, DISPLAY_NARRATIVE_FALLBACK);
});

test("display sanitizer blocks excessive escaped fragments", () => {
  const raw = '文本\\n\\n\\n\\n\\n\\n\\"a\\" \\"b\\" \\"c\\" \\"d\\"';
  const out = sanitizeDisplayedNarrative(raw);
  assert.equal(out.blocked, true);
  assert.equal(out.text, DISPLAY_NARRATIVE_FALLBACK);
});
