import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS,
  PLAYER_DM_JSON_SCHEMA,
  buildPlayerDmJsonToolRequest,
  buildPlayerDmJsonSchemaRequest,
} from "@/lib/ai/schemas/playerDmJsonSchema";

test("PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS forbids extra top-level properties", () => {
  assert.equal(PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS.additionalProperties, false);
});

test("PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS pins turn_mode to decision_required via const", () => {
  const props = PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS.properties as Record<string, { const?: unknown }>;
  assert.equal(props.turn_mode.const, "decision_required");
  assert.equal(props.decision_required.const, true);
});

test("PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS pins options to exactly 4 items", () => {
  const props = PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS.properties as Record<string, { minItems?: number; maxItems?: number }>;
  assert.equal(props.options.minItems, 4);
  assert.equal(props.options.maxItems, 4);
});

test("PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS lists required keys", () => {
  const required = (PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS as { required: readonly string[] }).required;
  assert.ok(required.includes("is_action_legal"));
  assert.ok(required.includes("sanity_damage"));
  assert.ok(required.includes("narrative"));
  assert.ok(required.includes("is_death"));
  assert.ok(required.includes("consumes_time"));
  assert.ok(required.includes("turn_mode"));
  assert.ok(required.includes("decision_required"));
  assert.ok(required.includes("options"));
});

test("buildPlayerDmJsonToolRequest returns strict:true tool", () => {
  const req = buildPlayerDmJsonToolRequest();
  assert.equal(req.tools.length, 1);
  assert.equal(req.tools[0].type, "function");
  assert.equal(req.tools[0].function.name, "submit_player_dm");
  assert.equal(req.tools[0].function.strict, true);
  assert.equal(req.tools[0].function.parameters, PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS);
  assert.deepEqual(req.toolChoice, { type: "function", function: { name: "submit_player_dm" } });
});

test("PLAYER_DM_JSON_SCHEMA (legacy) is still non-strict for json_schema path", () => {
  assert.equal(PLAYER_DM_JSON_SCHEMA.additionalProperties, true);
  const req = buildPlayerDmJsonSchemaRequest();
  assert.equal(req.strict, false);
});