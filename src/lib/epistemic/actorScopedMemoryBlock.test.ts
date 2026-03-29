import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionMemoryForDm } from "@/lib/memoryCompress";
import { buildDynamicPlayerDmSystemSuffix } from "@/lib/playRealtime/playerChatSystemPrompt";
import { buildActorScopedEpistemicMemoryBlock } from "./actorScopedMemoryBlock";
import { buildNpcEpistemicProfile } from "./builders";
import { detectEpistemicAnomaly } from "./detector";
import type { EpistemicSceneContext, KnowledgeFact } from "./types";
import { XINLAN_NPC_ID } from "./policy";

const now = "2026-03-01T00:00:00.000Z";

function memFixture(): SessionMemoryForDm {
  return {
    plot_summary: "DM全知摘要含七锚真相",
    player_status: { sanity: 80, location: "1F_Lobby" },
    npc_relationships: { "N-001": { trust: 2 }, "N-010": { trust: 9 }, "N-002": { fear: 1 } },
    public_plot_summary: "大厅里有人在议论电梯",
    scene_public_state: "灯半亮",
    dm_only_truth_summary: "真凶在档案室",
    player_known_summary: "玩家独知纸条内容",
    player_hidden_flags: ["未公开"],
    npc_epistemic_snapshots: [
      {
        npcId: "N-001",
        knownFactIds: ["a"],
        playerPerceptionLevel: "familiar",
        emotionalResidueNotes: "",
      },
      {
        npcId: XINLAN_NPC_ID,
        knownFactIds: ["xinlan_secret"],
        playerPerceptionLevel: "recognized_loop",
        emotionalResidueNotes: "牵引",
      },
    ],
    emotional_residue_markers: [{ actorId: "N-001", note: "不安" }, { actorId: "N-099", note: "远场" }],
  };
}

describe("buildActorScopedEpistemicMemoryBlock", () => {
  it("不同 NPC 焦点时 memory 块内容不同", () => {
    const m = memFixture();
    const facts: KnowledgeFact[] = [];
    const a = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-001",
      presentNpcIds: ["N-001"],
      allKnowledgeFacts: facts,
      profile: buildNpcEpistemicProfile("N-001"),
      detectorRan: true,
      nowIso: now,
    }).block;
    const b = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-002",
      presentNpcIds: ["N-002"],
      allKnowledgeFacts: facts,
      profile: buildNpcEpistemicProfile("N-002"),
      detectorRan: true,
      nowIso: now,
    }).block;
    assert.notEqual(a, b);
    assert.ok(a.includes("focus_npc:N-001"));
    assert.ok(b.includes("focus_npc:N-002"));
  });

  it("普通 NPC 块不含欣蓝快照中的 recognized_loop", () => {
    const m = memFixture();
    const out = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-020",
      presentNpcIds: ["N-020"],
      allKnowledgeFacts: [],
      profile: buildNpcEpistemicProfile("N-020"),
      detectorRan: true,
      nowIso: now,
    }).block;
    assert.ok(!out.includes("recognized_loop"));
    assert.ok(!out.includes("xinlan_secret"));
  });

  it("有 anomaly 时块内出现 cognitive_alert:active", () => {
    const m = memFixture();
    const scene: EpistemicSceneContext = { presentNpcIds: ["N-030"] };
    const facts: KnowledgeFact[] = [
      {
        id: "w",
        content: "地下二层门闩需要三名见证者同时在场",
        scope: "world",
        sourceType: "memory",
        certainty: "confirmed",
        visibleTo: [],
        inferableByOthers: false,
        tags: [],
        createdAt: now,
      },
    ];
    const det = detectEpistemicAnomaly({
      npcId: "N-030",
      playerInput: "地下二层门闩需要三名见证者同时在场",
      allFacts: facts,
      scene,
      profile: buildNpcEpistemicProfile("N-030", { overrides: { remembersPlayerIdentity: "vague" } }),
      nowIso: now,
    });
    assert.equal(det.anomaly, true);
    const out = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-030",
      presentNpcIds: ["N-030"],
      allKnowledgeFacts: facts,
      profile: buildNpcEpistemicProfile("N-030", { overrides: { remembersPlayerIdentity: "vague" } }),
      anomalyResult: det,
      detectorRan: true,
      nowIso: now,
    }).block;
    assert.ok(out.includes("cognitive_alert:active"));
  });

  it("无 anomaly 时不应出现 cognitive_alert:active", () => {
    const m = memFixture();
    const detNo = detectEpistemicAnomaly({
      npcId: "N-040",
      playerInput: "今天天气真好",
      allFacts: [],
      scene: { presentNpcIds: ["N-040"] },
      profile: buildNpcEpistemicProfile("N-040"),
      nowIso: now,
    });
    assert.equal(detNo.anomaly, false);
    const out = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-040",
      presentNpcIds: ["N-040"],
      allKnowledgeFacts: [],
      anomalyResult: detNo,
      detectorRan: true,
      nowIso: now,
    }).block;
    assert.ok(!out.includes("cognitive_alert:active"));
  });

  it("promptCharsDelta 可观测（相对全局未裁剪影子）", () => {
    const base = memFixture();
    const m = {
      ...base,
      dm_only_truth_summary: `${base.dm_only_truth_summary}`.padEnd(120, "密"),
      player_known_summary: `${base.player_known_summary}`.padEnd(120, "独"),
    };
    const { metrics } = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-001",
      presentNpcIds: ["N-001"],
      detectorRan: true,
      nowIso: now,
    });
    assert.equal(metrics.promptCharsDelta, metrics.globalLegacyShadowChars - metrics.blockChars);
    assert.ok(
      metrics.globalLegacyShadowChars > metrics.blockChars,
      `legacy=${metrics.globalLegacyShadowChars} scoped=${metrics.blockChars}`
    );
  });

  it("dynamic suffix 随 actor 块变化", () => {
    const m = memFixture();
    const blockA = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-001",
      presentNpcIds: ["N-001"],
      detectorRan: true,
    }).block;
    const blockB = buildActorScopedEpistemicMemoryBlock({
      mem: m,
      actorNpcId: "N-002",
      presentNpcIds: ["N-002"],
      detectorRan: true,
    }).block;
    const sa = buildDynamicPlayerDmSystemSuffix({
      memoryBlock: blockA,
      playerContext: "ctx",
      isFirstAction: false,
      runtimePackets: "",
      controlAugmentation: "",
    });
    const sb = buildDynamicPlayerDmSystemSuffix({
      memoryBlock: blockB,
      playerContext: "ctx",
      isFirstAction: false,
      runtimePackets: "",
      controlAugmentation: "",
    });
    assert.notEqual(sa, sb);
  });
});
