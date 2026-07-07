/**
 * 长程 Playthrough 模拟器索引
 *
 * 自建薄壳 harness：Player Agent + 游戏循环 + 双层检查器 + 编排
 *
 * 导出：
 * - types: 核心类型定义
 * - playerAgent: 模拟玩家（4 persona）
 * - invariants: 确定性不变量检查器
 * - narrativeJudge: 叙事一致性裁判
 * - orchestrator: 主编排器
 */

// Types
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

// Player Agent
export { PERSONAS, generateMockAction, buildPlayerAgentPrompt } from "./playerAgent";

// Invariants
export { checkAllInvariants, checkSoftlock, createInitialStateSnapshot } from "./invariants";

// Narrative Judge
export { judgeNarrativeConsistencyMock, judgeNarrativeConsistencyLive } from "./narrativeJudge";

// Orchestrator
export { runSinglePlaythrough, runPlaythroughBatch } from "./orchestrator";
