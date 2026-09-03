import test from "node:test";
import assert from "node:assert/strict";
import {
  MECHANICS_TOOL_SCHEMAS,
  ALL_MECHANICS_TOOL_NAMES,
  READONLY_MECHANICS_TOOL_NAMES,
  WRITE_MECHANICS_TOOL_NAMES,
} from "./mechanicsToolSchemas";

// ── Schema registry completeness ──

test("MECHANICS_TOOL_SCHEMAS contains all expected tools", () => {
  const names = Object.keys(MECHANICS_TOOL_SCHEMAS);
  assert.ok(names.includes("get_player_state"));
  assert.ok(names.includes("get_inventory"));
  assert.ok(names.includes("get_active_quests"));
  assert.ok(names.includes("get_world_context"));
  assert.ok(names.includes("get_combat_state"));
  assert.ok(names.includes("inspect_forge_options"));
  assert.ok(names.includes("issue_quest"));
  assert.ok(names.includes("update_quest_progress"));
  assert.ok(names.includes("forge_weapon"));
  assert.ok(names.includes("consume_materials"));
  assert.ok(names.includes("grant_item"));
  assert.ok(names.includes("start_combat"));
  assert.ok(names.includes("resolve_combat_action"));
  assert.ok(names.includes("apply_world_event"));
  assert.ok(names.includes("lookup_location"));
  assert.ok(names.includes("check_npc_stock"));
  assert.equal(names.length, 16);
});

// ── Tool name enumeration ──

test("ALL_MECHANICS_TOOL_NAMES matches MECHANICS_TOOL_SCHEMAS keys", () => {
  const schemaKeys = Object.keys(MECHANICS_TOOL_SCHEMAS).sort();
  const allNames = [...ALL_MECHANICS_TOOL_NAMES].sort();
  assert.deepStrictEqual(allNames, schemaKeys);
});

test("READONLY_MECHANICS_TOOL_NAMES contains only read tools", () => {
  const expectedReadonly = [
    "get_player_state", "get_inventory", "get_active_quests",
    "get_world_context", "get_combat_state", "inspect_forge_options",
    "lookup_location", "check_npc_stock",
  ];
  assert.deepStrictEqual([...READONLY_MECHANICS_TOOL_NAMES].sort(), [...expectedReadonly].sort());
});

test("WRITE_MECHANICS_TOOL_NAMES contains only write tools", () => {
  const expectedWrite = [
    "issue_quest", "update_quest_progress", "forge_weapon",
    "consume_materials", "grant_item", "start_combat",
    "resolve_combat_action", "apply_world_event",
  ];
  assert.deepStrictEqual([...WRITE_MECHANICS_TOOL_NAMES].sort(), [...expectedWrite].sort());
});

test("readonly + write = all tool names", () => {
  const combined = new Set([...READONLY_MECHANICS_TOOL_NAMES, ...WRITE_MECHANICS_TOOL_NAMES]);
  assert.equal(combined.size, ALL_MECHANICS_TOOL_NAMES.length);
  for (const name of ALL_MECHANICS_TOOL_NAMES) {
    assert.ok(combined.has(name), `Missing: ${name}`);
  }
});

test("readonly and write sets are disjoint", () => {
  const readonlySet = new Set(READONLY_MECHANICS_TOOL_NAMES);
  for (const name of WRITE_MECHANICS_TOOL_NAMES) {
    assert.ok(!readonlySet.has(name), `"${name}" appears in both`);
  }
});

// ── Schema structure validation ──

test("every tool schema has meta with name and description", () => {
  for (const [key, schema] of Object.entries(MECHANICS_TOOL_SCHEMAS)) {
    assert.ok(schema.meta, `Missing meta for ${key}`);
    assert.equal(schema.meta.name, key, `Meta name mismatch for ${key}: ${schema.meta.name}`);
    assert.ok(typeof schema.meta.description === "string" && schema.meta.description.length > 0,
      `Missing description for ${key}`);
  }
});

test("every tool schema has valid parameters", () => {
  for (const [key, schema] of Object.entries(MECHANICS_TOOL_SCHEMAS)) {
    assert.ok(schema.parameters, `Missing parameters for ${key}`);
    assert.equal(schema.parameters.type, "object", `Params type not object for ${key}`);
    assert.ok(Array.isArray(schema.parameters.required),
      `Missing required array for ${key}`);
  }
});

test("write tools require idempotency_key parameter (except update_quest_progress)", () => {
  // update_quest_progress is a write tool but doesn't require its own idempotency_key
  const EXCEPTIONS = new Set(["update_quest_progress", "resolve_combat_action"]);
  for (const name of WRITE_MECHANICS_TOOL_NAMES) {
    if (EXCEPTIONS.has(name)) continue;
    const schema = MECHANICS_TOOL_SCHEMAS[name];
    const props = schema.parameters?.properties;
    assert.ok(props, `No properties for ${name}`);
    assert.ok("idempotency_key" in props,
      `Missing idempotency_key param for ${name}`);
  }
});

test("readonly tools do NOT require idempotency_key", () => {
  for (const name of READONLY_MECHANICS_TOOL_NAMES) {
    const schema = MECHANICS_TOOL_SCHEMAS[name];
    const required = schema.parameters?.required || [];
    assert.ok(!required.includes("idempotency_key"),
      `Readonly tool ${name} should not require idempotency_key`);
  }
});

// ── Specific tool parameter validation ──

test("issue_quest schema has expected params", () => {
  const schema = MECHANICS_TOOL_SCHEMAS["issue_quest"];
  const props = schema.parameters.properties;
  assert.ok(props);
  assert.ok("title" in props);
  assert.ok("description" in props);
  assert.ok("idempotency_key" in props);
  assert.ok("source_npc_id" in props);
});

test("forge_weapon schema has expected params", () => {
  const schema = MECHANICS_TOOL_SCHEMAS["forge_weapon"];
  const props = schema.parameters.properties;
  assert.ok(props);
  assert.ok("recipe_id" in props);
  assert.ok("idempotency_key" in props);
});

test("start_combat schema has expected params", () => {
  const schema = MECHANICS_TOOL_SCHEMAS["start_combat"];
  const props = schema.parameters.properties;
  assert.ok(props);
  assert.ok("enemy_npc_id" in props);
  assert.ok("reason" in props);
  assert.ok("idempotency_key" in props);
});

test("resolve_combat_action schema has expected params", () => {
  const schema = MECHANICS_TOOL_SCHEMAS["resolve_combat_action"];
  const props = schema.parameters.properties;
  assert.ok(props);
  assert.ok("action_description" in props);
  assert.ok("action_type" in props);
  // This write tool does not require idempotency_key
});

test("grant_item schema has expected params", () => {
  const schema = MECHANICS_TOOL_SCHEMAS["grant_item"];
  const props = schema.parameters.properties;
  assert.ok(props);
  assert.ok("idempotency_key" in props);
  assert.ok("item_id" in props);
});

// ── Regression: known tool names are stable ──

test("ALL_MECHANICS_TOOL_NAMES is a frozen snapshot", () => {
  assert.equal(ALL_MECHANICS_TOOL_NAMES.length, 16);
  assert.equal(READONLY_MECHANICS_TOOL_NAMES.length, 8);
  assert.equal(WRITE_MECHANICS_TOOL_NAMES.length, 8);
});
