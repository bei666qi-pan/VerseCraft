// src/lib/ai/gateway/openaiCompatible.jsonSchema.test.ts
// T2（技术改良，2026-07）：responseFormatJsonSchema 网关序列化回归测试。
import test from "node:test";
import assert from "node:assert/strict";
import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import { buildPlayerDmJsonSchemaRequest, PLAYER_DM_JSON_SCHEMA_NAME } from "@/lib/ai/schemas/playerDmJsonSchema";

function baseBody(partial: Partial<NormalizedCompletionRequest>): NormalizedCompletionRequest {
  return {
    modelApiName: "m",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    maxTokens: 100,
    ...partial,
  };
}

function parsePayload(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

test("buildInit: responseFormatJsonSchema 序列化为 response_format:{type:json_schema}", () => {
  const payload = parsePayload(
    openaiCompatibleGateway.buildInit(
      "k",
      baseBody({ responseFormatJsonSchema: buildPlayerDmJsonSchemaRequest() })
    )
  );
  const responseFormat = payload.response_format as Record<string, unknown>;
  assert.equal(responseFormat.type, "json_schema");
  const jsonSchema = responseFormat.json_schema as Record<string, unknown>;
  assert.equal(jsonSchema.name, PLAYER_DM_JSON_SCHEMA_NAME);
  assert.equal(jsonSchema.strict, false);
  assert.equal(typeof jsonSchema.schema, "object");
  assert.ok(jsonSchema.schema !== null && Object.keys(jsonSchema.schema as Record<string, unknown>).length > 0);
});

test("buildInit: responseFormatJsonSchema 优先于 responseFormatJsonObject", () => {
  const payload = parsePayload(
    openaiCompatibleGateway.buildInit(
      "k",
      baseBody({
        responseFormatJsonObject: true,
        responseFormatJsonSchema: buildPlayerDmJsonSchemaRequest(),
      })
    )
  );
  const responseFormat = payload.response_format as Record<string, unknown>;
  assert.equal(responseFormat.type, "json_schema");
});

test("buildInit: 未设置 responseFormatJsonSchema 时行为不变（仍是 json_object 或无 response_format）", () => {
  const withJsonObject = parsePayload(
    openaiCompatibleGateway.buildInit("k", baseBody({ responseFormatJsonObject: true }))
  );
  assert.deepEqual(withJsonObject.response_format, { type: "json_object" });

  const withNeither = parsePayload(openaiCompatibleGateway.buildInit("k", baseBody({})));
  assert.equal("response_format" in withNeither, false);
});

test("PLAYER_DM_JSON_SCHEMA: 覆盖 DMJson 的 4 个硬必填字段与关键可选字段", () => {
  const req = buildPlayerDmJsonSchemaRequest();
  const schema = req.schema as { required: string[]; properties: Record<string, unknown> };
  for (const field of ["is_action_legal", "sanity_damage", "narrative", "is_death"]) {
    assert.equal(schema.required.includes(field), true, `required 缺少 ${field}`);
  }
  for (const field of [
    "consumes_time",
    "consumed_items",
    "codex_updates",
    "relationship_updates",
    "awarded_items",
    "awarded_warehouse_items",
    "options",
    "currency_change",
    "new_tasks",
    "task_updates",
    "player_location",
    "npc_location_updates",
    "bgm_track",
  ]) {
    assert.equal(field in schema.properties, true, `properties 缺少 ${field}（对照 CLAUDE.md 5.2 节兼容字段清单）`);
  }
});
