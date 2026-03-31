import test from "node:test";
import assert from "node:assert/strict";
import { resolveCombat } from "./resolveCombat";
import { buildSceneCombatContext } from "./sceneCombatContext";

test("resolveCombat: 明显优势 -> overwhelm/advantage", () => {
  const scene = buildSceneCombatContext({ locationId: "2F_Corridor", threatPhase: "active", time: { day: 1, hour: 22 } as any });
  const res = resolveCombat({
    attacker: { kind: "player", actorId: "player", score: 12, breakdown: { base: 0, scene: 0, equipment: 0, psyche: 0, style: 0, total: 12, notes: [] }, styleTags: ["close_quarters"] },
    defender: { kind: "npc", actorId: "N-xxx", score: 3, breakdown: { base: 0, scene: 0, equipment: 0, psyche: 0, style: 0, total: 3, notes: [] }, styleTags: ["unknown"] },
    scene,
    kind: "subdue",
  });
  assert.ok(res.outcome === "overwhelm" || res.outcome === "advantage");
  assert.ok(res.explain.why.length >= 1);
});

test("resolveCombat: 安全区 escape 更倾向 withdraw", () => {
  const scene = buildSceneCombatContext({ locationId: "B1_SafeZone", threatPhase: "idle", time: { day: 1, hour: 10 } as any });
  const res = resolveCombat({
    attacker: { kind: "player", actorId: "player", score: 7, breakdown: { base: 0, scene: 0, equipment: 0, psyche: 0, style: 0, total: 7, notes: [] }, styleTags: ["close_quarters"] },
    defender: { kind: "npc", actorId: "N-015", score: 4, breakdown: { base: 0, scene: 0, equipment: 0, psyche: 0, style: 0, total: 4, notes: [] }, styleTags: ["boundary_guard"] },
    scene,
    kind: "escape",
  });
  assert.equal(res.outcome, "withdraw");
});

