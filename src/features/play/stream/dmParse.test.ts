import assert from "node:assert/strict";
import test from "node:test";
import { extractFirstBalancedJsonObject, tryParseDM } from "./dmParse";

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
