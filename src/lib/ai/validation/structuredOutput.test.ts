import assert from "node:assert/strict";
import test from "node:test";
import { isValidJsonObjectString, repairJsonObjectString } from "./structuredOutput";

test("isValidJsonObjectString: 接受合法对象与 ```json 围栏，拒绝数组/空", () => {
  assert.equal(isValidJsonObjectString('{"a":1}'), true);
  assert.equal(isValidJsonObjectString('```json\n{"a":1}\n```'), true);
  assert.equal(isValidJsonObjectString("[1,2,3]"), false);
  assert.equal(isValidJsonObjectString("   "), false);
});

test("repairJsonObjectString: 尾逗号可修复", () => {
  const raw = '{"a":1,"b":[1,2,],}';
  assert.equal(isValidJsonObjectString(raw), false, "尾逗号原本非法");
  const repaired = repairJsonObjectString(raw);
  assert.ok(repaired, "应能修复");
  assert.deepEqual(JSON.parse(repaired!), { a: 1, b: [1, 2] });
});

test("repairJsonObjectString: markdown 围栏 + 尾逗号可修复", () => {
  const raw = "```json\n{\n  \"schema_version\": \"director_plan_v1\",\n  \"world_events_to_schedule\": [],\n}\n```";
  assert.equal(isValidJsonObjectString(raw), false);
  const repaired = repairJsonObjectString(raw);
  assert.ok(repaired);
  assert.equal(JSON.parse(repaired!).schema_version, "director_plan_v1");
});

test("repairJsonObjectString: 前后缀说明文字里提取并修复对象", () => {
  const raw = '好的，这是导演计划：\n{"director_intent":"keep pace",} 以上。';
  const repaired = repairJsonObjectString(raw);
  assert.ok(repaired);
  assert.equal(JSON.parse(repaired!).director_intent, "keep pace");
});

test("repairJsonObjectString: 单引号 / 无引号 key 可修复", () => {
  const repaired = repairJsonObjectString("{director_intent: 'stay tense'}");
  assert.ok(repaired);
  assert.equal(JSON.parse(repaired!).director_intent, "stay tense");
});

test("repairJsonObjectString: 纯垃圾 / 非对象返回 null", () => {
  assert.equal(repairJsonObjectString("这里没有任何 JSON"), null);
  assert.equal(repairJsonObjectString(""), null);
  assert.equal(repairJsonObjectString("[1,2,3]"), null, "顶层数组不算对象");
});

test("repairJsonObjectString: 已合法对象也能原样通过", () => {
  const repaired = repairJsonObjectString('{"a":1}');
  assert.ok(repaired);
  assert.deepEqual(JSON.parse(repaired!), { a: 1 });
});
