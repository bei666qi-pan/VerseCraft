import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { MAJOR_NPC_IDS } from "@/lib/registry/majorNpcDeepCanon";
import {
  getNpcCanonicalIdentity,
  getNpcMemoryPrivilege,
  getNpcPlayerRecognitionMode,
  getNpcAllowedSpawnLocations,
  getNpcBaselineViewOfPlayer,
  isNpcAllowedToKnowRevealTier,
  isRegisteredCanonicalNpcId,
  normalizeNpcCanonOrFallback,
  NPC_CANONICAL_IDENTITY_BY_ID,
  resolveNpcRuntimeLocation,
} from "@/lib/registry/npcCanon";
import { XINLAN_NPC_ID } from "@/lib/registry/npcCanonBuilders";

test("普通 NPC 不能被标成 exact_knowledge（注册表）", () => {
  for (const [id, card] of Object.entries(NPC_CANONICAL_IDENTITY_BY_ID)) {
    if (card.memoryPrivilege !== "normal") continue;
    assert.ok(
      card.playerRecognitionMode !== "exact_knowledge",
      `${id} must not be exact_knowledge`
    );
    assert.ok(
      card.playerRecognitionMode !== "familiar_pull",
      `${id} must not be familiar_pull`
    );
  }
});

test("欣蓝：xinlan 特权 + exact_knowledge + 揭露上限最高档", () => {
  const x = NPC_CANONICAL_IDENTITY_BY_ID["N-010"];
  assert.ok(x);
  assert.equal(x.memoryPrivilege, "xinlan");
  assert.equal(x.playerRecognitionMode, "exact_knowledge");
  assert.equal(x.revealTierCap, REVEAL_TIER_RANK.abyss);
  assert.equal(x.canKnowLoopTruth, true);
  assert.equal(x.canKnowPlayerCoreIdentity, true);
});

test("高魅力 NPC 与夜读老人：中间特权层，不等于欣蓝", () => {
  const xinlan = NPC_CANONICAL_IDENTITY_BY_ID["N-010"];
  const elder = NPC_CANONICAL_IDENTITY_BY_ID["N-011"];
  assert.ok(xinlan && elder);
  assert.notEqual(elder.memoryPrivilege, "xinlan");
  assert.equal(elder.memoryPrivilege, "night_reader");
  assert.equal(elder.playerRecognitionMode, "familiar_pull");
  assert.equal(elder.canKnowLoopTruth, false);

  for (const id of MAJOR_NPC_IDS) {
    if (id === "N-010") continue;
    const c = NPC_CANONICAL_IDENTITY_BY_ID[id];
    assert.ok(c, id);
    assert.equal(c.memoryPrivilege, "major_charm");
    assert.notEqual(c.memoryPrivilege, "xinlan");
    assert.equal(c.playerRecognitionMode, "familiar_pull");
    assert.equal(c.canKnowLoopTruth, false);
  }
});

test("NPC 性别、称谓、身份可稳定读取", () => {
  const n010 = getNpcCanonicalIdentity("N-010");
  assert.equal(n010.canonicalGender, "female");
  assert.match(n010.canonicalAddressing, /她/);
  assert.ok(n010.apartmentSurfaceIdentity.length > 0);
  assert.ok(n010.fragmentSchoolIdentity.length > 0);

  const n009 = getNpcCanonicalIdentity("N-009");
  assert.equal(n009.canonicalGender, "group");
  assert.match(n009.canonicalAddressing, /她们/);
});

test("越界地点会被纠偏到 canonical home", () => {
  const id = "N-001";
  const card = getNpcCanonicalIdentity(id);
  const bad = resolveNpcRuntimeLocation({
    npcId: id,
    canonicalHomeLocation: card.canonicalHomeLocation,
    allowedSpawnLocations: card.allowedSpawnLocations,
    runtimeLocation: "完全不存在的虚构节点_XYZ",
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.runtimeLocation, card.canonicalHomeLocation);
  assert.ok(bad.correctedTo);
});

test("缺注册 ID：安全降级 + 默认误闯学生基线", () => {
  const u = normalizeNpcCanonOrFallback("N-999", null);
  assert.equal(u.canonicalGender, "unknown");
  assert.ok(u.baselineViewOfPlayer.includes("误闯"));
  assert.equal(u.memoryPrivilege, "normal");
});

test("isRegisteredCanonicalNpcId：仅注册表内为 true", () => {
  assert.equal(isRegisteredCanonicalNpcId("N-010"), true);
  assert.equal(isRegisteredCanonicalNpcId("n-010"), true);
  assert.equal(isRegisteredCanonicalNpcId("N-999"), false);
});

test("normalize：普通 NPC 覆盖为 exact_knowledge 时纠偏", () => {
  const fixed = normalizeNpcCanonOrFallback("N-002", {
    playerRecognitionMode: "exact_knowledge",
  });
  assert.equal(fixed.memoryPrivilege, "normal");
  assert.notEqual(fixed.playerRecognitionMode, "exact_knowledge");
  assert.equal(fixed.playerRecognitionMode, "emotional_residue");
});

test("isNpcAllowedToKnowRevealTier：欣蓝覆盖 abyss，普通较低", () => {
  assert.ok(isNpcAllowedToKnowRevealTier("N-010", REVEAL_TIER_RANK.abyss));
  assert.ok(!isNpcAllowedToKnowRevealTier("N-001", REVEAL_TIER_RANK.deep));
});

test("helper 与注册表一致", () => {
  assert.equal(getNpcMemoryPrivilege("N-010"), "xinlan");
  assert.equal(getNpcPlayerRecognitionMode("N-015"), "familiar_pull");
  assert.ok(getNpcAllowedSpawnLocations("N-001").length > 0);
  assert.ok(getNpcBaselineViewOfPlayer("N-003").includes("误闯"));
});

test("夜读老人：memoryPrivilege 与 XINLAN 常量区分", () => {
  assert.equal(XINLAN_NPC_ID, "N-010");
  assert.equal(getNpcMemoryPrivilege("N-011"), "night_reader");
});
