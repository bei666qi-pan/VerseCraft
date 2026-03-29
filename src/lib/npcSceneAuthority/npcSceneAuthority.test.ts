import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import {
  buildNpcSceneAuthority,
  getNpcCanonicalAppearanceForScene,
  getNpcMentionMode,
  isNpcPresentInScene,
} from "./builders";
import {
  validateNpcAppearanceConsistency,
  validateNpcLocationConsistency,
  validateNpcRoleLeakByRevealTier,
} from "./validators";

test("在场 NPC 才可 present；离场不在 present 列表", () => {
  const p = buildNpcSceneAuthority({
    currentSceneLocation: "1 楼门厅",
    npcPositions: [
      { npcId: "N-001", location: "1 楼门厅" },
      { npcId: "N-002", location: "2 楼 201 室" },
    ],
    sceneAppearanceAlreadyWrittenIds: [],
    mentionedNpcIdsFromInput: [],
    codexOrHintNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
  });
  assert.ok(p.presentNpcIds.includes("N-001"));
  assert.ok(!p.presentNpcIds.includes("N-002"));
  assert.ok(p.offscreenNpcIds.includes("N-002"));
  assert.equal(getNpcMentionMode("N-001", p), "present");
  assert.equal(getNpcMentionMode("N-002", p), "forbidden");
});

test("玩家提及 offscreen NPC → heard_only，不得当场对白", () => {
  const p = buildNpcSceneAuthority({
    currentSceneLocation: "B1_SafeZone",
    npcPositions: [{ npcId: "N-015", location: "B1_SafeZone" }],
    sceneAppearanceAlreadyWrittenIds: [],
    mentionedNpcIdsFromInput: ["N-010"],
    codexOrHintNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
  });
  assert.equal(getNpcMentionMode("N-010", p), "heard_only");
  assert.equal(getNpcMentionMode("N-015", p), "present");
});

test("图鉴 hint 出现但未在场 → memory_only", () => {
  const p = buildNpcSceneAuthority({
    currentSceneLocation: "1 楼门厅",
    npcPositions: [{ npcId: "N-001", location: "1 楼门厅" }],
    sceneAppearanceAlreadyWrittenIds: [],
    mentionedNpcIdsFromInput: [],
    codexOrHintNpcIds: ["N-018"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.equal(getNpcMentionMode("N-018", p), "memory_only");
});

test("首次出场外貌：long；已写过→behavior_only", () => {
  const fresh = buildNpcSceneAuthority({
    currentSceneLocation: "1 楼门厅",
    npcPositions: [{ npcId: "N-001", location: "1 楼门厅" }],
    sceneAppearanceAlreadyWrittenIds: [],
    mentionedNpcIdsFromInput: [],
    codexOrHintNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  const a1 = getNpcCanonicalAppearanceForScene("N-001", fresh);
  assert.equal(a1.mode, "full_canon_long");

  const written = buildNpcSceneAuthority({
    currentSceneLocation: "1 楼门厅",
    npcPositions: [{ npcId: "N-001", location: "1 楼门厅" }],
    sceneAppearanceAlreadyWrittenIds: ["N-001"],
    mentionedNpcIdsFromInput: [],
    codexOrHintNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  const a2 = getNpcCanonicalAppearanceForScene("N-001", written);
  assert.equal(a2.mode, "behavior_only");
});

test("多回合公开身份与外貌锚点稳定（来自 canonical map）", () => {
  const p1 = buildNpcSceneAuthority({
    currentSceneLocation: "1 楼门厅",
    npcPositions: [{ npcId: "N-001", location: "1 楼门厅" }],
    sceneAppearanceAlreadyWrittenIds: [],
    mentionedNpcIdsFromInput: [],
    codexOrHintNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  const p2 = buildNpcSceneAuthority({
    currentSceneLocation: "1 楼门厅",
    npcPositions: [{ npcId: "N-001", location: "1 楼门厅" }],
    sceneAppearanceAlreadyWrittenIds: ["N-001"],
    mentionedNpcIdsFromInput: [],
    codexOrHintNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.equal(p1.npcPublicRoleMap["N-001"], p2.npcPublicRoleMap["N-001"]);
  assert.equal(
    p1.npcCanonicalAppearanceMap["N-001"]?.short,
    p2.npcCanonicalAppearanceMap["N-001"]?.short
  );
});

test("validateNpcLocationConsistency：memory 与权威冲突时警告", () => {
  const r = validateNpcLocationConsistency({
    authoritySceneLocation: "B1",
    memorySummarySnippet: "用户位置：2 楼走廊。",
  });
  assert.ok(r.warnings.length > 0 || !r.ok);
});

test("validateNpcAppearanceConsistency：偏离 canonical 时失败", () => {
  const r = validateNpcAppearanceConsistency({
    npcId: "N-001",
    proposedAppearance: "完全随机的外貌描述与注册表无关",
    canonicalShort: "七十余岁",
    canonicalLong: "七十余岁，满头银丝",
  });
  assert.equal(r.ok, false);
});

test("reveal 未到时深层词槽判泄漏", () => {
  const p = buildNpcSceneAuthority({
    currentSceneLocation: "1",
    npcPositions: [{ npcId: "N-001", location: "1" }],
    sceneAppearanceAlreadyWrittenIds: [],
    mentionedNpcIdsFromInput: [],
    codexOrHintNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  const r = validateNpcRoleLeakByRevealTier({
    npcId: "N-001",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    narrativeSnippet: "耶里学校的校源闭环与七锚",
    packet: p,
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockedTokens?.length);
});

test("isNpcPresentInScene helper", () => {
  const scene = { currentSceneLocation: "x", presentNpcIds: ["N-001"] as const };
  assert.equal(isNpcPresentInScene("N-001", scene), true);
  assert.equal(isNpcPresentInScene("N-002", scene), false);
});

test("runtime 注入含 npc_scene_authority_packet", () => {
  const ctx = [
    "用户位置[1 楼门厅]。",
    "游戏时间[第1日 10时]。",
    "NPC当前位置：N-001@1 楼门厅。",
    "图鉴已解锁：N-018|好感40。",
  ].join("\n");
  const json = buildRuntimeContextPackets({
    playerContext: ctx,
    latestUserInput: "我向 N-010 喊话",
    playerLocation: null,
    maxChars: 60000,
  });
  assert.ok(json.includes("npc_scene_authority_packet"));
  assert.ok(json.includes("heard_only"));
});
