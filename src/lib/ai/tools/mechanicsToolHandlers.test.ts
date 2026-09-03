import test from "node:test";
import assert from "node:assert/strict";
import { MECHANICS_TOOL_REGISTRY, getMechanicsToolDefinitions, getReadonlyMechanicsToolDefinitions } from "./mechanicsToolHandlers";
import type { MechanicsContext, MechanicsToolFailure } from "./mechanicsTypes";
import { MECHANICS_TOOL_SCHEMAS } from "./mechanicsToolSchemas";

// ── Shared test context ──

function makeCtx(overrides: Partial<MechanicsContext> = {}): MechanicsContext {
  return {
    requestId: "test-req-lookup",
    sessionId: "test-session",
    userId: "test-user",
    playerLocation: "B1_SafeZone",
    worldId: "test-world",
    limits: {
      maxToolRounds: 2,
      totalBudgetMs: 30000,
      perToolTimeoutMs: 3000,
    },
    ...overrides,
  };
}

// ── Registry completeness ──

test("MECHANICS_TOOL_REGISTRY includes lookup_location and check_npc_stock", () => {
  assert.ok("lookup_location" in MECHANICS_TOOL_REGISTRY, "lookup_location missing from registry");
  assert.ok("check_npc_stock" in MECHANICS_TOOL_REGISTRY, "check_npc_stock missing from registry");
});

test("MECHANICS_TOOL_REGISTRY count matches MECHANICS_TOOL_SCHEMAS", () => {
  const registryKeys = Object.keys(MECHANICS_TOOL_REGISTRY).sort();
  const schemaKeys = Object.keys(MECHANICS_TOOL_SCHEMAS).sort();
  assert.deepStrictEqual(registryKeys, schemaKeys);
});

test("getMechanicsToolDefinitions includes lookup_location and check_npc_stock", () => {
  const defs = getMechanicsToolDefinitions();
  const names = defs.map((d) => d.function.name);
  assert.ok(names.includes("lookup_location"));
  assert.ok(names.includes("check_npc_stock"));
});

test("getReadonlyMechanicsToolDefinitions includes lookup_location and check_npc_stock", () => {
  const defs = getReadonlyMechanicsToolDefinitions();
  const names = defs.map((d) => d.function.name);
  assert.ok(names.includes("lookup_location"));
  assert.ok(names.includes("check_npc_stock"));
});

// ── lookup_location ──

test("lookup_location with exact room node match", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "B1_SafeZone" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.floorId, "B1");
    assert.equal(data.floorLabel, "地下一层");
    assert.ok(Array.isArray(data.roomNodes));
    assert.ok((data.roomNodes as string[]).includes("B1_SafeZone"));
    assert.ok(typeof data.description === "string");
    assert.ok(typeof result.narrativeContext === "string");
  }
});

test("lookup_location with floor id match (B2)", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "B2" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.floorId, "B2");
    assert.ok(Array.isArray(data.roomNodes));
    assert.ok((data.roomNodes as string[]).length > 0);
  }
});

test("lookup_location with floor label match (1 楼)", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "1 楼" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.floorId, "1");
    assert.ok(Array.isArray(data.roomNodes));
  }
});

test("lookup_location with partial room name match", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "Kitchen" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.floorId, "7");
    assert.ok((data.roomNodes as string[]).some((r) => r.includes("Kitchen")));
  }
});

test("lookup_location with floor description keyword match", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "门厅" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.floorId, "1");
  }
});

test("lookup_location with non-existent location returns error", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "不存在的地点XYZ" }, makeCtx());

  assert.ok(!result.ok);
  const fail = result as MechanicsToolFailure;
  assert.equal(fail.code, "validation_error");
  assert.ok(fail.narrativeContext.includes("未找到"));
});

test("lookup_location with empty location_name returns error", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "" }, makeCtx());

  assert.ok(!result.ok);
  const fail = result as MechanicsToolFailure;
  assert.equal(fail.code, "validation_error");
});

test("lookup_location includes threat data for floors with linked anomalies", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "4F" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    const threats = data.threats as Record<string, unknown>;
    assert.ok(threats);
    assert.equal(threats.linkedAnomaly, "A-002");
    assert.ok(typeof threats.mainThreat === "string");
    assert.ok((threats.mainThreat as string).length > 0);
  }
});

test("lookup_location returns all room nodes for matched floor", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.lookup_location.handler;
  const result = await handler({ location_name: "5 楼" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    const nodes = data.roomNodes as string[];
    assert.ok(nodes.includes("5F_Room501"));
    assert.ok(nodes.includes("5F_Studio503"));
    assert.ok(nodes.length >= 3);
  }
});

// ── check_npc_stock ──

test("check_npc_stock with valid npc_id returns npc info", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-008" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.npcId, "N-008");
    assert.equal(data.name, "电工老刘");
    assert.equal(data.specialty, "后勤补给");
    assert.equal(data.combatPower, 6);
    assert.equal(data.floor, "B1");
    assert.ok(typeof data.lore === "string");
    assert.ok(typeof result.narrativeContext === "string");
  }
});

test("check_npc_stock with another valid npc_id", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-001" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.npcId, "N-001");
    assert.equal(data.name, "陈婆婆");
    assert.equal(data.specialty, "后勤补给");
    assert.ok(typeof data.exclusiveItem === "string");
  }
});

test("check_npc_stock returns exclusive_item when npc has one", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-008" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.exclusiveItem, "万能螺丝刀（电工老刘专属）");
  }
});

test("check_npc_stock returns null exclusive_item for npcs without one", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-022" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.exclusiveItem, null);
  }
});

test("check_npc_stock returns carried_item_ids array", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-008" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.ok(Array.isArray(data.carriedItemIds));
  }
});

test("check_npc_stock with invalid npc_id returns error", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-999" }, makeCtx());

  assert.ok(!result.ok);
  const fail = result as MechanicsToolFailure;
  assert.equal(fail.code, "invalid_target");
  assert.ok(fail.narrativeContext.includes("未找到"));
});

test("check_npc_stock with empty npc_id returns error", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "" }, makeCtx());

  assert.ok(!result.ok);
  const fail = result as MechanicsToolFailure;
  assert.equal(fail.code, "validation_error");
});

test("check_npc_stock for high-floor npc", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-011" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.name, "夜读老人");
    assert.equal(data.floor, "7");
    assert.ok(typeof data.lore === "string");
    assert.ok((data.lore as string).length > 0);
  }
});

test("check_npc_stock returns defaultFavorability", async () => {
  const handler = MECHANICS_TOOL_REGISTRY.check_npc_stock.handler;
  const result = await handler({ npc_id: "N-005" }, makeCtx());

  assert.ok(result.ok);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.defaultFavorability, 70);
  }
});

// ── tool definitions validation ──

test("lookup_location tool definition has correct schema", () => {
  const reg = MECHANICS_TOOL_REGISTRY.lookup_location;
  assert.equal(reg.meta.name, "lookup_location");
  assert.equal(reg.meta.access, "read");
  assert.equal(reg.meta.readonly, true);
  assert.equal(reg.meta.mutatesState, false);
  assert.equal(reg.definition.type, "function");
  assert.equal(reg.definition.function.name, "lookup_location");
});

test("check_npc_stock tool definition has correct schema", () => {
  const reg = MECHANICS_TOOL_REGISTRY.check_npc_stock;
  assert.equal(reg.meta.name, "check_npc_stock");
  assert.equal(reg.meta.access, "read");
  assert.equal(reg.meta.readonly, true);
  assert.equal(reg.meta.mutatesState, false);
  assert.equal(reg.definition.type, "function");
  assert.equal(reg.definition.function.name, "check_npc_stock");
});
