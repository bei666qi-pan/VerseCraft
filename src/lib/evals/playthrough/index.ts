/**
 * 长程 Playthrough 模拟器索引（v3）
 *
 * 自建薄壳 harness：Player Agent + 游戏循环 + 双层检查器 + 编排
 *
 * 导出：
 * - types: 核心类型定义
 * - playerAgent: 模拟玩家（4 persona）
 * - invariants: 确定性不变量检查器（v3 含 DM-only 泄漏、NPC 复活、状态跳变）
 * - narrativeJudge: 叙事一致性裁判
 * - sutAdapter: SUT 适配器（mock / HTTP live）
 * - scenarios: 场景库（20+ 场景 × 4 路径）
 * - orchestrator: 主编排器（v3 含 scenario + SUT + trace artifact + 失败聚类）
 */

export type {
  PersonaType,
  PersonaConfig,
  GameStateSnapshot,
  PlaythroughTranscript,
  TranscriptStep,
  InvariantCheckResult,
  InvariantViolation,
  NarrativeConsistencyResult,
  ConsistencyIssue,
  PlaythroughRunResult,
  PlaythroughRunSummary,
  PlaythroughRunConfig,
  TerminatedReason,
} from "./types";

export { PERSONAS, generateMockAction, buildPlayerAgentPrompt } from "./playerAgent";

export {
  checkAllInvariants,
  checkSoftlock,
  createInitialStateSnapshot,
  detectNpcResurrections,
  detectNarrativeRepetitions,
  detectStateNarrativeContradictions,
  detectNarrativeOriginiumInconsistency,
  detectWeaponUpdateConsistency,
  detectProfessionChangeConsistency,
  detectNpcStateChurn,
  detectRelationshipDrift,
} from "./invariants";
export type { NpcResurrectionResult, NarrativeRepetitionResult, StateNarrativeContradiction, SoftlockCheckResult, NarrativeOriginiumInconsistency, WeaponUpdateInconsistency, ProfessionConsistencyIssue, NpcStateChurnResult, RelationshipDriftResult } from "./invariants";

export { applyDmJsonToState } from "./stateApply";

export { judgeNarrativeConsistencyMock, judgeNarrativeConsistencyLive, judgeNarrativeConsistencyCodex } from "./narrativeJudge";

export {
  createSutAdapter,
  MockSutAdapter,
  HttpSutAdapter,
} from "./sutAdapter";
export type { SutAction, SutResponse, SutAdapter, HttpSutAdapterOptions } from "./sutAdapter";

export {
  SCENARIOS,
  getScenariosByCategory,
  findScenario,
  getScenariosForPersona,
  getScenarioLibraryStats,
} from "./scenarios";
export type { Scenario, ScenarioCategory, ScenarioLibraryStats } from "./scenarios";

export {
  runSinglePlaythroughV3,
  runPlaythroughBatchV3,
  runSinglePlaythrough,
  runPlaythroughBatch,
  clusterFailures,
  getScenarioLibraryCounts,
  buildClientStructuredSnapshot,
} from "./orchestrator";
export type { PlaythroughV3Config, TraceArtifact, FailureCluster } from "./orchestrator";
