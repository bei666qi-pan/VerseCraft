// src/lib/worldEngine/directorToolsPure.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTOR_TOOL_USAGE_HINT,
  GET_AGENDA_EVENTS_DEFINITION,
  SEARCH_WORLD_FACTS_DEFINITION,
  escapeLikePattern,
  normalizeAgendaArgs,
  normalizeSearchFactsArgs,
} from "@/lib/worldEngine/directorToolsPure";

test("escapeLikePattern 转义 % _ \\", () => {
  assert.equal(escapeLikePattern("100%_a\\b"), "100\\%\\_a\\\\b");
  assert.equal(escapeLikePattern("暗月"), "暗月");
});

test("normalizeSearchFactsArgs 钳制范围并裁剪关键词", () => {
  assert.deepEqual(normalizeSearchFactsArgs({}), { contains: null, limit: 10, offset: 0 });
  assert.deepEqual(normalizeSearchFactsArgs({ contains: "  钥匙  ", limit: 999, offset: -5 }), {
    contains: "钥匙",
    limit: 20,
    offset: 0,
  });
  assert.deepEqual(normalizeSearchFactsArgs({ limit: 0.9, offset: 500 }), {
    contains: null,
    limit: 1,
    offset: 200,
  });
  const long = normalizeSearchFactsArgs({ contains: "x".repeat(200) });
  assert.equal(long.contains?.length, 80);
  // 非法类型回退默认值
  assert.deepEqual(normalizeSearchFactsArgs({ contains: 42, limit: "abc", offset: null }), {
    contains: null,
    limit: 10,
    offset: 0,
  });
});

test("normalizeAgendaArgs 钳制范围", () => {
  assert.deepEqual(normalizeAgendaArgs({}), { status: null, limit: 8 });
  assert.deepEqual(normalizeAgendaArgs({ status: " pending ", limit: 100 }), {
    status: "pending",
    limit: 16,
  });
  assert.equal(normalizeAgendaArgs({ status: "x".repeat(50) }).status?.length, 32);
});

test("工具定义符合 OpenAI function 形态且命名稳定", () => {
  for (const def of [SEARCH_WORLD_FACTS_DEFINITION, GET_AGENDA_EVENTS_DEFINITION]) {
    assert.equal(def.type, "function");
    assert.ok(def.function.name.length > 0);
    assert.ok(def.function.description.length > 0);
    assert.equal((def.function.parameters as { type?: string }).type, "object");
  }
  assert.equal(SEARCH_WORLD_FACTS_DEFINITION.function.name, "search_world_facts");
  assert.equal(GET_AGENDA_EVENTS_DEFINITION.function.name, "get_agenda_events");
});

test("工具使用守则要求最终输出 director_plan_v1", () => {
  assert.match(DIRECTOR_TOOL_USAGE_HINT, /director_plan_v1/);
  assert.match(DIRECTOR_TOOL_USAGE_HINT, /只读/);
});
