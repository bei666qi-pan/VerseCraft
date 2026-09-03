/**
 * Mechanics candidate 的统一注册表门禁。
 *
 * grant_item 工具自身已做注册表校验（T13），但 route 分支曾把 stateDelta.itemsGranted
 * 直接映射为 awarded_items，绕过了主链路 registeredMechanicsGuard 的统一门禁。
 * 本测试 pin 住：任何进入最终 DM JSON 的物品都必须经过同一注册表校验，
 * 未注册 id 被剔除并记录 telemetry flag，合法注册物品不受影响。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { extractNarrative } from "@/features/play/stream/dmParse";
import { accumulateDmFromSseEvent } from "@/features/play/stream/sseFrame";
import {
  buildMechanicsNarrativePrelude,
  buildMechanicsNarrativePreludeFrame,
  buildMechanicsCandidate,
  buildNormalizedMechanicsCandidate,
  runMechanicsRoute,
} from "./mechanicsRouteIntegration";

test("mechanics emits a concrete non-authoritative prelude before its final candidate", () => {
  const prelude = buildMechanicsNarrativePrelude("装备武器；没有就明确失败", "dark_moon_prologue");
  assert.match(prelude, /装备|随身|武器/);

  const frame = buildMechanicsNarrativePreludeFrame(prelude);
  const streamed = accumulateDmFromSseEvent(`data: ${frame}`, "");
  assert.equal(extractNarrative(streamed.raw), prelude);

  const final = '{"narrative":"最终规则结果","is_action_legal":false}';
  const committed = accumulateDmFromSseEvent(`data: __VERSECRAFT_FINAL__:${final}`, streamed.raw);
  assert.equal(committed.raw, final);
  assert.equal(extractNarrative(committed.raw), "最终规则结果");
});

test("buildMechanicsCandidate prunes unregistered granted items", () => {
  const out = buildMechanicsCandidate({
    narrative: "你把物品收进口袋。",
    toolsUsed: true,
    toolTrace: [],
    totalLatencyMs: 1,
    stateDelta: {
      itemsGranted: ["I-X999"],
    },
  });
  assert.deepEqual(out.awarded_items, undefined);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});

test("buildMechanicsCandidate keeps registered granted items", () => {
  const out = buildMechanicsCandidate({
    narrative: "老人把怀表交到你手里。",
    toolsUsed: true,
    toolTrace: [],
    totalLatencyMs: 1,
    stateDelta: {
      itemsGranted: ["I-A01"],
    },
  });
  assert.deepEqual(out.awarded_items, [{ id: "I-A01", name: "I-A01" }]);
  assert.ok(!(out._commit_flags as string[] | undefined)?.includes("unregistered_item_pruned_v1"));
});

test("buildMechanicsCandidate keeps only registered entries of a mixed grant", () => {
  const out = buildMechanicsCandidate({
    narrative: "你捡到一些物资。",
    toolsUsed: true,
    toolTrace: [],
    totalLatencyMs: 1,
    stateDelta: {
      itemsGranted: ["W-B101", "W-X999"],
    },
  });
  assert.deepEqual(out.awarded_items, [{ id: "W-B101", name: "W-B101" }]);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});

test("owned mechanics always yields a normalized finalizer candidate", () => {
  const out = buildNormalizedMechanicsCandidate({
    narrative: undefined,
    toolsUsed: false,
    stateDelta: null,
  });

  assert.equal(out.narrative, "规则处理已完成。");
  assert.equal(out.is_action_legal, true);
  assert.equal(out.consumes_time, true);
  assert.deepEqual(out.options, []);
});

test("an owned mechanics failure becomes a deterministic candidate instead of falling back to Writer", async () => {
  let calls = 0;
  const out = await runMechanicsRoute({
    requestId: "mechanics-failure",
    sessionId: "session-1",
    playerLocation: "B1",
    worldId: "dark_moon_prologue",
    systemMessages: [{ role: "system", content: "test" }],
    userMessage: { role: "user", content: "尝试开锁" },
    tools: {},
    execute: async () => {
      calls += 1;
      throw new Error("upstream unavailable");
    },
  });

  assert.equal(calls, 1);
  assert.equal(out.result.narrative, "这次操作暂时无法完成，请检查当前资源和条件后重试。");
  assert.deepEqual(out.result.receipts, []);
  assert.deepEqual(out.result.usage, []);
});

test("mechanics routing is canonical and does not depend on a legacy feature flag", async () => {
  let calls = 0;
  const out = await runMechanicsRoute({
    requestId: "mechanics-canonical",
    sessionId: "session-1",
    playerLocation: "B1",
    worldId: "dark_moon_prologue",
    systemMessages: [{ role: "system", content: "test" }],
    userMessage: { role: "user", content: "尝试开锁" },
    tools: {},
    execute: async () => {
      calls += 1;
      throw new Error("upstream unavailable");
    },
  });

  assert.equal(calls, 1);
  assert.equal(out.result.narrative, "这次操作暂时无法完成，请检查当前资源和条件后重试。");
});
