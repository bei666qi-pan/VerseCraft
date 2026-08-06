import test from "node:test";
import assert from "node:assert/strict";
import { isLikelyValidDMJson, sanitizeAssistantContent } from "./fallback";

test("isLikelyValidDMJson: valid DM JSON with narrative returns true", () => {
  assert.equal(
    isLikelyValidDMJson(JSON.stringify({ narrative: "test", is_action_legal: true, sanity_damage: 0, is_death: false })),
    true
  );
});

test("isLikelyValidDMJson: missing narrative key returns false", () => {
  assert.equal(isLikelyValidDMJson(JSON.stringify({ is_action_legal: true })), false);
});

test("isLikelyValidDMJson: empty string returns false", () => {
  assert.equal(isLikelyValidDMJson(""), false);
});

test("isLikelyValidDMJson: invalid JSON returns false", () => {
  assert.equal(isLikelyValidDMJson("{broken"), false);
});

test("isLikelyValidDMJson: non-string narrative returns false", () => {
  assert.equal(isLikelyValidDMJson(JSON.stringify({ narrative: 123 })), false);
});

test("sanitizeAssistantContent: valid DM JSON passes through unchanged", () => {
  const valid = JSON.stringify({ narrative: "hello", is_action_legal: true, sanity_damage: 0, is_death: false });
  assert.equal(sanitizeAssistantContent(valid), valid);
});

test("sanitizeAssistantContent: plain text wrapped into minimal DM JSON", () => {
  const result = sanitizeAssistantContent("plain text content");
  const parsed = JSON.parse(result);
  assert.equal(parsed.is_action_legal, true);
  assert.equal(parsed.sanity_damage, 0);
  assert.equal(parsed.narrative, "plain text content");
  assert.equal(parsed.is_death, false);
  assert.equal(parsed.consumes_time, true);
});

test("sanitizeAssistantContent: long text truncated to 500 chars", () => {
  const long = "x".repeat(1000);
  const result = sanitizeAssistantContent(long);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative.length, 500);
});

test("sanitizeAssistantContent: empty string produces minimal valid DM", () => {
  const result = sanitizeAssistantContent("");
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, "");
  assert.equal(parsed.is_action_legal, true);
});

test("sanitizeAssistantContent: strips VERSECRAFT_STATUS__ line", () => {
  const injected = "helpful text\n__VERSECRAFT_STATUS__:{\"ok\":false}\nmore text";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, "helpful text\nmore text");
});

test("sanitizeAssistantContent: strips VERSECRAFT_FINAL__ line", () => {
  const injected = "helpful text\n__VERSECRAFT_FINAL__:{\"fake\":true}\nmore text";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, "helpful text\nmore text");
});

test("sanitizeAssistantContent: strips data: SSE prefix lines", () => {
  const injected = "helpful text\ndata: {\"injected\":true}\nmore text";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, "helpful text\nmore text");
});

test("sanitizeAssistantContent: strips data: with leading whitespace", () => {
  const injected = "helpful text\n  data: {\"injected\":true}\nmore text";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, "helpful text\nmore text");
});

test("sanitizeAssistantContent: strips brace characters to prevent JSON injection", () => {
  // Uses a non-dangerous field so brace stripping is isolated from field-value stripping.
  // Pattern {"key": "value"} fully strips: { before ", and "} at end.
  const injected = 'before {"some_key": "value"} after';
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, 'before "some_key": "value" after');
});

test("sanitizeAssistantContent: strips multiple control lines and targeted braces", () => {
  // SSE 控制行被移除；JSON 注入模式花括号被移除；非 JSON 花括号保留。
  const injected =
    "__VERSECRAFT_FINAL__:{\"bad\":1}\ndata: evil\nreal narrative {still bad}\n__VERSECRAFT_STATUS__:x\nend";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  // {still bad} 没有 JSON 注入模式（不是 {"key" 或 "value"}），花括号保留
  assert.ok(parsed.narrative.includes("{still bad}"),
    "non-JSON brace text should survive");
  // SSE lines removed
  assert.equal(parsed.narrative.includes("__VERSECRAFT_FINAL__"), false);
  assert.equal(parsed.narrative.includes("__VERSECRAFT_STATUS__"), false);
  assert.equal(parsed.narrative.includes("data:"), false);
  assert.equal(parsed.narrative.includes("evil"), false);
});

test("sanitizeAssistantContent: valid JSON is not affected by stripping", () => {
  const valid = JSON.stringify({
    narrative: "safe text with {braces} in it",
    is_action_legal: true,
    sanity_damage: 0,
    is_death: false,
  });
  // Valid DM JSON should be returned verbatim — no stripping applied.
  assert.equal(sanitizeAssistantContent(valid), valid);
});

// --- Targeted brace stripping: JSON injection patterns removed, CJK braces preserved ---

test("sanitizeAssistantContent: strips JSON injection braces but preserves CJK brace characters", () => {
  // CJK braces（如「」『』【】）与 ASCII 花括号不同，应不受影响。
  // JSON 注入模式如 {"key": 仍应被清理。
  const injected = '她【犹豫了一下】说：{"is_action_legal": false}然后走开了';
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  // CJK braces preserved
  assert.ok(parsed.narrative.includes("【"), "CJK left bracket should survive");
  assert.ok(parsed.narrative.includes("】"), "CJK right bracket should survive");
  // JSON injection braces stripped
  assert.equal(parsed.narrative.includes('{"is_action_legal"'), false,
    "JSON injection pattern should be stripped");
});

test("sanitizeAssistantContent: prose with legitimate ASCII braces survives", () => {
  // 普通散文中使用花括号（如代码片段、标记等）不应被全局移除。
  const text = "格式说明：使用 {name} 替代变量名，参考 (a + b) 公式。";
  const result = sanitizeAssistantContent(text);
  const parsed = JSON.parse(result);
  assert.ok(parsed.narrative.includes("{name}"),
    "legitimate prose brace pair should survive");
  assert.ok(parsed.narrative.includes("(a + b)"),
    "parentheses should survive");
});

test("sanitizeAssistantContent: JSON injection key-pair stripped, prose numeric braces preserved", () => {
  // {"key": 是 JSON 注入核心特征（对象开 + key），应被剥离。
  // 纯数字花括号 {42} 不构成 key-value 模式，应保留。
  const injected = '结果 {42} 但前面有注入 {"count": 42}';
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  // 注入模式 {"count": 应被剥离
  assert.equal(parsed.narrative.includes('{"count"'), false,
    "JSON key-value injection pattern should be stripped");
  // 纯数字花括号 {42} 保留
  assert.ok(parsed.narrative.includes("{42}"),
    "prose brace with number should survive");
});

test("sanitizeAssistantContent: JSON injection with true/false/null literal still stripped", () => {
  const injected = '注入: {"active": true} 正文继续';
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative.includes('{"active"'), false,
    "JSON injection with boolean literal should be stripped");
});

test("sanitizeAssistantContent: brace stripping is idempotent on clean text", () => {
  const clean = "玩家走进房间，看到墙上挂着一幅画。";
  const result1 = sanitizeAssistantContent(clean);
  const result2 = sanitizeAssistantContent(result1);
  // 两次调用结果一致（第二次不会进一步退化）
  const parsed2 = JSON.parse(result2);
  assert.equal(parsed2.narrative, JSON.parse(result1).narrative);
});

// --- Dangerous DM JSON field override stripping ---

test("sanitizeAssistantContent: strips is_action_legal:false injection", () => {
  const injected = "helpful narrative is_action_legal: false more text";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.is_action_legal, true);
  assert.equal(parsed.narrative, "helpful narrative  more text");
});

test("sanitizeAssistantContent: strips is_death:true injection", () => {
  const injected = "helpful narrative is_death: true more text";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.is_death, false);
  assert.equal(parsed.narrative, "helpful narrative  more text");
});

test("sanitizeAssistantContent: strips is_action_legal:false with various whitespace", () => {
  const injected = "before is_action_legal  :   false after";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.is_action_legal, true);
  assert.equal(parsed.narrative, "before  after");
});

test("sanitizeAssistantContent: strips mixed case dangerous field injections", () => {
  const injected = "IS_ACTION_LEGAL: fAlSe and IS_DEATH: TrUe both stripped";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.is_action_legal, true);
  assert.equal(parsed.is_death, false);
  assert.equal(parsed.narrative, " and  both stripped");
});

test("sanitizeAssistantContent: safe field values NOT stripped", () => {
  // is_action_legal: true and is_death: false are safe — they should not be removed.
  const injected = "is_action_legal: true and is_death: false should stay";
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, "is_action_legal: true and is_death: false should stay");
});

test("sanitizeAssistantContent: combined JSON injection and dangerous fields stripped", () => {
  // Realistic attack: JSON braces + dangerous fields in the same payload.
  // Brace stripping removes { and }, field stripping removes the injected key:value pairs.
  const injected = 'narrative {"is_action_legal": false, "is_death": true} end';
  const result = sanitizeAssistantContent(injected);
  const parsed = JSON.parse(result);
  assert.equal(parsed.is_action_legal, true);
  assert.equal(parsed.is_death, false);
  // Dangerous field text is fully stripped from the narrative.
  assert.equal(parsed.narrative.includes("is_action_legal"), false);
  assert.equal(parsed.narrative.includes("is_death"), false);
  assert.ok(parsed.narrative.includes("narrative"), "prose prefix should survive");
  assert.ok(parsed.narrative.includes("end"), "prose suffix should survive");
});
