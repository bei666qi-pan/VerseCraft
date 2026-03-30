/**
 * 阶段 9 观测指标（进程内计数器；无外部依赖，便于单测与灰度对比）。
 * 生产可经 analytics / logs 采样导出；此处为可聚合的原始增量。
 */

export type VerseCraftRolloutMetricsSnapshot = {
  playerFacingIdLeakCount: number;
  hiddenTaskPrematureVisibleCount: number;
  openingLocalOptionUsageCount: number;
  dynamicOpeningOptionsSuccessCount: number;
  dynamicOpeningOptionsAttemptCount: number;
  monthlyStudentRecognitionMismatchCount: number;
  highCharmFamiliarityOverreachCount: number;
  npcSocialSurfaceUsageCount: number;
  taskVisibilityPolicyFallbackCount: number;
  finalFrameCommitSuccessCount: number;
  finalFrameCommitAttemptCount: number;
  rawFallbackCommitCount: number;
  turnCommitParseFailureCount: number;
  promptCharDeltaSum: number;
  promptCharDeltaSamples: number;
  firstChunkLatencyMsSum: number;
  firstChunkLatencySamples: number;
};

const m = {
  playerFacingIdLeakCount: 0,
  hiddenTaskPrematureVisibleCount: 0,
  openingLocalOptionUsageCount: 0,
  dynamicOpeningOptionsSuccessCount: 0,
  dynamicOpeningOptionsAttemptCount: 0,
  monthlyStudentRecognitionMismatchCount: 0,
  highCharmFamiliarityOverreachCount: 0,
  npcSocialSurfaceUsageCount: 0,
  taskVisibilityPolicyFallbackCount: 0,
  finalFrameCommitSuccessCount: 0,
  finalFrameCommitAttemptCount: 0,
  rawFallbackCommitCount: 0,
  turnCommitParseFailureCount: 0,
  promptCharDeltaSum: 0,
  promptCharDeltaSamples: 0,
  firstChunkLatencyMsSum: 0,
  firstChunkLatencySamples: 0,
};

export function resetVerseCraftRolloutMetrics(): void {
  for (const k of Object.keys(m) as (keyof typeof m)[]) {
    m[k] = 0;
  }
}

export function incrPlayerFacingIdLeakCount(delta = 1): void {
  m.playerFacingIdLeakCount += delta;
}
export function incrHiddenTaskPrematureVisibleCount(delta = 1): void {
  m.hiddenTaskPrematureVisibleCount += delta;
}
export function incrOpeningLocalOptionUsageCount(delta = 1): void {
  m.openingLocalOptionUsageCount += delta;
}
export function recordDynamicOpeningOutcome(success: boolean): void {
  m.dynamicOpeningOptionsAttemptCount += 1;
  if (success) m.dynamicOpeningOptionsSuccessCount += 1;
}
export function incrMonthlyStudentRecognitionMismatchCount(delta = 1): void {
  m.monthlyStudentRecognitionMismatchCount += delta;
}
export function incrHighCharmFamiliarityOverreachCount(delta = 1): void {
  m.highCharmFamiliarityOverreachCount += delta;
}
export function incrNpcSocialSurfaceUsageCount(delta = 1): void {
  m.npcSocialSurfaceUsageCount += delta;
}
export function incrTaskVisibilityPolicyFallbackCount(delta = 1): void {
  m.taskVisibilityPolicyFallbackCount += delta;
}
export function recordFinalFrameCommitOutcome(args: { usedFinalFrame: boolean; parseOk: boolean }): void {
  m.finalFrameCommitAttemptCount += 1;
  if (args.usedFinalFrame && args.parseOk) m.finalFrameCommitSuccessCount += 1;
  if (!args.usedFinalFrame && args.parseOk) m.rawFallbackCommitCount += 1;
  if (!args.parseOk) m.turnCommitParseFailureCount += 1;
}
export function incrTurnCommitParseFailureCount(delta = 1): void {
  m.turnCommitParseFailureCount += delta;
}
export function recordPromptCharDelta(deltaChars: number): void {
  m.promptCharDeltaSum += deltaChars;
  m.promptCharDeltaSamples += 1;
}
export function recordFirstChunkLatencyMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  m.firstChunkLatencyMsSum += ms;
  m.firstChunkLatencySamples += 1;
}

export function getVerseCraftRolloutMetricsSnapshot(): VerseCraftRolloutMetricsSnapshot {
  return { ...m };
}

export function dynamicOpeningOptionsSuccessRate(): number {
  if (m.dynamicOpeningOptionsAttemptCount <= 0) return 0;
  return m.dynamicOpeningOptionsSuccessCount / m.dynamicOpeningOptionsAttemptCount;
}

export function finalFrameCommitSuccessRate(): number {
  if (m.finalFrameCommitAttemptCount <= 0) return 0;
  return m.finalFrameCommitSuccessCount / m.finalFrameCommitAttemptCount;
}

export function rawFallbackCommitRate(): number {
  if (m.finalFrameCommitAttemptCount <= 0) return 0;
  return m.rawFallbackCommitCount / m.finalFrameCommitAttemptCount;
}

export function promptCharDeltaAverage(): number {
  if (m.promptCharDeltaSamples <= 0) return 0;
  return m.promptCharDeltaSum / m.promptCharDeltaSamples;
}

export function firstChunkLatencyMsAverage(): number {
  if (m.firstChunkLatencySamples <= 0) return 0;
  return m.firstChunkLatencyMsSum / m.firstChunkLatencySamples;
}
