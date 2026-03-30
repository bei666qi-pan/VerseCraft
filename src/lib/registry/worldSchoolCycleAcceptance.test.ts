/**
 * 学校泄露 / 七锚 / 校源徘徊者 / 高魅力重连 — 验收级回归（registry + packet + bootstrap + prompt + B1）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NPCS } from "@/lib/registry/npcs";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import {
  MAJOR_NPC_DEEP_CANON,
  MAJOR_NPC_IDS,
  type MajorWandererSubtype,
} from "@/lib/registry/majorNpcDeepCanon";
import { SCHOOL_CYCLE_RESONANCE_NPC_IDS } from "@/lib/registry/schoolCycleIds";
import { MAJOR_NPC_RELINK_SKELETON } from "@/lib/registry/majorNpcRelinkRegistry";
import { buildSchoolCycleArcPacket } from "@/lib/registry/schoolCycleCanon";
import {
  buildCycleLoopPacket,
  buildMajorNpcArcPacket,
  buildSchoolSourcePacket,
} from "@/lib/registry/worldSchoolRuntimePackets";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { buildMajorNpcRelinkPacket } from "@/lib/registry/majorNpcRelinkRegistry";
import { buildRegistryWorldKnowledgeDraft } from "@/lib/worldKnowledge/bootstrap/registryAdapters";
import { buildWorldArcBootstrapFactsForCanon, WORLD_ARC_BOOTSTRAP_SLICES } from "@/lib/registry/worldArcBootstrapSlices";
import { getServicesForLocation } from "@/lib/registry/serviceNodes";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import { getStablePlayerDmSystemPrefix } from "@/lib/playRealtime/playerChatSystemPrompt";

const DEEP_SLICE_IDS = new Set([
  "school_leak_apartment_shell",
  "seven_anchor_loop",
  "school_wanderer_state",
  "ten_day_recycle_narrative",
  "dragon_moon_calibration",
  "originium_closure",
]);

function sortedCopy<T extends string>(arr: readonly T[]): string[] {
  return [...arr].map(String).sort();
}

test("MAJOR_NPC_IDS 与 SCHOOL_CYCLE_RESONANCE_NPC_IDS 集合一致（辅锚六人）", () => {
  assert.deepStrictEqual(sortedCopy(MAJOR_NPC_IDS), sortedCopy(SCHOOL_CYCLE_RESONANCE_NPC_IDS));
});

test("六位高魅力：NPCS 可读 name/location，与 CORE_NPC_PROFILES_V2 homeNode 对齐", () => {
  assert.strictEqual(CORE_NPC_PROFILES_V2.length, 6);
  for (const id of MAJOR_NPC_IDS) {
    const row = NPCS.find((n) => n.id === id);
    assert.ok(row, `NPCS missing ${id}`);
    assert.ok(row!.name.length > 0);
    assert.ok(row!.location.length > 0);
    const prof = CORE_NPC_PROFILES_V2.find((p) => p.id === id);
    assert.ok(prof, `CORE_NPC_PROFILES_V2 missing ${id}`);
    assert.ok(prof!.homeNode.length > 0);
    assert.strictEqual(
      row!.location,
      prof!.homeNode,
      `NPCS.location 应与 CORE_NPC_PROFILES_V2.homeNode 一致：${id}`
    );
    assert.ok(prof!.interaction.questHooks.length >= 1, `${id} questHooks`);
  }
});

test("MAJOR_NPC_DEEP_CANON：public mask / school identity / wanderer 三分类齐全", () => {
  const need: MajorWandererSubtype[] = ["apartment_wanderer", "school_wanderer", "residual_echo"];
  for (const id of MAJOR_NPC_IDS) {
    const m = MAJOR_NPC_DEEP_CANON[id];
    assert.ok(m.publicMaskRole.length > 0);
    assert.ok(m.schoolIdentity.length > 0);
    assert.ok(m.apartmentSurfaceDuty.length > 0);
    for (const w of need) {
      assert.ok(
        m.wandererSubtype.includes(w),
        `${id} missing wanderer ${w}`
      );
    }
    assert.ok(m.survivalRole.length > 0, `${id} survivalRole`);
    assert.ok(m.naturalContactChain.length >= 1, `${id} naturalContactChain`);
    assert.ok(m.riskTriggers.length >= 1, `${id} riskTriggers`);
    assert.ok(m.implementationNotes.length >= 1, `${id} implementationNotes`);
  }
});

test("MAJOR_NPC_RELINK_SKELETON 与 MAJOR_NPC_IDS 键一致", () => {
  assert.deepStrictEqual(Object.keys(MAJOR_NPC_RELINK_SKELETON).sort(), sortedCopy(MAJOR_NPC_IDS));
});

test("school_cycle_arc：surface 不注入深层切片 id；deep 含七锚/校源类切片", () => {
  const surf = buildSchoolCycleArcPacket(REVEAL_TIER_RANK.surface);
  const surfIds = new Set(surf.slices.map((s) => s.id));
  for (const forbidden of DEEP_SLICE_IDS) {
    assert.ok(!surfIds.has(forbidden), `surface must not include ${forbidden}`);
  }
  const deep = buildSchoolCycleArcPacket(REVEAL_TIER_RANK.deep);
  const deepIds = new Set(deep.slices.map((s) => s.id));
  assert.ok(deepIds.has("seven_anchor_loop"));
  assert.ok(deepIds.has("school_wanderer_state"));
});

test("school_source：surface 不注入；deep 注入且含深叙事行", () => {
  const s0 = buildSchoolSourcePacket(REVEAL_TIER_RANK.surface);
  assert.strictEqual(s0.injected, false);
  assert.strictEqual((s0.lines as string[]).length, 0);
  const s2 = buildSchoolSourcePacket(REVEAL_TIER_RANK.deep);
  assert.strictEqual(s2.injected, true);
  const lines = s2.lines as string[];
  assert.ok(lines.some((l) => l.includes("七锚") || l.includes("校源") || l.includes("泄露")));
  const tids = s2.topicIds as string[];
  assert.ok(tids.includes("seven_anchor_loop"));
  assert.strictEqual(s2.revealBand, "deep");
});

test("cycle_loop：surface 为 rumor 带，deep 为 mechanism；fracture+ 带 timeDigest", () => {
  const c0 = buildCycleLoopPacket(REVEAL_TIER_RANK.surface);
  assert.strictEqual(c0.visibleBand, "rumor");
  assert.strictEqual(c0.timeDigest, null);
  const sigs = parsePlayerWorldSignals(
    "游戏时间[第8日 9时]。世界标记：无。锚点解锁：B1[1]，1F[1]，7F[0]。",
    null
  );
  const c1 = buildCycleLoopPacket(REVEAL_TIER_RANK.fracture, sigs);
  assert.ok(c1.timeDigest && typeof (c1.timeDigest as { pos: number }).pos === "number");
  const c2 = buildCycleLoopPacket(REVEAL_TIER_RANK.deep, sigs);
  assert.strictEqual(c2.visibleBand, "mechanism");
  assert.ok(c2.timeDigest);
});

test("major_npc_arc：surface 仅职能壳；deep 给欣蓝 dutyEcho + 校源残响 hint", () => {
  const ctx = "游戏时间[第1日 0时]。用户位置[1F_PropertyOffice]。世界标记：无。";
  const signals = parsePlayerWorldSignals(ctx, null);
  const relink = buildMajorNpcRelinkPacket({
    playerContext: ctx,
    signals,
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  const arc0 = buildMajorNpcArcPacket({
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
    relinkEntries: relink.entries,
  });
  const row0 = (arc0.nearby as Record<string, unknown>[])[0];
  assert.strictEqual(row0?.id, "N-010");
  assert.ok(!("dutyEchoHint" in row0!));
  assert.ok(!("schoolResidueHint" in row0!));

  const arc1 = buildMajorNpcArcPacket({
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
    relinkEntries: relink.entries,
  });
  const row1 = (arc1.nearby as Record<string, unknown>[])[0];
  assert.ok(typeof row1?.dutyEchoHint === "string" && (row1.dutyEchoHint as string).length > 0);

  const arc2 = buildMajorNpcArcPacket({
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.deep,
    relinkEntries: relink.entries,
  });
  const row2 = (arc2.nearby as Record<string, unknown>[])[0];
  assert.ok(typeof row2?.schoolResidueHint === "string");
  assert.ok(typeof row2?.residualEchoHint === "string");
  assert.ok(row2?.relinkSignals);
});

test("欣蓝：fracture+ packet 允许「职责回声」hint（叙事可表现异常熟悉，非全盘剧透）", () => {
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
  assert.ok(xin && xin.deepEchoUnlocked);
  const arc = buildMajorNpcArcPacket({
    nearbyNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
    relinkEntries: relink.entries,
  });
  const row = (arc.nearby as { dutyEchoHint?: string; relinkSignals?: { deepEchoLicensed?: boolean } }[])[0];
  assert.ok(row?.dutyEchoHint);
  assert.strictEqual(row?.relinkSignals?.deepEchoLicensed, true);
});

test("world knowledge bootstrap：world_arc 实体与 chunk、sourceRef、reveal tag", () => {
  const draft = buildRegistryWorldKnowledgeDraft();
  const worldArcEntities = draft.entities.filter((e) => e.code.startsWith("truth:world_arc:"));
  assert.strictEqual(worldArcEntities.length, WORLD_ARC_BOOTSTRAP_SLICES.length);
  for (const e of worldArcEntities) {
    assert.strictEqual(e.sourceRef, "registry/worldArcBootstrapSlices.ts");
    assert.ok(e.tags.some((t) => t.startsWith("reveal_")), e.code);
  }
  const worldArcChunks = draft.chunks.filter((c) => c.entityCode.startsWith("truth:world_arc:"));
  assert.ok(worldArcChunks.length >= WORLD_ARC_BOOTSTRAP_SLICES.length);
  const facts = buildWorldArcBootstrapFactsForCanon();
  assert.strictEqual(facts.length, WORLD_ARC_BOOTSTRAP_SLICES.length);
  for (const f of facts) {
    assert.ok(f.tags.includes("world_arc"));
    assert.ok(f.tags.some((t) => t.startsWith("reveal_")));
  }
});

test("prompt：stable 前缀体积可控且含 packet 边界句", () => {
  const s = getStablePlayerDmSystemPrefix();
  assert.ok(s.length < 8500, `stable prefix length ${s.length}`);
  assert.ok(s.includes("major_npc_relink_packet"));
  assert.ok(s.includes("no-instant-party"));
  assert.ok(s.includes("reveal-first"));
  assert.ok(s.includes("xinlan-anchor"));
});

test("runtimeContextPackets：minimal 与 full 均含 arc / school_source / relink 键", () => {
  const base = {
    playerContext:
      "游戏时间[第2日 9时]。用户位置[B1_SafeZone]。世界标记：无。锚点解锁：B1[1]，1F[1]，7F[0]。主威胁状态：1F[A-001|active|20]。",
    latestUserInput: "测试",
    playerLocation: "B1_SafeZone",
    serviceState: { shopUnlocked: true, forgeUnlocked: true, anchorUnlocked: true, unlockFlags: {} },
    runtimeLoreCompact: "",
    maxChars: 8000,
  };
  const full = buildRuntimeContextPackets({ ...base, contextMode: "full" });
  const minimal = buildRuntimeContextPackets({ ...base, contextMode: "minimal" });
  for (const text of [full, minimal]) {
    assert.ok(text.includes("major_npc_arc_packet"));
    assert.ok(text.includes("school_source_packet"));
    assert.ok(text.includes("major_npc_relink_packet"));
    assert.ok(text.includes("school_cycle_arc_packet"));
    assert.ok(text.includes("cycle_time_packet"));
    assert.ok(text.includes("school_cycle_experience_packet"));
  }
});

test("兼容性：B1_SafeZone 服务 id 集合稳定", () => {
  const svcs = getServicesForLocation("B1_SafeZone", {});
  const ids = new Set(svcs.map((s) => s.id));
  assert.ok(ids.has("svc_b1_anchor"));
  assert.ok(ids.has("svc_b1_gatekeeper"));
});

test("兼容性：高魅力 questHooks 仍为非空字符串数组", () => {
  for (const p of CORE_NPC_PROFILES_V2) {
    for (const h of p.interaction.questHooks) {
      assert.ok(typeof h === "string" && h.length > 0, `${p.id} hook`);
    }
  }
});
