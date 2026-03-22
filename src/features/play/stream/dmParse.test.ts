import assert from "node:assert/strict";
import test from "node:test";
import {
  extractBalancedJsonObjectFrom,
  extractFirstBalancedJsonObject,
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
