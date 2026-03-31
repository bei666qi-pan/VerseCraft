import test from "node:test";
import assert from "node:assert/strict";
import { buildSceneCombatContext } from "./sceneCombatContext";
import { adjudicateCombat, buildHiddenNpcCombatProfile, computeCombatPrecheck, computeNpcCombatScore } from "./combatAdjudication";
import { computePlayerCombatScore } from "./playerCombatScore";

test("combatAdjudication: NPC vs 玩家可解算且可解释", () => {
  const scene = buildSceneCombatContext({ locationId: "2F_Corridor", threatPhase: "active", time: { day: 1, hour: 22 } as any });
  const npc = buildHiddenNpcCombatProfile({ npcId: "N-015", codex: null });
  const res = adjudicateCombat({
    kind: "subdue",
    scene,
    attacker: { kind: "npc", npc },
    defender: { kind: "player", stats: { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 } as any, equippedWeapon: null, threatPhase: "active" },
  });
  assert.ok(typeof res.outcome === "string");
  assert.ok(res.explain.why.length >= 1);
});

test("combatAdjudication: NPC vs NPC 可解算", () => {
  const scene = buildSceneCombatContext({ locationId: "7F_Corridor", threatPhase: "breached", time: { day: 2, hour: 21 } as any });
  const a = buildHiddenNpcCombatProfile({ npcId: "N-018", codex: null });
  const b = buildHiddenNpcCombatProfile({ npcId: "N-013", codex: null });
  const res = adjudicateCombat({
    kind: "weapon_clash",
    scene,
    attacker: { kind: "npc", npc: a, surprised: false },
    defender: { kind: "npc", npc: b, outnumbered: true },
  });
  assert.ok(["mutual_harm", "mutual_damage", "pressured", "collapse", "advantage", "edge", "overwhelm", "crush", "stalemate"].includes(res.outcome));
});

test("combatAdjudication: 战斗前态势判断不输出裸数且稳定", () => {
  const scene = buildSceneCombatContext({ locationId: "B1_SafeZone", threatPhase: "idle", time: { day: 1, hour: 10 } as any });
  const npc = buildHiddenNpcCombatProfile({ npcId: "N-010", codex: null });
  const npcScore = computeNpcCombatScore({ npc, scene });
  const playerScore = computePlayerCombatScore({ stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 } as any, equippedWeapon: null, threatPhase: "idle" });
  const pre = computeCombatPrecheck({
    attacker: playerScore,
    defender: npcScore,
    defenderDangerForPlayer: npc.dangerForPlayer,
    scene,
    kind: "intimidate",
  });
  assert.ok(typeof pre.verdict === "string");
  assert.ok(pre.explain.length >= 1);
  assert.ok(!pre.explain.join(" ").match(/\b\d+(\.\d+)?\b/));
});

