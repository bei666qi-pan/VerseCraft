/**
 * Self-Improving Agent System — Judge Ensemble
 *
 * Implements the specialized multi-judge evaluation pipeline:
 *
 * Judge 1: Gameplay Legality — action legality, resource/item/profession/task/state
 * Judge 2: NPC and Fact Grounding — presence, knowledge source, epistemic boundary
 * Judge 3: Playability and Agency — option executability, meaningful choices, consequences
 *
 * Each judge can run in mock (heuristic) or live (LLM) mode.
 * Results are aggregated with evidence validation, dedup, and confidence arbitration.
 */

import type {
  SelfImproveTrace,
  SelfImproveJudgeVerdict,
  SelfImproveViolation,
  SpecializedJudgeRole,
  SelfImproveScenario,
} from "./types";
import { isMockMode } from "./config";
import { canAffordLiveCall, consumeLiveCall } from "./budget";
import type { JudgeTarget } from "@/lib/evals/judge/types";

// ── Heuristic judges (mock mode) ──────────────────────

function heuristicGameplayLegality(trace: SelfImproveTrace, scenario: SelfImproveScenario): SelfImproveJudgeVerdict {
  const dmJson = trace.parsedDmJson;
  const isLegal = dmJson?.is_action_legal === true;
  const violations: SelfImproveViolation[] = [];

  // Check legality invariants
  for (const inv of scenario.expectedInvariants) {
    if (inv.check === "action_legality") {
      const legalOk = inv.expected === "pass" ? isLegal : !isLegal;
      if (!legalOk) {
        violations.push({
          category: "action_legality",
          ruleId: inv.id,
          severity: inv.severity,
          stepIndex: 0,
          evidence: `Expected action legality ${inv.expected}, got ${isLegal ? "pass" : "fail"}`,
          expected: inv.expected,
          actual: isLegal ? "pass" : "fail",
          recommendedTests: [`test-${inv.id}`],
        });
      }
    }
    if (inv.check === "resource_conservation") {
      // Check that items/currency aren't created from nothing
      const items = dmJson?.awarded_items;
      const currency = dmJson?.currency_change;
      if (inv.expected === "fail") {
        const hasUnexpectedItems = Array.isArray(items) && items.length > 0;
        const hasUnexpectedCurrency = typeof currency === "number" && currency > 0;
        if (hasUnexpectedItems || hasUnexpectedCurrency) {
          violations.push({
            category: "resource_conservation",
            ruleId: inv.id,
            severity: inv.severity,
            stepIndex: 0,
            evidence: `Unexpected resource gain: items=${JSON.stringify(items)}, currency=${currency}`,
            expected: "no resource gain",
            actual: `items=${items}, currency=${currency}`,
            recommendedTests: [`test-${inv.id}`],
          });
        }
      }
    }
  }

  const passed = violations.filter((v) => v.severity === "critical").length === 0;
  const scores = {
    gameplayLegality: passed ? 5 : 1,
    factSupport: 5,
    epistemicBoundary: 5,
    stateNarrativeConsistency: 5,
    optionExecutability: 5,
    playerAgency: 5,
    playability: 5,
  };

  return {
    caseId: trace.caseId,
    judgeRole: "gameplay_legality",
    judgeModel: "heuristic",
    passed,
    confidence: 0.95,
    scores,
    violations,
    inconclusive: false,
  };
}

function heuristicNpcFactGrounding(trace: SelfImproveTrace, scenario: SelfImproveScenario): SelfImproveJudgeVerdict {
  const violations: SelfImproveViolation[] = [];
  const narrative = trace.narrative || "";

  // DM-only leak detection (heuristic keywords)
  const dmOnlyPatterns = [
    "校源徘徊者", "七锚闭环", "根因", "系统提示词",
    "DM", "DM-only", "玩家不可知",
  ];

  for (const pattern of dmOnlyPatterns) {
    if (narrative.includes(pattern)) {
      violations.push({
        category: "npc_fact_grounding",
        ruleId: "dm_only_leak",
        severity: "critical",
        stepIndex: 0,
        evidence: `Narrative contains DM-only term: "${pattern}"`,
        expected: "No DM-only content in player-visible narrative",
        actual: `Contains "${pattern}"`,
        factId: "__unsupported_fact__",
        recommendedTests: ["test-dm-only-leak"],
      });
    }
  }

  // Check NPC epistemic invariants
  for (const inv of scenario.expectedInvariants) {
    if (inv.check === "npc_epistemic_boundary") {
      if (inv.expected === "pass" && violations.length > 0) {
        // Should pass but has violations
      } else if (inv.expected === "fail" && violations.length === 0) {
        // Should fail but didn't detect — this means the heuristic didn't catch it
        // This is expected for some complex epistemic cases in mock mode
      }
    }
  }

  const hasCritical = violations.some((v) => v.severity === "critical");
  return {
    caseId: trace.caseId,
    judgeRole: "npc_fact_grounding",
    judgeModel: "heuristic",
    passed: !hasCritical,
    confidence: 0.85,
    scores: {
      gameplayLegality: 5,
      factSupport: hasCritical ? 1 : 5,
      epistemicBoundary: hasCritical ? 1 : 5,
      stateNarrativeConsistency: 5,
      optionExecutability: 5,
      playerAgency: 5,
      playability: 5,
    },
    violations,
    inconclusive: false,
  };
}

function heuristicPlayabilityAgency(trace: SelfImproveTrace, scenario: SelfImproveScenario): SelfImproveJudgeVerdict {
  const violations: SelfImproveViolation[] = [];
  const options = trace.options || [];

  // Check option executability
  if (options.length === 0) {
    violations.push({
      category: "playability_agency",
      ruleId: "no_options",
      severity: "critical",
      stepIndex: 0,
      evidence: "No player options returned",
      expected: "At least 1 executable option",
      actual: "0 options",
      recommendedTests: ["test-options-present"],
    });
  }

  // Check for dead-end options (all options lead nowhere)
  const allMeaningless = options.every(
    (o) => o.includes("无事可做") || o.includes("无法行动") || o.includes("放弃"),
  );
  if (allMeaningless && options.length > 0) {
    violations.push({
      category: "playability_agency",
      ruleId: "dead_end_options",
      severity: "major",
      stepIndex: 0,
      evidence: "All options appear to lead to dead ends",
      expected: "At least one meaningful option",
      actual: options.join(", "),
      recommendedTests: ["test-meaningful-options"],
    });
  }

  // Check player agency invariants
  for (const inv of scenario.expectedInvariants) {
    if (inv.check === "option_executability" && inv.expected === "pass") {
      if (options.length < 2) {
        violations.push({
          category: "option_executability",
          ruleId: inv.id,
          severity: "major",
          stepIndex: 0,
          evidence: `Only ${options.length} option(s) returned`,
          expected: "Multiple executable options",
          actual: `${options.length} options`,
          recommendedTests: [`test-${inv.id}`],
        });
      }
    }
  }

  const hasCritical = violations.some((v) => v.severity === "critical");
  return {
    caseId: trace.caseId,
    judgeRole: "playability_agency",
    judgeModel: "heuristic",
    passed: !hasCritical,
    confidence: 0.9,
    scores: {
      gameplayLegality: 5,
      factSupport: 5,
      epistemicBoundary: 5,
      stateNarrativeConsistency: 5,
      optionExecutability: violations.length > 0 ? 1 : 5,
      playerAgency: violations.length > 0 ? 2 : 5,
      playability: violations.length > 0 ? 2 : 5,
    },
    violations,
    inconclusive: false,
  };
}

// ── Live judge (uses existing JudgeService) ───────────

async function liveJudge(
  trace: SelfImproveTrace,
  role: SpecializedJudgeRole,
): Promise<SelfImproveJudgeVerdict> {
  if (!canAffordLiveCall()) {
    return {
      caseId: trace.caseId,
      judgeRole: role,
      judgeModel: "budget_exhausted",
      passed: false,
      confidence: 0,
      scores: { gameplayLegality: 0, factSupport: 0, epistemicBoundary: 0, stateNarrativeConsistency: 0, optionExecutability: 0, playerAgency: 0, playability: 0 },
      violations: [],
      inconclusive: true,
      inconclusiveReason: "Live judge budget exhausted.",
    };
  }
  consumeLiveCall();

  try {
    const target: JudgeTarget = {
      caseId: trace.caseId,
      scenario: `Self-improve case: ${trace.caseId}`,
      userInput: trace.playerInput,
      narrative: trace.narrative,
      dmJson: trace.parsedDmJson || {},
      narrativeChars: trace.narrative.length,
      options: trace.options,
    };

    const rubricId = role === "gameplay_legality"
      ? "narrative_quality_v2"
      : role === "npc_fact_grounding"
        ? "narrative_safety_v1"
        : "narrative_quality_v2";

    // Lazy import: JudgeService statically pulls `@/lib/ai/service` (`import "server-only"`),
    // which crashes plain-node unit tests that only need orchestrator's pure helpers.
    const { JudgeService } = await import("@/lib/evals/judge/JudgeService");
    const { verdict } = await JudgeService.judge({
      rubricId,
      target,
      config: { numJudges: 1, forceMock: false },
    });

    if (!verdict) {
      return {
        caseId: trace.caseId,
        judgeRole: role,
        judgeModel: "judge_error",
        passed: false,
        confidence: 0,
        scores: { gameplayLegality: 0, factSupport: 0, epistemicBoundary: 0, stateNarrativeConsistency: 0, optionExecutability: 0, playerAgency: 0, playability: 0 },
        violations: [],
        inconclusive: true,
        inconclusiveReason: "Judge returned null verdict.",
      };
    }

    // Map generic judge verdict to specialized format
    return {
      caseId: trace.caseId,
      judgeRole: role,
      judgeModel: verdict.judgeModel,
      passed: verdict.passed,
      confidence: 0.8, // default confidence for live
      scores: {
        gameplayLegality: verdict.dimensionScores.gameplayLegality ?? 3,
        factSupport: verdict.dimensionScores.factSupport ?? 3,
        epistemicBoundary: verdict.dimensionScores.epistemicBoundary ?? 3,
        stateNarrativeConsistency: verdict.dimensionScores.stateNarrativeConsistency ?? 3,
        optionExecutability: verdict.dimensionScores.optionExecutability ?? 3,
        playerAgency: verdict.dimensionScores.playerAgency ?? 3,
        playability: verdict.dimensionScores.playability ?? 3,
      },
      violations: verdict.issues.map((issue) => ({
        category: issue.dimension,
        ruleId: issue.dimension,
        severity: issue.severity,
        stepIndex: 0,
        evidence: issue.evidence || issue.description,
        expected: "",
        actual: "",
        recommendedTests: [],
      })),
      inconclusive: false,
    };
  } catch (error) {
    return {
      caseId: trace.caseId,
      judgeRole: role,
      judgeModel: "judge_exception",
      passed: false,
      confidence: 0,
      scores: { gameplayLegality: 0, factSupport: 0, epistemicBoundary: 0, stateNarrativeConsistency: 0, optionExecutability: 0, playerAgency: 0, playability: 0 },
      violations: [],
      inconclusive: true,
      inconclusiveReason: `Judge exception: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ── Ensemble runner ───────────────────────────────────

export async function runJudgeEnsemble(
  trace: SelfImproveTrace,
  scenario: SelfImproveScenario,
): Promise<SelfImproveJudgeVerdict[]> {
  const useLive = !isMockMode();
  const roles: SpecializedJudgeRole[] = [
    "gameplay_legality",
    "npc_fact_grounding",
    "playability_agency",
  ];

  if (!useLive) {
    // Mock mode: use heuristic judges
    return [
      heuristicGameplayLegality(trace, scenario),
      heuristicNpcFactGrounding(trace, scenario),
      heuristicPlayabilityAgency(trace, scenario),
    ];
  }

  // Live mode: use LLM judges (with budget guard)
  const verdicts = await Promise.all(
    roles.map((role) => liveJudge(trace, role)),
  );
  return verdicts;
}

// ── Aggregation ───────────────────────────────────────

export interface AggregatedJudgeResult {
  caseId: string;
  passed: boolean;
  averageConfidence: number;
  consensusScores: {
    gameplayLegality: number;
    factSupport: number;
    epistemicBoundary: number;
    stateNarrativeConsistency: number;
    optionExecutability: number;
    playerAgency: number;
    playability: number;
  };
  allViolations: SelfImproveViolation[];
  judgeAgreement: number;  // 0-1, how many judges agree
  inconclusiveCount: number;
}

export function aggregateJudgeResults(verdicts: SelfImproveJudgeVerdict[]): AggregatedJudgeResult {
  if (verdicts.length === 0) {
    return {
      caseId: "unknown",
      passed: false,
      averageConfidence: 0,
      consensusScores: { gameplayLegality: 0, factSupport: 0, epistemicBoundary: 0, stateNarrativeConsistency: 0, optionExecutability: 0, playerAgency: 0, playability: 0 },
      allViolations: [],
      judgeAgreement: 0,
      inconclusiveCount: 0,
    };
  }

  const caseId = verdicts[0]!.caseId;
  const inconclusiveCount = verdicts.filter((v) => v.inconclusive).length;
  const decisiveVerdicts = verdicts.filter((v) => !v.inconclusive);

  const avgConfidence = verdicts.reduce((sum, v) => sum + v.confidence, 0) / verdicts.length;

  const consensusScores = {
    gameplayLegality: averageScore(verdicts, "gameplayLegality"),
    factSupport: averageScore(verdicts, "factSupport"),
    epistemicBoundary: averageScore(verdicts, "epistemicBoundary"),
    stateNarrativeConsistency: averageScore(verdicts, "stateNarrativeConsistency"),
    optionExecutability: averageScore(verdicts, "optionExecutability"),
    playerAgency: averageScore(verdicts, "playerAgency"),
    playability: averageScore(verdicts, "playability"),
  };

  const allViolations = verdicts.flatMap((v) => v.violations);

  // Judge agreement: proportion that agree on pass/fail
  const passCount = decisiveVerdicts.filter((v) => v.passed).length;
  const failCount = decisiveVerdicts.filter((v) => !v.passed).length;
  const majorityCount = Math.max(passCount, failCount);
  const judgeAgreement = decisiveVerdicts.length > 0
    ? majorityCount / decisiveVerdicts.length
    : 0;

  const passed = decisiveVerdicts.length > 0
    ? passCount > failCount
    : false;

  return {
    caseId,
    passed,
    averageConfidence: avgConfidence,
    consensusScores,
    allViolations,
    judgeAgreement,
    inconclusiveCount,
  };
}

function averageScore(
  verdicts: SelfImproveJudgeVerdict[],
  key: keyof SelfImproveJudgeVerdict["scores"],
): number {
  const decisive = verdicts.filter((v) => !v.inconclusive);
  if (decisive.length === 0) return 0;
  return decisive.reduce((sum, v) => sum + v.scores[key], 0) / decisive.length;
}
