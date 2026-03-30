import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { MAJOR_NPC_IDS } from "@/lib/registry/majorNpcDeepCanon";
import {
  getSpaceAuthorityShardCanon,
  getSpaceShardUnifiedExplanation,
  SPACE_AUTHORITY_ROOT,
} from "@/lib/registry/spaceShardCanon";
import { getPlayerArrivalCanon } from "@/lib/registry/playerArrivalCanon";
import {
  buildNpcInitialRecognitionOfPlayer,
  getNpcFamiliarityFlavor,
} from "@/lib/registry/npcPlayerRecognition";
import { isMonthlyIntrusionNpcCommonSense } from "@/lib/registry/monthlyIntrusionModel";
import { buildSpaceAuthorityBaselinePacket } from "@/lib/playRealtime/worldLorePacketBuilders";

test("校源与公寓碎片在 authorityRoot 上统一为 space", () => {
  const school = getSpaceAuthorityShardCanon("school_projection");
  const apt = getSpaceAuthorityShardCanon("apartment_projection");
  assert.equal(school.authorityRoot, SPACE_AUTHORITY_ROOT);
  assert.equal(apt.authorityRoot, SPACE_AUTHORITY_ROOT);
  assert.equal(school.shardType, "school_projection");
  assert.equal(apt.shardType, "apartment_projection");
  assert.ok(school.monthlyIntrusionRelation.length > 0);
  assert.ok(apt.monthlyIntrusionRelation.length > 0);
});

test("普通 NPC 默认把玩家视作月初误入学生之一，不认旧友", () => {
  const chen = buildNpcInitialRecognitionOfPlayer("N-001");
  assert.equal(chen.category, "ordinary");
  assert.equal(chen.recognizesPlayerAs, "intruded_student");
  assert.equal(chen.recognizesPlayerAsOldFriend, false);
  assert.equal(chen.knowsMonthlyStudentsExist, true);
});

test("普通 NPC 不会默认认出主角（无旧友、无全量记忆模式）", () => {
  const doc = buildNpcInitialRecognitionOfPlayer("N-002");
  assert.equal(doc.category, "ordinary");
  assert.equal(doc.recognizesPlayerAsOldFriend, false);
});

test("高魅力与夜读：熟悉感存在但风味互异，且 capped", () => {
  const flavors = MAJOR_NPC_IDS.map((id) => getNpcFamiliarityFlavor(id));
  const modes = flavors.map((f) => f!.mode);
  assert.equal(new Set(modes).size, modes.length, "六人 familiarMode 应各不相同");

  const elder = getNpcFamiliarityFlavor("N-011");
  assert.ok(elder);
  assert.ok(!modes.includes(elder.mode), "夜读老人不应与六人共用同一 familiarMode");

  for (const id of MAJOR_NPC_IDS) {
    const snap = buildNpcInitialRecognitionOfPlayer(id);
    assert.ok(snap.category === "major_charm" || snap.category === "xinlan");
    assert.equal(snap.revealPacingCapped, true);
  }
  const n011 = buildNpcInitialRecognitionOfPlayer("N-011");
  assert.equal(n011.category, "night_reader");
  assert.equal(n011.revealPacingCapped, true);
});

test("欣蓝熟悉感强度最高，但仍 revealPacingCapped", () => {
  const x = buildNpcInitialRecognitionOfPlayer("N-010");
  assert.equal(x.category, "xinlan");
  if (x.category === "xinlan") {
    assert.equal(x.familiarityIntensity, 5);
    assert.equal(x.revealPacingCapped, true);
  }
  const lin = buildNpcInitialRecognitionOfPlayer("N-015");
  assert.equal(lin.category, "major_charm");
  if (lin.category === "major_charm") {
    assert.ok(x.familiarityIntensity > lin.familiarityIntensity);
  }
});

test("isMonthlyIntrusionNpcCommonSense：特权 NPC 为 false", () => {
  assert.equal(isMonthlyIntrusionNpcCommonSense("N-001"), true);
  assert.equal(isMonthlyIntrusionNpcCommonSense("N-010"), false);
  assert.equal(isMonthlyIntrusionNpcCommonSense("N-011"), false);
  assert.equal(isMonthlyIntrusionNpcCommonSense("N-015"), false);
});

test("世界观 packet 可序列化且含 player_arrival 与 space_shard", () => {
  const pkt = buildSpaceAuthorityBaselinePacket({
    maxRevealRank: REVEAL_TIER_RANK.fracture,
    nearbyNpcIds: ["N-001", "N-010", "N-015"],
  });
  const json = JSON.stringify(pkt);
  assert.ok(json.includes("monthly_intruded_student"));
  assert.ok(json.includes("authorityRoot"));
  assert.ok(json.includes("unifiedPremise"));
  assert.ok(Array.isArray(pkt.nearby_npc_recognition));
  assert.ok((pkt.nearby_npc_recognition as unknown[]).length >= 1);
});

test("getSpaceShardUnifiedExplanation：低档无 deep 句，高档有", () => {
  const s0 = getSpaceShardUnifiedExplanation(REVEAL_TIER_RANK.surface);
  assert.ok(s0.surfaceLine.includes("空间"));
  assert.equal(s0.fractureLine, null);
  const d2 = getSpaceShardUnifiedExplanation(REVEAL_TIER_RANK.deep);
  assert.ok(d2.deepLine && d2.deepLine.length > 0);
});

test("getPlayerArrivalCanon：非天选默认", () => {
  const c = getPlayerArrivalCanon();
  assert.equal(c.notChosenOneByDefault, true);
  assert.equal(c.playerArrivalType, "monthly_intruded_student");
});
