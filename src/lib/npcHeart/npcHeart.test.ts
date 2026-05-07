import test from "node:test";
import assert from "node:assert/strict";
import { buildNpcHeartRuntimeView, selectRelevantNpcHearts } from "./selectors";
import { buildNpcHeartPromptBlock } from "./prompt";
import { buildNpcRuntimeStateV1, renderNpcRuntimeStatePromptBlock } from "./runtimeState";

test("NpcHeartRuntimeView attitude shifts with trust/fear", () => {
  const warm = buildNpcHeartRuntimeView({
    npcId: "N-008",
    relationPartial: { trust: 60, fear: 5, debt: 0, favorability: 10 },
    locationId: "B1_SafeZone",
    activeTaskIds: ["t1"],
    hotThreatPresent: false,
  });
  assert.ok(warm);
  assert.equal(warm!.attitudeLabel, "warm");

  const hostile = buildNpcHeartRuntimeView({
    npcId: "N-010",
    relationPartial: { trust: 10, fear: 80, debt: 0, favorability: 0 },
    locationId: "1F_PropertyOffice",
    activeTaskIds: [],
    hotThreatPresent: true,
  });
  assert.ok(hostile);
  assert.equal(hostile!.attitudeLabel, "hostile");
});

test("NpcRuntimeStateV1 keeps same task pressure in different NPC voices", () => {
  const a = buildNpcHeartRuntimeView({
    npcId: "N-008",
    relationPartial: { trust: 20, fear: 10, debt: 0, favorability: 5 },
    locationId: "B1_SafeZone",
    activeTaskIds: ["route.preview.1f"],
    hotThreatPresent: false,
    maxRevealRank: 0,
  });
  const b = buildNpcHeartRuntimeView({
    npcId: "N-010",
    relationPartial: { trust: 20, fear: 10, debt: 0, favorability: 5 },
    locationId: "1F_PropertyOffice",
    activeTaskIds: ["route.preview.1f"],
    hotThreatPresent: false,
    maxRevealRank: 0,
  });
  assert.ok(a);
  assert.ok(b);
  const sa = buildNpcRuntimeStateV1({ view: a!, maxRevealRank: 0 });
  const sb = buildNpcRuntimeStateV1({ view: b!, maxRevealRank: 0 });
  assert.equal(sa.taskPressure?.taskIds[0], "route.preview.1f");
  assert.equal(sb.taskPressure?.taskIds[0], "route.preview.1f");
  assert.notDeepEqual(sa.speechAnchors.mustSoundLike, sb.speechAnchors.mustSoundLike);
  assert.ok(!sa.knowledgeBoundary.allowedTruthClasses.includes("dm_only"));
});

test("NpcHeart prompt can render NpcRuntimeStateV1 under feature flag", () => {
  const prev = process.env.VC_NPC_RUNTIME_STATE_V1;
  process.env.VC_NPC_RUNTIME_STATE_V1 = "1";
  try {
    const view = buildNpcHeartRuntimeView({
      npcId: "N-018",
      relationPartial: { trust: 30, fear: 10, debt: 0, favorability: 0 },
      locationId: "6F_Stairwell",
      activeTaskIds: ["route.preview.1f"],
      hotThreatPresent: true,
    });
    assert.ok(view);
    const block = buildNpcHeartPromptBlock({ views: [view!], maxChars: 420 });
    assert.ok(block.includes("npc_runtime_state_v1"));
  } finally {
    if (prev === undefined) delete process.env.VC_NPC_RUNTIME_STATE_V1;
    else process.env.VC_NPC_RUNTIME_STATE_V1 = prev;
  }
});

test("renderNpcRuntimeStatePromptBlock is capped", () => {
  const view = buildNpcHeartRuntimeView({
    npcId: "N-020",
    relationPartial: { trust: 0, fear: 30, debt: 0, favorability: 0 },
    locationId: "B1_Storage",
    activeTaskIds: ["route.preview.1f"],
    hotThreatPresent: false,
  });
  assert.ok(view);
  const block = renderNpcRuntimeStatePromptBlock({
    states: [buildNpcRuntimeStateV1({ view: view!, maxRevealRank: 0 })],
    maxChars: 220,
  });
  assert.ok(block.length <= 220);
  assert.ok(block.includes("npc_runtime_state_v1"));
});

test("NpcHeart selector only picks a few relevant NPCs", () => {
  const ids = selectRelevantNpcHearts({
    locationId: "B1_SafeZone",
    presentNpcIds: ["N-008", "N-014", "N-020"],
    issuerNpcIds: ["N-010", "N-018"],
    volatileNpcIds: ["N-008", "N-999"],
    maxNpc: 3,
  });
  assert.equal(ids.length, 3);
  assert.ok(ids.includes("N-008"));
});

test("同场 presentNpcIds 注入 peerRelationalCues", () => {
  const v = buildNpcHeartRuntimeView({
    npcId: "N-001",
    relationPartial: {},
    locationId: "1F_Lobby",
    activeTaskIds: [],
    hotThreatPresent: false,
    presentNpcIds: ["N-001", "N-004"],
  });
  assert.ok(v?.peerRelationalCues);
  assert.ok(v!.peerRelationalCues!.includes("阿花"));
});

test("NpcHeart prompt block is length-capped", () => {
  const v = buildNpcHeartRuntimeView({
    npcId: "N-018",
    relationPartial: { trust: 30, fear: 10, debt: 0, favorability: 0 },
    locationId: "6F_Stairwell",
    activeTaskIds: [],
    hotThreatPresent: true,
  });
  assert.ok(v);
  const block = buildNpcHeartPromptBlock({ views: [v!], maxChars: 180 });
  assert.ok(block.length <= 180);
  assert.ok(block.includes("NPC心脏"));
});

