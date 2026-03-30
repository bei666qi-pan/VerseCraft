import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { normalizeRelationStatePartial } from "@/lib/npcHeart/build";
import { buildNpcHeartRuntimeView } from "@/lib/npcHeart/selectors";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import {
  buildNpcBaselineAttitude,
  buildNpcPlayerBaselinePacket,
  buildEmptyNpcPlayerBaselinePacket,
  getNpcDefaultPlayerFraming,
  getNpcTruthRevealCeiling,
  mergeNpcBaselineWithRelation,
  shouldNpcTreatPlayerAsKnownOldFriend,
} from "./builders";

const neutralRel = normalizeRelationStatePartial({});
const highTrustRel = normalizeRelationStatePartial({
  trust: 85,
  fear: 5,
  favorability: 80,
  affection: 70,
  romanceStage: "bonded",
});

test("普通 NPC 默认不应把玩家当旧识", () => {
  assert.equal(shouldNpcTreatPlayerAsKnownOldFriend("N-001", highTrustRel), false);
  assert.equal(shouldNpcTreatPlayerAsKnownOldFriend("N-002", highTrustRel), false);
  assert.equal(getNpcDefaultPlayerFraming("N-001"), "intruded_student");
});

test("普通 NPC：语气层体现误闯学生（基线视角）", () => {
  const b = buildNpcBaselineAttitude(
    "N-001",
    { locationId: "1", hotThreatPresent: false, maxRevealRank: 0 },
    neutralRel
  );
  assert.equal(b.baselineViewOfPlayer, "intruded_student");
  assert.ok(
    b.greetingStyleRule.includes("误闯") ||
      b.greetingStyleRule.includes("路人") ||
      b.greetingStyleRule.includes("客服")
  );
});

test("高魅力 / 夜读：更强熟悉感上限与回声视角", () => {
  const major = buildNpcBaselineAttitude(
    "N-015",
    { locationId: "B1", hotThreatPresent: false, maxRevealRank: 1 },
    neutralRel
  );
  const night = buildNpcBaselineAttitude(
    "N-011",
    { locationId: "7", hotThreatPresent: false, maxRevealRank: 1 },
    neutralRel
  );
  assert.equal(major.baselineViewOfPlayer, "familiar_fragment_echo");
  assert.equal(night.baselineViewOfPlayer, "familiar_fragment_echo");
  assert.ok(major.allowedFamiliarityCeiling > 40);
  assert.ok(night.allowedFamiliarityCeiling > 40);
});

test("欣蓝 baseline 明显不同（牵引 + 真相规则 + 揭露上限）", () => {
  const x = buildNpcBaselineAttitude(
    "N-010",
    { locationId: "1", hotThreatPresent: false, maxRevealRank: REVEAL_TIER_RANK.fracture },
    neutralRel
  );
  assert.equal(x.baselineViewOfPlayer, "familiar_fragment_echo");
  assert.ok(x.truthRevealRule.includes("分层") || x.truthRevealRule.includes("渐进"));
  assert.ok(
    x.greetingStyleRule.includes("名单") ||
      x.greetingStyleRule.includes("登记") ||
      x.greetingStyleRule.includes("公事")
  );
  assert.equal(getNpcTruthRevealCeiling("N-010"), REVEAL_TIER_RANK.abyss);
});

test("关系提升不会把普通 NPC 扭成旧友", () => {
  const baseline = buildNpcBaselineAttitude(
    "N-001",
    { locationId: "1", hotThreatPresent: false, maxRevealRank: 0 },
    highTrustRel
  );
  const merged = mergeNpcBaselineWithRelation({
    baseline,
    relation: highTrustRel,
    scene: { locationId: "1", hotThreatPresent: false, maxRevealRank: 0 },
  });
  assert.equal(shouldNpcTreatPlayerAsKnownOldFriend("N-001", highTrustRel), false);
  assert.notEqual(merged.effectiveViewOfPlayer, "knows_truth");
});

test("基线缺失（无 NPC）时使用安全默认 packet", () => {
  const empty = buildEmptyNpcPlayerBaselinePacket();
  assert.equal(empty.mergedViewOfPlayer, "intruded_student");
  assert.ok(empty.avoidMisalignment[0]?.length);
});

test("merge：欣蓝在信任+档位下可出现 knows_truth 合并视角", () => {
  const baseline = buildNpcBaselineAttitude(
    "N-010",
    { locationId: "1", hotThreatPresent: false, maxRevealRank: REVEAL_TIER_RANK.fracture },
    highTrustRel
  );
  const merged = mergeNpcBaselineWithRelation({
    baseline,
    relation: highTrustRel,
    scene: { locationId: "1", hotThreatPresent: false, maxRevealRank: REVEAL_TIER_RANK.fracture },
  });
  assert.equal(merged.effectiveViewOfPlayer, "knows_truth");
});

test("runtime packet 含 npc_player_baseline_packet", () => {
  const ctx = [
    "用户位置[1 楼门厅]。",
    "游戏时间[第1日 10时]。",
    "NPC当前位置：N-001@1 楼门厅。",
  ].join("\n");
  const json = buildRuntimeContextPackets({
    playerContext: ctx,
    latestUserInput: "你好",
    playerLocation: null,
    focusNpcId: "N-001",
    maxChars: 50000,
  });
  assert.ok(json.includes("npc_player_baseline_packet"));
  assert.ok(json.includes("mergedViewOfPlayer"));
});

test("同场多 NPC 且存在表面边时 JSON 含 npc_social_surface_packet", () => {
  const ctx = [
    "用户位置[1 楼门厅]。",
    "游戏时间[第1日 10时]。",
    "NPC当前位置：N-001@1 楼门厅，N-004@1 楼门厅。",
  ].join("\n");
  const json = buildRuntimeContextPackets({
    playerContext: ctx,
    latestUserInput: "你好",
    playerLocation: null,
    focusNpcId: "N-001",
    maxChars: 50000,
  });
  assert.ok(json.includes("npc_social_surface_packet"));
});

test("NpcHeartRuntimeView 携带 baselineMerged", () => {
  const v = buildNpcHeartRuntimeView({
    npcId: "N-020",
    relationPartial: { trust: 40, fear: 10 },
    locationId: "B1_Storage",
    activeTaskIds: [],
    hotThreatPresent: false,
    maxRevealRank: 1,
  });
  assert.ok(v?.baselineMerged);
  assert.ok(v.baselineMerged?.compactNarrativeHint);
});

test("buildNpcPlayerBaselinePacket 结构完整", () => {
  const p = buildNpcPlayerBaselinePacket({
    npcId: "N-018",
    relationPartial: {},
    scene: { locationId: "1", maxRevealRank: 1, hotThreatPresent: false },
  });
  assert.ok(p.truthRevealRule.length > 0);
  assert.ok(typeof p.canShowFamiliarity === "boolean");
  assert.ok(p.playerAddressCue.length > 0);
  assert.ok(p.playerInteractionStanceCue.length > 0);
});

test("playerInteractionStanceCue 随特权区分试探深度", () => {
  const normal = buildNpcPlayerBaselinePacket({
    npcId: "N-001",
    relationPartial: {},
    scene: { locationId: "1", maxRevealRank: 1, hotThreatPresent: false },
  });
  const xin = buildNpcPlayerBaselinePacket({
    npcId: "N-010",
    relationPartial: {},
    scene: { locationId: "1", maxRevealRank: 1, hotThreatPresent: false },
  });
  assert.ok(normal.playerInteractionStanceCue.includes("试探") || normal.playerInteractionStanceCue.includes("规则"));
  assert.ok(xin.playerInteractionStanceCue.includes("公事") || xin.playerInteractionStanceCue.includes("试探"));
});
