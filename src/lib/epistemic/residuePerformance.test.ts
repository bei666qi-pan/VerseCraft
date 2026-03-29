import test from "node:test";
import assert from "node:assert/strict";
import { coerceToEpistemicMemory, mergeEpistemicResidueUseIntoSessionDbRow, type SessionMemoryRow } from "@/lib/memoryCompress";
import { buildNpcEpistemicProfile } from "./builders";
import { XINLAN_NPC_ID } from "./policy";
import type { EpistemicAnomalyResult } from "./types";
import {
  buildEpistemicResiduePerformancePlan,
  detectResidueTriggers,
} from "./residuePerformance";

const iso = "2026-03-28T12:00:00.000Z";

const emptyAnomaly = (npcId: string): EpistemicAnomalyResult => ({
  anomaly: false,
  npcId,
  severity: "low",
  reactionStyle: "confused",
  triggerFactIds: [],
  requiredBehaviorTags: [],
  forbiddenResponseTags: [],
  mustInclude: [],
  mustAvoid: [],
});

test("detectResidueTriggers：关键词、夜间与在场", () => {
  const t = detectResidueTriggers({
    latestUserInput: "我想起轮回与七锚的事，这里很危险。",
    playerContext: '{"hour":19}',
    focusNpcId: "N-001",
    presentNpcIds: ["N-001"],
    anomaly: false,
  });
  assert.ok(t.includes("keyword_echo"));
  assert.ok(t.includes("night_pressure"));
  assert.ok(t.includes("proximity_dialogue"));
  assert.ok(t.includes("crisis_tone"));
});

test("普通 NPC：packet 不含可核对旧事命题", () => {
  const npc = "N-888";
  const profile = buildNpcEpistemicProfile(npc);
  let found: ReturnType<typeof buildEpistemicResiduePerformancePlan> | null = null;
  for (let i = 0; i < 300; i++) {
    const plan = buildEpistemicResiduePerformancePlan({
      focusNpcId: npc,
      profile,
      anomalyResult: emptyAnomaly(npc),
      mem: null,
      latestUserInput: "档案室里的终端还在亮着。",
      playerContext: `{"hour":19,"player_location":"LOC_X"}`,
      presentNpcIds: [npc],
      requestId: `t${i}`,
      nowIso: iso,
    });
    if (plan.packet) {
      found = plan;
      break;
    }
  }
  assert.ok(found?.packet);
  const json = JSON.stringify(found!.packet);
  assert.ok(!json.includes("周目具体"));
  assert.ok(found!.packet!.narrativeConstraints.some((c) => c.includes("禁止")));
  assert.equal(found!.packet!.xinlanIntensity, undefined);
});

test("欣蓝：强度更高且带 elevated 标记", () => {
  const profile = buildNpcEpistemicProfile(XINLAN_NPC_ID);
  let found = false;
  let maxS = 0;
  for (let i = 0; i < 400; i++) {
    const plan = buildEpistemicResiduePerformancePlan({
      focusNpcId: XINLAN_NPC_ID,
      profile,
      anomalyResult: { ...emptyAnomaly(XINLAN_NPC_ID), anomaly: true, severity: "high" },
      mem: null,
      latestUserInput: "观测者在看什么？",
      playerContext: '{"hour":20}',
      presentNpcIds: [XINLAN_NPC_ID],
      requestId: `xl${i}`,
      nowIso: iso,
    });
    if (plan.packet) {
      found = true;
      maxS = Math.max(maxS, plan.packet.residueStrength);
      assert.equal(plan.packet.xinlanIntensity, "elevated");
      assert.ok(plan.packet.performanceTags.length >= 4);
    }
  }
  assert.ok(found);
  assert.ok(maxS >= 4);
});

test("anti-repeat：近期用过的 mode 会被轮换", () => {
  const npc = "N-777";
  const profile = buildNpcEpistemicProfile(npc);
  const mem = {
    plot_summary: "p",
    player_status: {},
    npc_relationships: {},
    epistemic_residue_recent_uses: [
      { npcId: npc, mode: "faint_familiarity", iso: "2026-01-01T00:00:00.000Z" },
      { npcId: npc, mode: "aversion", iso: "2026-01-02T00:00:00.000Z" },
      { npcId: npc, mode: "trust_without_reason", iso: "2026-01-03T00:00:00.000Z" },
    ],
  };
  let modes = new Set<string>();
  for (let i = 0; i < 120; i++) {
    const plan = buildEpistemicResiduePerformancePlan({
      focusNpcId: npc,
      profile,
      anomalyResult: emptyAnomaly(npc),
      mem,
      latestUserInput: "你好。",
      playerContext: '{"hour":10}',
      presentNpcIds: [npc],
      requestId: `ar${i}`,
      nowIso: iso,
    });
    if (plan.packet) modes.add(plan.packet.residueMode);
  }
  assert.ok(modes.size >= 2, "expected rotation across seeds");
});

test("retainsEmotionalResidue 为假时不产出 packet", () => {
  const npc = "N-666";
  const profile = { ...buildNpcEpistemicProfile(npc), retainsEmotionalResidue: false };
  const plan = buildEpistemicResiduePerformancePlan({
    focusNpcId: npc,
    profile,
    anomalyResult: emptyAnomaly(npc),
    mem: null,
    latestUserInput: "轮回",
    playerContext: "{}",
    presentNpcIds: [npc],
    requestId: "no-residue",
    nowIso: iso,
  });
  assert.equal(plan.packet, null);
});

test("mergeEpistemicResidueUseIntoSessionDbRow 追加记录", () => {
  const row: SessionMemoryRow = {
    plot_summary: "plot",
    player_status: {},
    npc_relationships: {},
  };
  const db = mergeEpistemicResidueUseIntoSessionDbRow(row, {
    npcId: "N-001",
    mode: "dread",
    iso: iso,
  });
  assert.ok(db);
  const ep = coerceToEpistemicMemory({
    plot_summary: db!.plotSummary,
    player_status: db!.playerStatus,
    npc_relationships: db!.npcRelationships,
  });
  assert.equal(ep?.epistemic_residue_recent_uses?.[0]?.mode, "dread");
});
