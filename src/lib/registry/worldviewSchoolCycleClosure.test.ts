/**
 * 世界观·学制循环收口：高魅力六人、旧身份污染、bootstrap seeds、主链路 prompt 拼装（与 worldSchoolCycleAcceptance 互补）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NPC_SOCIAL_GRAPH } from "@/lib/registry/world";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import {
  MAJOR_NPC_DEEP_CANON,
  MAJOR_NPC_IDS,
  buildMajorNpcKeyHintsForPacket,
  type MajorWandererSubtype,
} from "@/lib/registry/majorNpcDeepCanon";
import { SCHOOL_CYCLE_RESONANCE_NPC_IDS } from "@/lib/registry/schoolCycleIds";
import { SCHOOL_CYCLE_RETRIEVAL_SEEDS } from "@/lib/registry/schoolCycleRetrievalSeeds";
import { MAJOR_NPC_BRANCH_SEEDS } from "@/lib/registry/majorNpcBranchSeeds";
import {
  buildSchoolSourcePacket,
  buildMajorNpcArcPacket,
} from "@/lib/registry/worldSchoolRuntimePackets";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { buildMajorNpcRelinkPacket } from "@/lib/registry/majorNpcRelinkRegistry";
import { buildRegistryWorldKnowledgeDraft } from "@/lib/worldKnowledge/bootstrap/registryAdapters";
import { B1_SERVICE_NODES, getServicesForLocation } from "@/lib/registry/serviceNodes";
import {
  buildRuntimeContextPackets,
} from "@/lib/playRealtime/runtimeContextPackets";
import {
  getStablePlayerDmSystemPrefix,
  buildDynamicPlayerDmSystemSuffix,
  composePlayerChatSystemMessages,
} from "@/lib/playRealtime/playerChatSystemPrompt";

const FROZEN_SIX_ORDER = [
  "N-015",
  "N-020",
  "N-010",
  "N-018",
  "N-013",
  "N-007",
] as const;

const WANDERER_SUBTYPES: MajorWandererSubtype[] = [
  "apartment_wanderer",
  "school_wanderer",
  "residual_echo",
];

test("A1：六人 id 冻结且与共振序一致；表层/深层字段齐全；徘徊者子类合法", () => {
  assert.deepEqual([...MAJOR_NPC_IDS], [...FROZEN_SIX_ORDER]);
  assert.deepEqual([...SCHOOL_CYCLE_RESONANCE_NPC_IDS], [...FROZEN_SIX_ORDER]);
  const slots = new Set<number>();
  for (const id of MAJOR_NPC_IDS) {
    const m = MAJOR_NPC_DEEP_CANON[id];
    assert.strictEqual(m.id, id);
    assert.ok(m.publicMaskRole.length > 4);
    assert.ok(m.apartmentSurfaceDuty.length > 4);
    assert.ok(m.schoolIdentity.length > 4);
    assert.ok(m.schoolWandererNote.length > 4);
    assert.ok(m.residualEchoToProtagonist.length > 4);
    assert.ok(m.surfaceFixedLoreParagraph.length > 20);
    assert.ok(m.revealStages.length >= 3);
    slots.add(m.resonanceSlot);
    assert.ok(m.wandererSubtype.length >= 1);
    for (const w of m.wandererSubtype) {
      assert.ok(WANDERER_SUBTYPES.includes(w));
    }
  }
  assert.strictEqual(slots.size, 6);
  for (let s = 1; s <= 6; s++) assert.ok(slots.has(s));
});

test("A2：旧身份污染回归 — social graph / lore 不再残留静态占位与旧壳文案", () => {
  const banned = [
    "（静态占位）",
    "旧电梯工叙事",
    "旧诱饵引导员单一反派壳",
    "无面保安旧设定",
    "旧钢琴亡灵",
  ];
  for (const id of MAJOR_NPC_IDS) {
    const g = NPC_SOCIAL_GRAPH[id];
    assert.ok(g, `${id} graph`);
    const fl = g.fixed_lore ?? "";
    for (const b of banned) {
      assert.ok(!fl.includes(b), `${id} fixed_lore still has: ${b}`);
    }
    const v2 = CORE_NPC_PROFILES_V2.find((p) => p.id === id);
    assert.ok(v2, `${id} CORE_NPC_PROFILES_V2`);
    const ss = v2.interaction.surfaceSecrets.join("；");
    assert.ok(ss.includes("公寓职能面") && ss.includes("异常感"), `${id} profile 双层表层（职能+异常伏笔，无明牌校源答案）`);
  }
  for (const id of MAJOR_NPC_IDS) {
    const m = MAJOR_NPC_DEEP_CANON[id];
    assert.ok(!m.publicMaskRole.includes("电梯工"), `${id} publicMaskRole must not be legacy 电梯工`);
  }
});

test("A2：profiles 六人 id 与 deep canon 对齐", () => {
  const profileIds = new Set(CORE_NPC_PROFILES_V2.map((p) => p.id));
  for (const id of MAJOR_NPC_IDS) {
    assert.ok(profileIds.has(id), `CORE_NPC_PROFILES_V2 missing ${id}`);
  }
});

test("A3：reveal gating — surface 不泄七锚/校源深层；deep 才注入 school_source 提纲", () => {
  const s0 = buildSchoolSourcePacket(REVEAL_TIER_RANK.surface);
  assert.strictEqual(s0.injected, false);
  const text0 = JSON.stringify(s0);
  assert.ok(!text0.includes("七锚") && !text0.includes("校源"));
  const sDeep = buildSchoolSourcePacket(REVEAL_TIER_RANK.deep);
  assert.strictEqual(sDeep.injected, true);
  const lines = sDeep.lines as string[];
  assert.ok(lines.some((l) => l.includes("七锚") || l.includes("校源") || l.includes("泄露")));
});

test("A3：key_npc — surface/fracture 不出现 resonanceSlot；deep 才出现", () => {
  const h0 = buildMajorNpcKeyHintsForPacket({
    nearbyNpcIds: ["N-010", "N-015"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  for (const row of h0) {
    assert.ok(!("resonanceSlot" in row));
  }
  const h1 = buildMajorNpcKeyHintsForPacket({
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
  });
  assert.ok(!("resonanceSlot" in h1[0]!));
  const h2 = buildMajorNpcKeyHintsForPacket({
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.deep,
  });
  assert.ok("resonanceSlot" in h2[0]!);
});

test("A4：stable 前缀体积；minimal/full runtime + compose 主链路", () => {
  const stable = getStablePlayerDmSystemPrefix();
  assert.ok(stable.length < 8000, `stable length ${stable.length}`);
  const base = {
    playerContext:
      "游戏时间[第1日 9时]。用户位置[B1_SafeZone]。世界标记：无。锚点解锁：B1[1]，1F[0]，7F[0]。",
    latestUserInput: "测试",
    playerLocation: "B1_SafeZone",
    serviceState: { shopUnlocked: true, forgeUnlocked: true, anchorUnlocked: true, unlockFlags: {} },
    runtimeLoreCompact: "",
    maxChars: 12000,
  };
  const full = buildRuntimeContextPackets({ ...base, contextMode: "full" });
  const minimal = buildRuntimeContextPackets({ ...base, contextMode: "minimal" });
  assert.ok(full.length <= base.maxChars + 500);
  assert.ok(minimal.length <= base.maxChars + 500);
  for (const pkt of [full, minimal]) {
    const dyn = buildDynamicPlayerDmSystemSuffix({
      memoryBlock: "",
      playerContext: base.playerContext,
      runtimePackets: pkt,
      isFirstAction: false,
    });
    const dual = composePlayerChatSystemMessages(stable, dyn, true);
    assert.strictEqual(dual.length, 2);
    assert.ok(dual[0]!.content.includes("major_npc"));
    const single = composePlayerChatSystemMessages(stable, dyn, false);
    assert.strictEqual(single.length, 1);
    assert.ok(single[0]!.content.length > stable.length);
  }
});

test("A5：B1 服务节点与 questHooks 稳定", () => {
  const safe = new Set(getServicesForLocation("B1_SafeZone", {}).map((s) => s.id));
  assert.ok(safe.has("svc_b1_anchor"));
  assert.ok(safe.has("svc_b1_gatekeeper"));
  const storage = new Set(getServicesForLocation("B1_Storage", {}).map((s) => s.id));
  assert.ok(storage.has("svc_b1_shop"));
  const laundry = new Set(getServicesForLocation("B1_Laundry", {}).map((s) => s.id));
  assert.ok(laundry.has("svc_b1_soft_guidance"));
  assert.strictEqual(B1_SERVICE_NODES.B1_SafeZone?.nodeId, "B1_SafeZone");
  const majorSet = new Set<string>(MAJOR_NPC_IDS);
  for (const p of CORE_NPC_PROFILES_V2.filter((x) => majorSet.has(x.id))) {
    assert.ok(Array.isArray(p.interaction.questHooks));
    assert.ok(p.interaction.questHooks.every((h) => typeof h === "string" && h.length > 0));
  }
});

test("A6：world knowledge — school_cycle_pkg 八条 + cycle_moon + xp_layer 实体 tag/sourceRef/scope", () => {
  const draft = buildRegistryWorldKnowledgeDraft();
  const pkgCodes = new Set(SCHOOL_CYCLE_RETRIEVAL_SEEDS.map((s) => s.code));
  const pkgEntities = draft.entities.filter((e) => pkgCodes.has(e.code));
  assert.strictEqual(pkgEntities.length, SCHOOL_CYCLE_RETRIEVAL_SEEDS.length);
  for (const e of pkgEntities) {
    assert.strictEqual(e.scope, "global");
    assert.ok(e.sourceRef.startsWith("registry/"));
    assert.ok(e.tags.includes("school_cycle_pkg"));
    assert.ok(e.tags.some((t) => t.startsWith("reveal_")));
  }
  const moon = draft.entities.filter((e) => e.sourceRef === "registry/cycleMoonFlashRegistry.ts");
  assert.ok(moon.length >= 1);
  for (const e of moon) {
    assert.strictEqual(e.scope, "global");
    assert.ok(e.tags.some((t) => t.startsWith("reveal_")));
  }
  const xp = draft.entities.filter((e) => e.sourceRef === "registry/playerExperienceSchoolCycleRegistry.ts");
  assert.ok(xp.length >= 1);
  for (const e of xp) {
    assert.strictEqual(e.scope, "global");
    assert.ok(e.tags.includes("scope:global"));
  }
  const branchCodes = new Set(MAJOR_NPC_BRANCH_SEEDS.map((b) => b.code));
  const branchEntities = draft.entities.filter((e) => branchCodes.has(e.code));
  assert.strictEqual(branchEntities.length, MAJOR_NPC_BRANCH_SEEDS.length);
  for (const e of branchEntities) {
    assert.strictEqual(e.scope, "global");
    assert.ok(e.tags.includes("major_npc_branch"));
    assert.ok(e.tags.some((t) => t.startsWith("reveal_")));
    assert.ok(e.tags.some((t) => t.startsWith("hook:")));
  }
});

test("欣蓝：fracture arc 有 dutyEcho 且 relink 许可 deepEcho（合规层熟悉感）", () => {
  const ctx =
    "游戏时间[第2日 0时]。用户位置[1F_PropertyOffice]。图鉴已解锁：欣蓝[npc|好感20]。世界标记：无。";
  const signals = parsePlayerWorldSignals(ctx, null);
  const relink = buildMajorNpcRelinkPacket({
    playerContext: ctx,
    signals,
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
  });
  const xin = relink.entries.find((e) => e.npcId === "N-010");
  assert.ok(xin?.deepEchoUnlocked);
  const arc = buildMajorNpcArcPacket({
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
    relinkEntries: relink.entries,
  });
  const row = (arc.nearby as { dutyEchoHint?: string }[])[0];
  assert.ok(row?.dutyEchoHint && row.dutyEchoHint.length > 0);
});
