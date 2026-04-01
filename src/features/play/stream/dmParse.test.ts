import assert from "node:assert/strict";
import test from "node:test";
import {
  extractNarrative,
  extractBalancedJsonObjectFrom,
  extractFirstBalancedJsonObject,
  extractBalancedJsonObjectCandidates,
  extractRegenOptionsFromRaw,
  tryParseDM,
} from "./dmParse";

test("extractFirstBalancedJsonObject: nested braces in string", () => {
  const s = '{"a":"{x}","b":1}';
  assert.equal(extractFirstBalancedJsonObject(s), s);
});

test("extractFirstBalancedJsonObject: duplicate concatenated objects", () => {
  const one = '{"is_action_legal":true,"narrative":"hi"}';
  const two = one + one;
  assert.equal(extractFirstBalancedJsonObject(two), one);
});

test("tryParseDM: parses first object when model emits two identical JSON blobs", () => {
  const dup =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"x","is_death":false,"consumes_time":true}' +
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"x","is_death":false,"consumes_time":true}';
  const dm = tryParseDM(dup);
  assert.ok(dm);
  assert.equal(dm?.narrative, "x");
  assert.equal(dm?.is_action_legal, true);
});

test("tryParseDM: only first legal object is effective when second object is appended", () => {
  const first =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"第一段合法叙事","is_death":false,"consumes_time":true}';
  const second =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"第二段不应生效","is_death":false,"consumes_time":false,"player_location":"B1_Hacked"}';
  const dm = tryParseDM(`${first}${second}`);
  assert.ok(dm);
  assert.equal(dm?.narrative, "第一段合法叙事");
  assert.equal((dm as unknown as { player_location?: string }).player_location, undefined);
});

test("tryParseDM: markdown fence still works", () => {
  const wrapped = "```json\n{\"is_action_legal\":true,\"sanity_damage\":0,\"narrative\":\"y\",\"is_death\":false,\"consumes_time\":false}\n```";
  const dm = tryParseDM(wrapped);
  assert.ok(dm);
  assert.equal(dm?.narrative, "y");
});

test("tryParseDM: garbage prefix before JSON object", () => {
  const inner =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"prefixed","is_death":false,"consumes_time":true}';
  const dm = tryParseDM(`模型输出：\n${inner}`);
  assert.ok(dm);
  assert.equal(dm?.narrative, "prefixed");
});

test("tryParseDM: first object not valid JSON, second object is valid DM", () => {
  const good =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"second","is_death":false,"consumes_time":true}';
  const dm = tryParseDM(`{oops}${good}`);
  assert.ok(dm);
  assert.equal(dm?.narrative, "second");
});

test("extractBalancedJsonObjectCandidates: can scan multiple top-level objects", () => {
  const a = '{"x":1}';
  const b = '{"is_action_legal":true,"sanity_damage":0,"narrative":"ok","is_death":false,"consumes_time":true}';
  const cands = extractBalancedJsonObjectCandidates(`${a}\n${b}`);
  assert.deepEqual(cands, [a, b]);
});

test("tryParseDM: protocol-rejected candidate should not block later clean DM", () => {
  const bad =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"正常句子后拼接 {\\"is_death\\":false,\\"consumes_time\\":true}","is_death":false,"consumes_time":true}';
  const good =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"clean","is_death":false,"consumes_time":true}';
  const dm = tryParseDM(`${bad}${good}`);
  assert.ok(dm);
  assert.equal(dm?.narrative, "clean");
});

test("tryParseDM: narrative containing braces as plain text should not be killed", () => {
  const raw =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"你看到墙上涂着 {不要回头} 的字样。","is_death":false,"consumes_time":true}';
  const dm = tryParseDM(raw);
  assert.ok(dm);
  assert.equal(dm?.narrative.includes("{不要回头}"), true);
});

test("extractBalancedJsonObjectFrom: slice from inner brace offset", () => {
  const good =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"x","is_death":false,"consumes_time":true}';
  const at = good.indexOf("{");
  assert.equal(extractBalancedJsonObjectFrom(good, at), good);
});

test("tryParseDM: trailing comma repaired via jsonrepair", () => {
  const raw =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"z","is_death":false,"consumes_time":true,}';
  const dm = tryParseDM(raw);
  assert.ok(dm);
  assert.equal(dm?.narrative, "z");
});

test("extractNarrative: screenshot-like leakage should not be rendered as raw JSON fragment", () => {
  const raw =
    '{"narrative":"你沿着走廊前行，灯光忽明忽暗。,\\"is_death\\":false,\\"consumes_time\\":true}{"is_action_legal":true,\\"sanity_damage\\":0}","is_action_legal":true,"sanity_damage":0,"is_death":false}';
  const shown = extractNarrative(raw);
  assert.equal(shown.includes('"is_death":'), false);
  assert.equal(shown.includes('{"is_action_legal"'), false);
});

test("extractRegenOptionsFromRaw: minimal options-only JSON without full DM shape", () => {
  const raw = '{"options":["观察门缝","退回拐角","轻声呼喊","检查手机"]}';
  assert.deepEqual(extractRegenOptionsFromRaw(raw), ["观察门缝", "退回拐角", "轻声呼喊", "检查手机"]);
});

test("tryParseDM returns null for options-only JSON but extractRegenOptionsFromRaw succeeds", () => {
  const raw = '{"options":["a","b","c","d"]}';
  assert.equal(tryParseDM(raw), null);
  assert.deepEqual(extractRegenOptionsFromRaw(raw), ["a", "b", "c", "d"]);
});

test("extractRegenOptionsFromRaw: __VERSECRAFT_FINAL__ prefix still works", () => {
  const raw = '__VERSECRAFT_FINAL__:{"options":["一","二","三","四"]}';
  assert.deepEqual(extractRegenOptionsFromRaw(raw), ["一", "二", "三", "四"]);
});

