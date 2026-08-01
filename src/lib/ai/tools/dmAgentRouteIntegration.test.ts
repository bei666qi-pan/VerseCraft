/**
 * DM-agent → DM JSON 映射的统一注册表门禁（残余风险一修复）。
 *
 * grant_item 工具自身已做注册表校验（T13），但 route 分支曾把 stateDelta.itemsGranted
 * 直接映射为 awarded_items，绕过了主链路 registeredMechanicsGuard 的统一门禁。
 * 本测试 pin 住：任何进入最终 DM JSON 的物品都必须经过同一注册表校验，
 * 未注册 id 被剔除并记录 telemetry flag，合法注册物品不受影响。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildDmAgentDmJson } from "./dmAgentRouteIntegration";

test("buildDmAgentDmJson prunes unregistered granted items (no bypass around the registry gate)", () => {
  const out = buildDmAgentDmJson({
    narrative: "你把物品收进口袋。",
    toolsUsed: true,
    toolTrace: [],
    totalLatencyMs: 1,
    stateDelta: {
      questsIssued: 0,
      questsUpdated: 0,
      itemsConsumed: [],
      itemsGranted: ["I-X999"],
      weaponsForged: [],
      combatResolved: false,
      worldEventsApplied: 0,
    },
  });
  assert.deepEqual(out.awarded_items, undefined);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});

test("buildDmAgentDmJson keeps registered granted items (keep-alive)", () => {
  const out = buildDmAgentDmJson({
    narrative: "老人把怀表交到你手里。",
    toolsUsed: true,
    toolTrace: [],
    totalLatencyMs: 1,
    stateDelta: {
      questsIssued: 0,
      questsUpdated: 0,
      itemsConsumed: [],
      itemsGranted: ["I-A01"],
      weaponsForged: [],
      combatResolved: false,
      worldEventsApplied: 0,
    },
  });
  assert.deepEqual(out.awarded_items, [{ id: "I-A01", name: "I-A01" }]);
  assert.ok(!(out._commit_flags as string[] | undefined)?.includes("unregistered_item_pruned_v1"));
});

test("buildDmAgentDmJson keeps only the registered entries of a mixed grant", () => {
  const out = buildDmAgentDmJson({
    narrative: "你捡到一些物资。",
    toolsUsed: true,
    toolTrace: [],
    totalLatencyMs: 1,
    stateDelta: {
      questsIssued: 0,
      questsUpdated: 0,
      itemsConsumed: [],
      itemsGranted: ["W-B101", "W-X999"],
      weaponsForged: [],
      combatResolved: false,
      worldEventsApplied: 0,
    },
  });
  assert.deepEqual(out.awarded_items, [{ id: "W-B101", name: "W-B101" }]);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});
