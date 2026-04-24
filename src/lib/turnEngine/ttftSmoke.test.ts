// src/lib/turnEngine/ttftSmoke.test.ts
/**
 * Phase-5: TTFT smoke test.
 *
 * The synchronous portion of the post-model pipeline (validateNarrative +
 * commitTurn + scheduleBackgroundWorldTick's decision step) must stay cheap.
 * The goal here is NOT a micro-benchmark — it is a regression barrier: if a
 * future refactor accidentally turns one of these pure steps into an I/O
 * call or an O(n^2) loop, this test will fail loudly before it lands on the
 * hot path.
 *
 * Budget: p95 wall-clock <= 50ms across 20 iterations in CI. Local dev boxes
 * easily hit <5ms; we leave headroom for loaded CI runners.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateNarrative } from "@/lib/turnEngine/validateNarrative";
import { commitTurn } from "@/lib/turnEngine/commitTurn";
import { decideBackgroundTick } from "@/lib/turnEngine/enqueueBackgroundTick";
import { emptyStateDelta } from "@/lib/turnEngine/computeStateDelta";
import type { NormalizedPlayerIntent, StateDelta } from "@/lib/turnEngine/types";

function makeIntent(): NormalizedPlayerIntent {
  return {
    rawText: "沿着走廊继续前进，留意异响",
    normalizedText: "沿着走廊继续前进",
    kind: "explore",
    slots: {},
    riskTags: [],
    isSystemTransition: false,
    isFirstAction: false,
    clientPurpose: "normal",
  };
}

function makeDelta(): StateDelta {
  const d = emptyStateDelta();
  d.isActionLegal = true;
  d.playerLocation = "三楼走廊";
  d.consumesTime = true;
  d.timeCost = "standard";
  d.newTasks = [{ taskId: "t_phase5_demo", title: "查明异响来源" }];
  return d;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

test("TTFT smoke: validator + commit + tick decision stays under 50ms p95 (20 iterations)", () => {
  const iterations = 20;
  const durations: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const intent = makeIntent();
    const delta = makeDelta();
    const dmRecord: Record<string, unknown> = {
      narrative:
        "你沿着走廊前行，潮湿的空气里带着一丝铁锈味。脚步声在瓷砖上回响，你感觉有人刚刚走过。",
      options: ["继续前进", "贴墙倾听", "回身后退", "检查墙面"],
      player_location: "三楼走廊",
      is_action_legal: true,
      sanity_damage: 0,
      is_death: false,
      awarded_items: [],
      awarded_warehouse_items: [],
    };

    const t0 = performance.now();

    const report = validateNarrative({
      dmRecord,
      delta,
      intent,
      sceneNpcIds: [],
      riskTags: [],
    });
    const { summary } = commitTurn({
      requestId: `req_smoke_${i}`,
      sessionId: "sess_smoke",
      turnIndex: i,
      candidateDmRecord: dmRecord,
      delta,
      validatorReport: report,
    });
    const decision = decideBackgroundTick({
      turnIndex: i,
      dmRecord,
      playerLocation: "三楼走廊",
      npcLocationUpdateCount: 0,
      preflightRiskTags: [],
      dmNarrativePreview: String(dmRecord.narrative),
    });

    const t1 = performance.now();
    durations.push(t1 - t0);

    // Sanity: confirm we actually exercised each step.
    assert.ok(summary.turnIndex === i);
    assert.ok(decision.triggers.length >= 0);
    assert.ok(report.telemetry.totalIssues >= 0);
  }
  durations.sort((a, b) => a - b);
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  assert.ok(p50 < 50, `p50 must be <50ms, got ${p50.toFixed(3)}ms`);
  assert.ok(p95 < 50, `p95 must be <50ms, got ${p95.toFixed(3)}ms`);
});
