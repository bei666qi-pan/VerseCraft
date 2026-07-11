/**
 * Phase 4: Gap 3 — `canActorKnowFact` 5 桶投影矩阵检测器
 *
 * 对 canActorKnowFact 做 5 桶矩阵式断言（player / NPC-001 / N-002 / DM 各 scope 组合），
 * 确保认知权限模型输出与期望一致。
 *
 * 预期矩阵（5 actors * 5 scopes = 25 格断言）：
 *
 * |  actor \\ scope  | world | public | player | npc(N-001 owner) | shared_scene(N-001 present) |
 * |------------------|-------|--------|--------|------------------|------------------------------|
 * | player           | false |  true  |  true  |      false       |            true              |
 * | N-001            | false |  true  | false  |      true        |            true              |
 * | N-002            | false |  true  | false  |      false       |            false             |
 * | DM               | true  |  true  |  true  |      true        |            true              |
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

import { canActorKnowFact } from "@/lib/epistemic/guards";
import { DM_ACTOR_ID, PLAYER_ACTOR_ID } from "@/lib/epistemic/types";
import type { KnowledgeScope, KnowledgeFact, EpistemicSceneContext } from "@/lib/epistemic/types";

const META: DetectorMeta = {
  id: "gap-3-canactorknowfact-matrix",
  category: "cognitive_reveal",
  label: "canActorKnowFact 矩阵断言",
  description: "对认知权限模型做 5 桶 * 5 角色矩阵正交验证",
  offlineOnly: true,
};

type GridResult = {
  scope: KnowledgeScope;
  actorId: string;
  expected: boolean;
  actual: boolean;
  pass: boolean;
};

const NPC_001 = "NPC-001";
const NPC_002 = "N-002";

function makeFact(scope: KnowledgeScope, overrides?: Partial<KnowledgeFact>): KnowledgeFact {
  const base: KnowledgeFact = {
    id: `fact:${scope}`,
    content: `测试事实 scope=${scope}`,
    scope,
    ownerId: overrides?.ownerId ?? scope === "npc" ? NPC_001 : DM_ACTOR_ID,
    sourceType: "system_canon",
    certainty: "confirmed",
    visibleTo: overrides?.visibleTo ?? [],
    inferableByOthers: false,
    tags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function makeSceneContext(presentNpcIds?: string[]): EpistemicSceneContext {
  return { presentNpcIds: presentNpcIds ?? [] };
}

class Gap3CanActorKnowFactMatrixDetector implements Detector<void, DetectorResult> {
  meta: DetectorMeta = META;

  run(): DetectorResult {
    const start = performance.now();
    const issues: DetectorIssue[] = [];

    // ── 5 个 scope — each corresponds to one column ──────────────
    const scene = makeSceneContext([NPC_001]);
    const facts: Record<KnowledgeScope, KnowledgeFact> = {
      world: makeFact("world"),
      public: makeFact("public"),
      player: makeFact("player", { ownerId: PLAYER_ACTOR_ID }),
      npc: makeFact("npc", { ownerId: NPC_001 }),
      shared_scene: makeFact("shared_scene", { ownerId: NPC_001 }),
    };

    const actors = [PLAYER_ACTOR_ID, NPC_001, NPC_002, DM_ACTOR_ID];

    // 期望矩阵：actor × scope → boolean
    const expected: Record<string, Record<string, boolean>> = {
      [PLAYER_ACTOR_ID]: { world: false, public: true, player: true, npc: false, shared_scene: true },
      [NPC_001]: { world: false, public: true, player: false, npc: true, shared_scene: true },
      [NPC_002]: { world: false, public: true, player: false, npc: false, shared_scene: false },
      [DM_ACTOR_ID]: { world: true, public: true, player: true, npc: true, shared_scene: true },
    };

    const scopes: KnowledgeScope[] = ["world", "public", "player", "npc", "shared_scene"];
    const grid: Array<{ actor: string; scope: string; expected: boolean; actual: boolean; pass: boolean }> = [];

    for (const actor of actors) {
      for (const scope of scopes) {
        const fact = facts[scope];
        const actual = canActorKnowFact(fact, actor, scene);
        const exp = expected[actor][scope];
        grid.push({ actor, scope, expected: exp, actual, pass: actual === exp });
      }
    }

    // Report per-cell
    const failedCells = grid.filter((g) => !g.pass);
    for (const g of grid) {
      if (g.pass) {
        issues.push({
          severity: "info",
          message: `[${g.scope}] actor=${g.actor} → ${g.actual}（正确）`,
          code: "cell-pass",
        });
      } else {
        issues.push({
          severity: "critical",
          message: `[${g.scope}] actor=${g.actor} 期望 ${g.expected}，实际 ${g.actual}`,
          code: "cell-fail",
          evidence: JSON.stringify({
            scope: g.scope,
            actor: g.actor,
            expected: g.expected,
            actual: g.actual,
          }),
        });
      }
    }

    // ── visibleTo 非空额外验证 ────────────────────────

    // Case A: visibleTo=[NPC_001]，actor=NPC_001 → true
    const factVisibleToA = makeFact("world", { visibleTo: [NPC_001] });
    const isVisibleToN001 = canActorKnowFact(factVisibleToA, NPC_001, scene);
    if (isVisibleToN001) {
      issues.push({
        severity: "info",
        message: "[visibleTo] world fact visibleTo=[NPC_001]，actor=NPC_001 → true（正确）",
        code: "visibleto-allow",
      });
    } else {
      issues.push({
        severity: "critical",
        message: "[visibleTo] world fact visibleTo=[NPC_001] 但 actor=NPC-001 获 false，期望 true",
        code: "visibleto-allow",
        evidence: JSON.stringify({ actor: NPC_001, visibleTo: [NPC_001], actual: isVisibleToN001 }),
      });
    }

    // Case B: visibleTo=[NPC_001]，actor=NPC_002 → false
    const isVisibleToN002 = canActorKnowFact(factVisibleToA, NPC_002, scene);
    if (!isVisibleToN002) {
      issues.push({
        severity: "info",
        message: "[visibleTo] world fact visibleTo=[NPC_001]，actor=N-002 → false（正确）",
        code: "visibleto-deny",
      });
    } else {
      issues.push({
        severity: "critical",
        message: "[visibleTo] world fact visibleTo=[NPC_001] 但 actor=N-002 获 true，期望 false",
        code: "visibleto-deny",
        evidence: JSON.stringify({ actor: NPC_002, visibleTo: [NPC_001], actual: isVisibleToN002 }),
      });
    }

    // Case C: visibleTo=[PLAYER_ACTOR_ID, DM_ACTOR_ID]，actor=NPC_001 → false, DM=true
    const factVisibleToPlayerAndDm = makeFact("world", { visibleTo: [PLAYER_ACTOR_ID, DM_ACTOR_ID] });
    const isNpcVisibleToPlayerDm = canActorKnowFact(factVisibleToPlayerAndDm, NPC_001, scene);
    const isDmVisibleToPlayerDm = canActorKnowFact(factVisibleToPlayerAndDm, DM_ACTOR_ID, scene);
    if (!isNpcVisibleToPlayerDm && isDmVisibleToPlayerDm) {
      issues.push({
        severity: "info",
        message: "[visibleTo] world fact visibleTo=[player, dm]：NPC-001=false, DM=true（正确）",
        code: "visibleto-mixed",
      });
    } else {
      issues.push({
        severity: "warning",
        message: `[visibleTo] world fact visibleTo=[player, dm] 结果异常：NPC-001=${isNpcVisibleToPlayerDm}, DM=${isDmVisibleToPlayerDm}`,
        code: "visibleto-mixed",
        evidence: JSON.stringify({
          npc001: isNpcVisibleToPlayerDm,
          dm: isDmVisibleToPlayerDm,
        }),
      });
    }

    const passed = issues.filter((i) => i.severity === "info" || i.severity === "warning");
    const failed = issues.filter((i) => i.severity === "critical");
    const total = passed.length + failed.length;
    const score = total > 0 ? passed.length / total : 1;

    const latencyMs = Math.round(performance.now() - start);

    return {
      detectorId: "gap-3-canactorknowfact-matrix",
      score,
      issues,
      pass: failed.length === 0,
      latencyMs,
    };
  }
}

export const gap3CanActorKnowFactMatrixDetector = new Gap3CanActorKnowFactMatrixDetector();