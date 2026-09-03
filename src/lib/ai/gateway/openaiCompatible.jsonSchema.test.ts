// src/lib/ai/gateway/openaiCompatible.jsonSchema.test.ts
// Generic responseFormatJsonSchema gateway serialization regression tests.
import test from "node:test";
import assert from "node:assert/strict";
import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";

const GENERIC_SCHEMA = {
  name: "test_schema",
  strict: false,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: { answer: { type: "string" } },
  },
} as const;

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
      baseBody({ responseFormatJsonSchema: GENERIC_SCHEMA })
    )
  );
  const responseFormat = payload.response_format as Record<string, unknown>;
  assert.equal(responseFormat.type, "json_schema");
  const jsonSchema = responseFormat.json_schema as Record<string, unknown>;
  assert.equal(jsonSchema.name, GENERIC_SCHEMA.name);
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
        responseFormatJsonSchema: GENERIC_SCHEMA,
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
