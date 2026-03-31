/**
 * 阶段 9 观测指标（进程内计数器；无外部依赖，便于单测与灰度对比）。
 * 生产可经 analytics / logs 采样导出；此处为可聚合的原始增量。
 */

export type VerseCraftRolloutMetricsSnapshot = {
  settingsTaskBoardRenderedCount: number;
  playerFacingIdLeakCount: number;
  hiddenTaskPrematureVisibleCount: number;
  formalTaskNarrativeGrantAutoOpenCount: number;
  playerFacingTaskCopyFallbackCount: number;
  openingLocalOptionUsageCount: number;
  dynamicOpeningOptionsSuccessCount: number;
  dynamicOpeningOptionsAttemptCount: number;
  monthlyStudentRecognitionMismatchCount: number;
  highCharmFamiliarityOverreachCount: number;
  npcSocialSurfaceUsageCount: number;
  worldFeelPacketUsageCount: number;
  taskVisibilityPolicyFallbackCount: number;
  emptyOptionsTurnCount: number;
  optionsAutoRegenAttemptCount: number;
  optionsAutoRegenSuccessCount: number;
  optionsManualRegenAttemptCount: number;
  optionsManualRegenSuccessCount: number;
  optionsOnlyRegenPathHitCount: number;
  newPlayerGuideDualCoreHitCount: number;
  monthStartStudentRecognitionHitCount: number;
  finalFrameCommitSuccessCount: number;
  finalFrameCommitAttemptCount: number;
  rawFallbackCommitCount: number;
  turnCommitParseFailureCount: number;
  promptCharDeltaSum: number;
  promptCharDeltaSamples: number;
  firstChunkLatencyMsSum: number;
  firstChunkLatencySamples: number;

  // -------- Phase6: turn mode / narrative / anti-cheat / post-rewrite --------
  turnModeNarrativeOnlyCount: number;
  turnModeDecisionRequiredCount: number;
  turnModeSystemTransitionCount: number;
  decisionRequiredHitCount: number;
  narrativeCharsSum: number;
  narrativeCharsSamples: number;
  decisionOptionsFixAttemptCount: number;
  decisionOptionsFixSuccessCount: number;
  protagonistDriftRewriteCount: number;
  worldPostRewriteCount: number;
  languageAntiCheatRewriteCount: number;
  languageAntiCheatFallbackCount: number;

  // -------- Phase7: gameplay loops & admin playstyle --------
  professionTrialOfferedCount: number;
  professionCertifiedCount: number;
  weaponizationPreviewShownCount: number;
  weaponMaintenancePerformedCount: number;
  weaponHighPollutionTurnCount: number;
  survivalLoopPacketUsageCount: number;
  relationshipLoopPacketUsageCount: number;
  investigationLoopPacketUsageCount: number;
  actorSessionMergeCount: number;
  guestMetricsCompletenessCount: number;
  guestMetricsSamples: number;
  adminProfessionMetricsQueryMsSum: number;
  adminProfessionMetricsQueryMsSamples: number;
  adminWeaponMetricsQueryMsSum: number;
  adminWeaponMetricsQueryMsSamples: number;
};

const m = {
  settingsTaskBoardRenderedCount: 0,
  playerFacingIdLeakCount: 0,
  hiddenTaskPrematureVisibleCount: 0,
  formalTaskNarrativeGrantAutoOpenCount: 0,
  playerFacingTaskCopyFallbackCount: 0,
  openingLocalOptionUsageCount: 0,
  dynamicOpeningOptionsSuccessCount: 0,
  dynamicOpeningOptionsAttemptCount: 0,
  monthlyStudentRecognitionMismatchCount: 0,
  highCharmFamiliarityOverreachCount: 0,
  npcSocialSurfaceUsageCount: 0,
  worldFeelPacketUsageCount: 0,
  taskVisibilityPolicyFallbackCount: 0,
  emptyOptionsTurnCount: 0,
  optionsAutoRegenAttemptCount: 0,
  optionsAutoRegenSuccessCount: 0,
  optionsManualRegenAttemptCount: 0,
  optionsManualRegenSuccessCount: 0,
  optionsOnlyRegenPathHitCount: 0,
  newPlayerGuideDualCoreHitCount: 0,
  monthStartStudentRecognitionHitCount: 0,
  finalFrameCommitSuccessCount: 0,
  finalFrameCommitAttemptCount: 0,
  rawFallbackCommitCount: 0,
  turnCommitParseFailureCount: 0,
  promptCharDeltaSum: 0,
  promptCharDeltaSamples: 0,
  firstChunkLatencyMsSum: 0,
  firstChunkLatencySamples: 0,

  turnModeNarrativeOnlyCount: 0,
  turnModeDecisionRequiredCount: 0,
  turnModeSystemTransitionCount: 0,
  decisionRequiredHitCount: 0,
  narrativeCharsSum: 0,
  narrativeCharsSamples: 0,
  decisionOptionsFixAttemptCount: 0,
  decisionOptionsFixSuccessCount: 0,
  protagonistDriftRewriteCount: 0,
  worldPostRewriteCount: 0,
  languageAntiCheatRewriteCount: 0,
  languageAntiCheatFallbackCount: 0,

  professionTrialOfferedCount: 0,
  professionCertifiedCount: 0,
  weaponizationPreviewShownCount: 0,
  weaponMaintenancePerformedCount: 0,
  weaponHighPollutionTurnCount: 0,
  survivalLoopPacketUsageCount: 0,
  relationshipLoopPacketUsageCount: 0,
  investigationLoopPacketUsageCount: 0,
  actorSessionMergeCount: 0,
  guestMetricsCompletenessCount: 0,
  guestMetricsSamples: 0,
  adminProfessionMetricsQueryMsSum: 0,
  adminProfessionMetricsQueryMsSamples: 0,
  adminWeaponMetricsQueryMsSum: 0,
  adminWeaponMetricsQueryMsSamples: 0,
};

export function resetVerseCraftRolloutMetrics(): void {
  for (const k of Object.keys(m) as (keyof typeof m)[]) {
    m[k] = 0;
  }
}

export function incrPlayerFacingIdLeakCount(delta = 1): void {
  m.playerFacingIdLeakCount += delta;
}
export function incrSettingsTaskBoardRenderedCount(delta = 1): void {
  m.settingsTaskBoardRenderedCount += delta;
}
export function incrHiddenTaskPrematureVisibleCount(delta = 1): void {
  m.hiddenTaskPrematureVisibleCount += delta;
}
export function incrFormalTaskNarrativeGrantAutoOpenCount(delta = 1): void {
  m.formalTaskNarrativeGrantAutoOpenCount += delta;
}
export function incrPlayerFacingTaskCopyFallbackCount(delta = 1): void {
  m.playerFacingTaskCopyFallbackCount += delta;
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
export function incrWorldFeelPacketUsageCount(delta = 1): void {
  m.worldFeelPacketUsageCount += delta;
}
export function incrTaskVisibilityPolicyFallbackCount(delta = 1): void {
  m.taskVisibilityPolicyFallbackCount += delta;
}
export function incrEmptyOptionsTurnCount(delta = 1): void {
  m.emptyOptionsTurnCount += delta;
}
export function recordOptionsAutoRegenOutcome(success: boolean): void {
  m.optionsAutoRegenAttemptCount += 1;
  if (success) m.optionsAutoRegenSuccessCount += 1;
}
export function recordOptionsManualRegenOutcome(success: boolean): void {
  m.optionsManualRegenAttemptCount += 1;
  if (success) m.optionsManualRegenSuccessCount += 1;
}
export function incrOptionsOnlyRegenPathHitCount(delta = 1): void {
  m.optionsOnlyRegenPathHitCount += delta;
}
export function incrNewPlayerGuideDualCoreHitCount(delta = 1): void {
  m.newPlayerGuideDualCoreHitCount += delta;
}
export function incrMonthStartStudentRecognitionHitCount(delta = 1): void {
  m.monthStartStudentRecognitionHitCount += delta;
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

export function incrTurnModeCount(mode: "narrative_only" | "decision_required" | "system_transition", delta = 1): void {
  if (mode === "narrative_only") m.turnModeNarrativeOnlyCount += delta;
  else if (mode === "system_transition") m.turnModeSystemTransitionCount += delta;
  else m.turnModeDecisionRequiredCount += delta;
}

export function incrDecisionRequiredHitCount(delta = 1): void {
  m.decisionRequiredHitCount += delta;
}

export function recordNarrativeChars(n: number): void {
  if (!Number.isFinite(n) || n < 0) return;
  m.narrativeCharsSum += Math.trunc(n);
  m.narrativeCharsSamples += 1;
}

export function recordDecisionOptionsFixOutcome(success: boolean): void {
  m.decisionOptionsFixAttemptCount += 1;
  if (success) m.decisionOptionsFixSuccessCount += 1;
}

export function incrProtagonistDriftRewriteCount(delta = 1): void {
  m.protagonistDriftRewriteCount += delta;
}

export function incrWorldPostRewriteCount(delta = 1): void {
  m.worldPostRewriteCount += delta;
}

export function recordLanguageAntiCheatOutcome(args: { rewritten: boolean; fallback: boolean }): void {
  if (args.rewritten) m.languageAntiCheatRewriteCount += 1;
  if (args.fallback) m.languageAntiCheatFallbackCount += 1;
}

export function incrProfessionTrialOfferedCount(delta = 1): void {
  m.professionTrialOfferedCount += delta;
}
export function incrProfessionCertifiedCount(delta = 1): void {
  m.professionCertifiedCount += delta;
}
export function incrWeaponizationPreviewShownCount(delta = 1): void {
  m.weaponizationPreviewShownCount += delta;
}
export function incrWeaponMaintenancePerformedCount(delta = 1): void {
  m.weaponMaintenancePerformedCount += delta;
}
export function incrWeaponHighPollutionTurnCount(delta = 1): void {
  m.weaponHighPollutionTurnCount += delta;
}
export function incrSurvivalLoopPacketUsageCount(delta = 1): void {
  m.survivalLoopPacketUsageCount += delta;
}
export function incrRelationshipLoopPacketUsageCount(delta = 1): void {
  m.relationshipLoopPacketUsageCount += delta;
}
export function incrInvestigationLoopPacketUsageCount(delta = 1): void {
  m.investigationLoopPacketUsageCount += delta;
}
export function incrActorSessionMergeCount(delta = 1): void {
  m.actorSessionMergeCount += delta;
}
export function recordGuestMetricsCompleteness(args: { complete: boolean }): void {
  m.guestMetricsSamples += 1;
  if (args.complete) m.guestMetricsCompletenessCount += 1;
}
export function recordAdminProfessionMetricsQueryMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  m.adminProfessionMetricsQueryMsSum += ms;
  m.adminProfessionMetricsQueryMsSamples += 1;
}
export function recordAdminWeaponMetricsQueryMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  m.adminWeaponMetricsQueryMsSum += ms;
  m.adminWeaponMetricsQueryMsSamples += 1;
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

export function optionsAutoRegenSuccessRate(): number {
  if (m.optionsAutoRegenAttemptCount <= 0) return 0;
  return m.optionsAutoRegenSuccessCount / m.optionsAutoRegenAttemptCount;
}

export function optionsManualRegenSuccessRate(): number {
  if (m.optionsManualRegenAttemptCount <= 0) return 0;
  return m.optionsManualRegenSuccessCount / m.optionsManualRegenAttemptCount;
}
