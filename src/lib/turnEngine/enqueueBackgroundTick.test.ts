import test from "node:test";
import assert from "node:assert/strict";
import {
  decideBackgroundTick,
  scheduleBackgroundWorldTick,
} from "@/lib/turnEngine/enqueueBackgroundTick";

test("decideBackgroundTick skips when no sessionId", () => {
  const d = decideBackgroundTick({
    sessionId: null,
    turnIndex: 1,
    latestUserInput: "向前走",
    dmRecord: { narrative: "x" },
    playerLocation: "走廊",
    npcLocationUpdateCount: 0,
    preflightRiskTags: [],
  });
  assert.equal(d.shouldEnqueue, false);
  assert.equal(d.skipReason, "no_session_id");
});

test("decideBackgroundTick skips when no dmRecord", () => {
  const d = decideBackgroundTick({
    sessionId: "s_1",
    turnIndex: 1,
    latestUserInput: "向前走",
    dmRecord: null,
    playerLocation: "走廊",
    npcLocationUpdateCount: 0,
    preflightRiskTags: [],
  });
  assert.equal(d.shouldEnqueue, false);
  assert.equal(d.skipReason, "no_dm_record");
});

test("decideBackgroundTick surfaces triggers when conditions met", () => {
  const d = decideBackgroundTick({
    sessionId: "s_1",
    turnIndex: 5,
    latestUserInput: "我想找线索",
    dmRecord: { narrative: "x", task_updates: [{ task_id: "T_1" }] },
    previousPlayerLocation: "二楼走廊",
    playerLocation: "三楼走廊",
    npcLocationUpdateCount: 2,
    preflightRiskTags: [],
  });
  assert.equal(d.shouldEnqueue, true);
  // Keyword-based trigger from "线索" input:
  assert.ok(d.triggers.includes("key_story_node_hit"));
  assert.ok(d.triggers.includes("important_npc_state_changed"));
  assert.ok(d.triggers.includes("multi_room_movement"));
});

test("decideBackgroundTick reports no_triggers when nothing noteworthy", () => {
  const d = decideBackgroundTick({
    sessionId: "s_1",
    turnIndex: 1,
    latestUserInput: "呼吸",
    dmRecord: { narrative: "x" },
    playerLocation: null,
    npcLocationUpdateCount: 0,
    preflightRiskTags: [],
  });
  assert.equal(d.shouldEnqueue, false);
  assert.equal(d.skipReason, "no_triggers");
});

test("scheduleBackgroundWorldTick returns synchronously and does not block online path", async () => {
  let enqueueCalled = false;
  let resolveEnqueue: (v: { enqueued: boolean; dedupKey: string }) => void = () => {};
  const enqueuePromise = new Promise<{ enqueued: boolean; dedupKey: string }>((r) => {
    resolveEnqueue = r;
  });
  const t0 = Date.now();
  const { decision, pending } = scheduleBackgroundWorldTick({
    requestId: "req_1",
    userId: "u_1",
    sessionId: "s_1",
    worldId: "dark_moon_prologue",
    mapId: "dark_moon_apartment",
    turnIndex: 12,
    latestUserInput: "我找线索",
    dmRecord: { narrative: "x", task_updates: [{ task_id: "T_1" }] },
    previousPlayerLocation: "二楼走廊",
    playerLocation: "三楼走廊",
    npcLocationUpdateCount: 2,
    preflightRiskTags: [],
    dmNarrativePreview: "x",
    enqueueFn: async () => {
      enqueueCalled = true;
      return enqueuePromise;
    },
  });
  const dtSync = Date.now() - t0;
  assert.ok(dtSync < 50, `scheduling must be synchronous (took ${dtSync}ms)`);
  assert.equal(decision.shouldEnqueue, true);
  // `enqueueCalled` flips after the microtask boundary; pending must NOT block route.
  assert.equal(enqueueCalled, false);
  resolveEnqueue({ enqueued: true, dedupKey: "dk_1" });
  const result = await pending;
  assert.equal(result.enqueued, true);
  assert.equal(result.dedupKey, "dk_1");
  assert.equal(enqueueCalled, true);
});

test("scheduleBackgroundWorldTick forwards explicit world and map scope", async () => {
  let captured: Record<string, unknown> | null = null;
  const { pending } = scheduleBackgroundWorldTick({
    requestId: "req_xingni",
    userId: "u_xingni",
    sessionId: "s_xingni",
    worldId: "xingni_taichu",
    mapId: "xingni_qingshi_county",
    turnIndex: 5,
    latestUserInput: "前往镇邪司登记散修身份",
    dmRecord: { narrative: "陆沉沿长街走向镇邪司。", task_updates: [{ task_id: "QS_MAIN_01" }] },
    previousPlayerLocation: "QS_GUOYAN_INN",
    playerLocation: "QS_MAGISTRATE_WARDEN",
    npcLocationUpdateCount: 0,
    preflightRiskTags: [],
    dmNarrativePreview: "陆沉沿长街走向镇邪司。",
    pacingControllerDigest: {
      tension: 72,
      beatModeHint: "countdown",
      pressureFlags: ["urgent", "urgent"],
      pendingIncidentCodes: ["XQ-EV01"],
      mustRecallHookCodes: [],
      chapterId: "XQ-CH01",
    },
    enqueueFn: async (payload) => {
      captured = payload as unknown as Record<string, unknown>;
      return { enqueued: true, dedupKey: "dk_xingni" };
    },
  });
  const result = await pending;
  assert.equal(result.enqueued, true);
  assert.equal(captured?.worldId, "xingni_taichu");
  assert.equal(captured?.mapId, "xingni_qingshi_county");
  assert.deepEqual(captured?.pacingChapterSignals, {
    phase: "build_up",
    tension: 0.72,
    chapterId: "XQ-CH01",
    chapterIndex: 0,
    progress: 0,
  });
  assert.deepEqual((captured?.worldStateSummary as { stateCodes?: string[] })?.stateCodes, ["urgent", "XQ-EV01"]);
});

test("scheduleBackgroundWorldTick swallows enqueue errors into pending", async () => {
  let settledInfo: unknown = null;
  const { pending } = scheduleBackgroundWorldTick({
    requestId: "req_2",
    userId: null,
    sessionId: "s_1",
    worldId: "dark_moon_prologue",
    mapId: "dark_moon_apartment",
    turnIndex: 24,
    latestUserInput: "我找真相",
    dmRecord: { narrative: "x", task_updates: [{ task_id: "T_1" }] },
    previousPlayerLocation: "一楼",
    playerLocation: "深巷",
    npcLocationUpdateCount: 2,
    preflightRiskTags: [],
    dmNarrativePreview: "x",
    enqueueFn: async () => {
      throw new Error("redis down");
    },
    onSettled: (info) => {
      settledInfo = info;
    },
  });
  const result = await pending;
  assert.equal(result.enqueued, false);
  assert.ok(result.error instanceof Error);
  assert.ok(settledInfo);
});

test("scheduleBackgroundWorldTick still fires onSettled when skipping", async () => {
  let called = false;
  const { pending } = scheduleBackgroundWorldTick({
    requestId: "req_3",
    userId: null,
    sessionId: null,
    worldId: "dark_moon_prologue",
    mapId: "dark_moon_apartment",
    turnIndex: 1,
    latestUserInput: "",
    dmRecord: null,
    playerLocation: null,
    npcLocationUpdateCount: 0,
    preflightRiskTags: [],
    dmNarrativePreview: "",
    enqueueFn: async () => {
      throw new Error("should not be called");
    },
    onSettled: () => {
      called = true;
    },
  });
  const result = await pending;
  assert.equal(result.enqueued, false);
  assert.equal(called, true);
});
