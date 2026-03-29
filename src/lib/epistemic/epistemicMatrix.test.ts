import test from "node:test";
import assert from "node:assert/strict";
import { buildActorScopedEpistemicMemoryBlock } from "./actorScopedMemoryBlock";
import { buildNpcEpistemicProfile } from "./builders";
import { detectEpistemicAnomaly } from "./detector";
import {
  enableEpistemicGuard,
  enableEpistemicValidator,
  getEpistemicRolloutFlags,
} from "./featureFlags";
import { forbiddenFactsForActor } from "./guards";
import { XINLAN_NPC_ID } from "./policy";
import type { EpistemicSceneContext, KnowledgeFact } from "./types";
import { applyEpistemicPostGenerationValidation } from "./validator";
import { GOLDEN_EPISTEMIC_DIALOGUE_SCENARIOS } from "./goldenDialogueScenarios";
import { buildEpistemicResiduePerformancePlan } from "./residuePerformance";

const iso = "2026-03-28T12:00:00.000Z";

test("矩阵1：普通 NPC 默认不应 exact 认出主角", () => {
  const p = buildNpcEpistemicProfile("N-201");
  assert.equal(p.remembersPlayerIdentity, "none");
  assert.equal(p.isXinlanException, false);
});

test("矩阵2：欣蓝在强记忆开关下保留例外", () => {
  const p = buildNpcEpistemicProfile(XINLAN_NPC_ID);
  assert.equal(p.isXinlanException, true);
  assert.equal(p.remembersPlayerIdentity, "exact");
});

test("矩阵3/4/5：黄金场景 anomaly 与私域隔离", () => {
  for (const s of GOLDEN_EPISTEMIC_DIALOGUE_SCENARIOS) {
    const scene: EpistemicSceneContext = { presentNpcIds: s.presentNpcIds };
    const profile = buildNpcEpistemicProfile(s.focusNpcId);
    const res = detectEpistemicAnomaly({
      npcId: s.focusNpcId,
      playerInput: s.playerInput,
      allFacts: s.facts,
      scene,
      profile,
      nowIso: iso,
    });
    assert.equal(
      res.anomaly,
      s.expectAnomaly,
      `${s.id}: anomaly mismatch`
    );
    if (s.expectAnomaly && s.minSeverityWhenAnomaly) {
      const order = { low: 0, medium: 1, high: 2 };
      assert.ok(
        order[res.severity] >= order[s.minSeverityWhenAnomaly],
        `${s.id}: severity ${res.severity}`
      );
    }
  }
});

test("矩阵5b：其他 NPC 私域不在当前 actor 的 allowed 集", () => {
  const secret = f("o1", "仅N-002知道的秘密代号夜鸫", "npc", { ownerId: "N-002" });
  const scene: EpistemicSceneContext = { presentNpcIds: ["N-001", "N-002"] };
  const forbidden = forbiddenFactsForActor([secret], "N-001", scene, { nowIso: iso });
  assert.ok(forbidden.some((x) => x.id === "o1"));
});

function f(
  id: string,
  content: string,
  scope: KnowledgeFact["scope"],
  extra?: Partial<KnowledgeFact>
): KnowledgeFact {
  return {
    id,
    content,
    scope,
    sourceType: "memory",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: iso,
    ...extra,
  };
}

test("矩阵6：residue packet 仅标签与约束，无剧情事实句", () => {
  const plan = buildEpistemicResiduePerformancePlan({
    focusNpcId: "N-301",
    profile: buildNpcEpistemicProfile("N-301"),
    anomalyResult: null,
    mem: null,
    latestUserInput: "测试",
    playerContext: '{"hour":20}',
    presentNpcIds: ["N-301"],
    requestId: "golden-residue",
    nowIso: iso,
  });
  if (plan.packet) {
    const j = JSON.stringify(plan.packet);
    assert.ok(!j.includes("上周三"));
    assert.ok(!j.includes("轮回真相"));
    assert.ok(plan.packet.performanceTags.length > 0);
  }
});

test("矩阵7：validator 拦截 narrative 泄密", () => {
  const line = "玩家私藏坐标仅存在于加密终端阿尔法通道";
  const facts = [f("pl", line, "player")];
  const { dmRecord, telemetry } = applyEpistemicPostGenerationValidation({
    dmRecord: { narrative: `他说：${line}`, options: ["嗯", "走"] },
    actorNpcId: "N-401",
    presentNpcIds: ["N-401"],
    allFacts: facts,
    profile: buildNpcEpistemicProfile("N-401"),
    anomalyResult: null,
    nowIso: iso,
  });
  assert.equal(telemetry.validatorTriggered, true);
  assert.ok(!String(dmRecord.narrative).includes(line.replace(/\s+/g, "")));
});

test("矩阵8：validator 不误杀欣蓝合理 world 措辞", () => {
  const canon = "星港学院学制循环与观测者签名规则属于系统正史条目";
  const facts = [f("w", canon, "world", { sourceType: "system_canon" })];
  const profile = buildNpcEpistemicProfile(XINLAN_NPC_ID);
  assert.equal(profile.isXinlanException, true);
  const { dmRecord, telemetry } = applyEpistemicPostGenerationValidation({
    dmRecord: { narrative: canon, options: ["记下"] },
    actorNpcId: XINLAN_NPC_ID,
    presentNpcIds: [XINLAN_NPC_ID],
    allFacts: facts,
    profile,
    anomalyResult: null,
    nowIso: iso,
  });
  assert.equal(telemetry.validatorTriggered, false);
  assert.equal(dmRecord.narrative, canon);
});

test("矩阵9：validator 不破坏结构化数组形态", () => {
  const facts = [f("pl", "玩家只有本人知道的密语阿尔法", "player")];
  const dm: Record<string, unknown> = {
    narrative: "你好。",
    options: ["离开"],
    codex_updates: [{ name: "备忘", detail: "玩家只有本人知道的密语阿尔法" }],
    task_updates: [{ title: "侧写", detail: "无关" }],
    clue_updates: [],
    relationship_updates: [{ npcId: "N-501", trust: 1 }],
  };
  const { dmRecord } = applyEpistemicPostGenerationValidation({
    dmRecord: { ...dm },
    actorNpcId: "N-501",
    presentNpcIds: ["N-501"],
    allFacts: facts,
    profile: buildNpcEpistemicProfile("N-501"),
    anomalyResult: null,
    nowIso: iso,
  });
  assert.ok(Array.isArray(dmRecord.codex_updates));
  assert.ok(Array.isArray(dmRecord.task_updates));
  assert.ok(Array.isArray(dmRecord.clue_updates));
  assert.ok(Array.isArray(dmRecord.relationship_updates));
});

test("矩阵10：认知块字符增量在可控量级（启发式上界）", () => {
  const mem = null;
  const many: KnowledgeFact[] = [];
  for (let i = 0; i < 40; i++) {
    many.push(f(`f${i}`, `事实条目${i}用于填充认知包长度测试`, "world"));
  }
  const base = buildActorScopedEpistemicMemoryBlock({
    mem,
    actorNpcId: "N-601",
    presentNpcIds: ["N-601"],
    allKnowledgeFacts: [],
    profile: buildNpcEpistemicProfile("N-601"),
    anomalyResult: null,
    detectorRan: true,
    nowIso: iso,
  });
  const heavy = buildActorScopedEpistemicMemoryBlock({
    mem,
    actorNpcId: "N-601",
    presentNpcIds: ["N-601"],
    allKnowledgeFacts: many,
    profile: buildNpcEpistemicProfile("N-601"),
    anomalyResult: null,
    detectorRan: true,
    nowIso: iso,
  });
  const delta = heavy.metrics.blockChars - base.metrics.blockChars;
  assert.ok(delta < 9000, `expected bounded prompt growth, got ${delta}`);
  assert.ok(heavy.metrics.blockChars < 64000);
});

test("开关：getEpistemicRolloutFlags 与便捷读取一致", () => {
  const snap = getEpistemicRolloutFlags();
  assert.equal(typeof snap.enableEpistemicGuard, "boolean");
  assert.equal(typeof snap.enableEpistemicValidator, "boolean");
  assert.equal(typeof snap.enableNpcResidue, "boolean");
  assert.equal(typeof snap.enableXinlanStrongMemory, "boolean");
  assert.equal(typeof snap.epistemicDebugLog, "boolean");
  assert.equal(snap.enableEpistemicGuard, enableEpistemicGuard());
  assert.equal(snap.enableEpistemicValidator, enableEpistemicValidator());
});

test("欣蓝强记忆关闭时 isXinlanException 为 false", () => {
  process.env.VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY = "0";
  try {
    const p = buildNpcEpistemicProfile(XINLAN_NPC_ID);
    assert.equal(p.isXinlanException, false);
    assert.equal(p.remembersPlayerIdentity, "none");
  } finally {
    delete process.env.VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY;
  }
});
