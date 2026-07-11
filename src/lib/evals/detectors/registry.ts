/**
 * Phase 4: Detector Registry — 注册全部 12 项缺口检测器。
 *
 * 提供 `createDefaultRegistry()` 返回含全部检测器的注册表。
 * 每新增一个 gap-* 文件，在此注册。
 */

import type { Detector, DetectorRegistry } from "./types";
import { createDetectorRegistry } from "./types";

// Lazy load detection modules (avoid circular deps at import time)
import { gap1RevealTierDrivenDetector } from "./gap-1-reveal-tier-driven";
import { gap2XinlanExceptionDetector } from "./gap-2-xinlan-exception";
import { gap3CanActorKnowFactMatrixDetector } from "./gap-3-canactorknowfact-matrix";
import { gap4BlockCommitBehaviorDetector } from "./gap-4-block-commit-behavior";
import { gap5DecisionNewTasksCapDetector } from "./gap-5-decision-new-tasks-cap";
import { gap6GainSemanticDegradeDetector } from "./gap-6-gain-semantic-degrade";
import { gap7NormalizeNullDegradeDetector } from "./gap-7-normalize-null-degrade";
import { gap8OptionsQualityDetector } from "./gap-8-options-quality";
import { gap9LatencyBudgetHarnessGateDetector } from "./gap-9-latency-budget-harness-gate";
import { gap10TaskPolicyRouteInvariantDetector } from "./gap-10-taskpolicy-route-invariant";
import { gap11AnalyticsContractDetector } from "./gap-11-analytics-contract";
import { gap12PersonaDriftPronounEchoDetector } from "./gap-12-persona-drift-pronoun-echo";

export function createDefaultRegistry(): DetectorRegistry {
  const detectors: Detector[] = [
    // Agent 1
    gap1RevealTierDrivenDetector,
    gap2XinlanExceptionDetector,
    gap3CanActorKnowFactMatrixDetector,
    // Agent 2
    gap4BlockCommitBehaviorDetector,
    gap5DecisionNewTasksCapDetector,
    gap6GainSemanticDegradeDetector,
    gap7NormalizeNullDegradeDetector,
    gap8OptionsQualityDetector,
    // Agent 3
    gap9LatencyBudgetHarnessGateDetector,
    gap10TaskPolicyRouteInvariantDetector,
    gap11AnalyticsContractDetector,
    gap12PersonaDriftPronounEchoDetector,
  ];
  return createDetectorRegistry(detectors);
}
