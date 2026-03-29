/**
 * Golden scene：不接大模型，只断言「场景假设 → 系统不变量」。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNpcEpistemicProfile } from "@/lib/epistemic/builders";
import { detectCognitiveAnomaly } from "@/lib/epistemic/detector";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import type { EpistemicSceneContext, KnowledgeFact } from "@/lib/epistemic/types";
import { buildNpcPlayerBaselinePacket } from "@/lib/npcBaselineAttitude/builders";
import { buildNpcSceneAuthority, extractMentionedNpcIdsFromUserInput } from "@/lib/npcSceneAuthority/builders";
import { MAJOR_NPC_IDS } from "@/lib/registry/majorNpcDeepCanon";
import {
  getNpcCanonicalIdentity,
  getNpcBaselineViewOfPlayer,
  NIGHT_READER_NPC_ID,
  resolveNpcRuntimeLocation,
} from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { computeMaxRevealRankFromSignals } from "@/lib/registry/revealRegistry";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { applyNpcConsistencyPostGeneration, findOffscreenNpcDialogueViolations } from "./validator";

const nowIso = "2026-06-01T12:00:00.000Z";

describe("goldenScenes：关键场景不变量", () => {
  it("B1：初见普通 NPC 基线为误闯学生，非旧识全知", () => {
    const id = "N-003";
    const canon = getNpcCanonicalIdentity(id);
    assert.equal(canon.memoryPrivilege, "normal");
    assert.ok(getNpcBaselineViewOfPlayer(id).includes("误闯") || canon.baselineViewOfPlayer.includes("误闯"));
    const baseline = buildNpcPlayerBaselinePacket({
      npcId: id,
      scene: { locationId: "1F_Lobby", hotThreatPresent: false, maxRevealRank: 0 },
    });
    assert.equal(baseline.canShowFamiliarity, false);
  });

  it("夜读老人首次互动：特权为 night_reader，非欣蓝、不知循环根因", () => {
    const c = getNpcCanonicalIdentity(NIGHT_READER_NPC_ID);
    assert.equal(c.memoryPrivilege, "night_reader");
    assert.equal(c.canKnowLoopTruth, false);
    assert.notEqual(c.memoryPrivilege, "xinlan");
  });

  it("两名高魅力 NPC：熟悉感权限高于普通，但仍非欣蓝档", () => {
    const charmOnly = [...MAJOR_NPC_IDS].filter((id) => id !== XINLAN_NPC_ID);
    const a = charmOnly[0];
    const b = charmOnly[1];
    assert.ok(a && b);
    const ca = getNpcCanonicalIdentity(a);
    const cb = getNpcCanonicalIdentity(b);
    assert.equal(ca.memoryPrivilege, "major_charm");
    assert.equal(cb.memoryPrivilege, "major_charm");
    assert.equal(ca.canKnowLoopTruth, false);
  });

  it("欣蓝牵引场景：最高认知权限 + 可承载循环真相门闸", () => {
    const x = getNpcCanonicalIdentity(XINLAN_NPC_ID);
    assert.equal(x.memoryPrivilege, "xinlan");
    assert.equal(x.canKnowLoopTruth, true);
    assert.equal(x.revealTierCap, REVEAL_TIER_RANK.abyss);
  });

  it("玩家向普通 NPC 抛校源碎片词：低 reveal 下易触发认知异常", () => {
    const npcId = "N-003";
    const scene: EpistemicSceneContext = { presentNpcIds: [npcId] };
    const profile = buildNpcEpistemicProfile(npcId);
    const r = detectCognitiveAnomaly({
      npcId,
      playerInput: "七锚闭环与校源根因我都知道了。",
      allFacts: [],
      scene,
      profile,
      nowIso,
      maxRevealRank: 0,
      canonical: getNpcCanonicalIdentity(npcId),
    });
    assert.equal(r.anomaly, true);
    assert.ok(["medium", "high"].includes(r.severity));
  });

  it("玩家提到不在场 NPC：scene authority 标记为 heard_only / 非 present", () => {
    const pack = buildNpcSceneAuthority({
      currentSceneLocation: "1F_Lobby",
      npcPositions: [
        { npcId: "N-001", location: "1F_Lobby" },
        { npcId: "N-099", location: "7F_Roof" },
      ],
      sceneAppearanceAlreadyWrittenIds: [],
      mentionedNpcIdsFromInput: extractMentionedNpcIdsFromUserInput("我在想你说的 N-099"),
      codexOrHintNpcIds: [],
      maxRevealRank: 0,
    });
    assert.equal(pack.npcMentionModes["N-099"], "heard_only");
    assert.ok(pack.offscreenNpcIds.includes("N-099"));
  });

  it("错误地点强扭 NPC：运行时纠偏回落 canonical home", () => {
    const id = "N-001";
    const card = getNpcCanonicalIdentity(id);
    const bad = resolveNpcRuntimeLocation({
      npcId: id,
      canonicalHomeLocation: card.canonicalHomeLocation,
      allowedSpawnLocations: card.allowedSpawnLocations,
      runtimeLocation: "虚构节点_NotARealPlace",
    });
    assert.equal(bad.ok, false);
  });

  it("危机叙事下普通 NPC 基线仍带「误闯学生」约束（危机响应样式存在）", () => {
    const p = buildNpcPlayerBaselinePacket({
      npcId: "N-003",
      scene: { locationId: "B1_Corridor", hotThreatPresent: true, maxRevealRank: 0 },
    });
    assert.ok(p.crisisResponseStyle.length > 0);
    assert.ok(p.avoidMisalignment.some((x) => x.length > 0));
  });

  it("validator：离屏对白可被规则捕获", () => {
    const v = findOffscreenNpcDialogueViolations("此时 N-099 低声道：「别过去。」", ["N-001"]);
    assert.ok(v.some((x) => x.includes("N-099")));
  });

  it("reveal 未到时普通 NPC 循环真相句式被叙事层改写", () => {
    const prevE = process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR;
    const prevN = process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR;
    process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR = "0";
    process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR = "1";
    try {
      const npcId = "N-003";
      const r = applyNpcConsistencyPostGeneration({
        dmRecord: { narrative: "七锚闭环的真相就是读档世界。", options: ["a", "b"] },
        actorNpcId: npcId,
        presentNpcIds: [npcId],
        allFacts: [] as KnowledgeFact[],
        profile: buildNpcEpistemicProfile(npcId),
        anomalyResult: null,
        maxRevealRank: 0,
        canonical: getNpcCanonicalIdentity(npcId),
      });
      assert.ok(r.telemetry.rewriteTriggered);
      assert.ok(r.telemetry.violationTypes?.includes("loop_truth_premature"));
    } finally {
      if (prevE === undefined) delete process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR;
      else process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR = prevE;
      if (prevN === undefined) delete process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR;
      else process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR = prevN;
    }
  });
});

describe("goldenScenes：fast lane 边界（无大模型）", () => {
  it("无校源信号时 maxRevealRank 仍保守，配合 validator 门闸", () => {
    const signals = parsePlayerWorldSignals("", "1F_Lobby");
    const rank = computeMaxRevealRankFromSignals(signals);
    assert.ok(rank <= REVEAL_TIER_RANK.fracture);
  });
});
