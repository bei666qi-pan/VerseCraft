/**
 * LLM-as-Judge 评测框架
 *
 * 基于 Rubric 的 LLM 裁判系统，支持多裁判聚合、位置随机化和思维链评分。
 */

export {
  JudgeService,
  DEFAULT_JUDGE_CONFIG,
  type JudgeServiceConfig,
} from "./JudgeService";

export {
  getRubric,
  listRubrics,
  listRubricIds,
  registerRubric,
  loadRubricFromFile,
  describeRubric,
} from "./rubricRegistry";

export {
  buildJudgePrompt,
  buildJudgePromptCompact,
  defaultAnchors,
  type JudgePromptInput,
  type JudgePromptOutput,
} from "./judgePrompt";

export {
  parseJudgeVerdict,
  aggregateMultiJudge,
  summarizeJudgeRun,
  evaluateOffline,
  buildBatchJudgePrompts,
  type ExecuteJudgeInput,
  type AggregateMultiJudgeInput,
  type OfflineJudgeInput,
  type BuildBatchJudgePromptsInput,
  type JudgePromptBatch,
  type JudgeTask,
} from "./judgeExecutor";

export type {
  JudgeRubric,
  JudgeDimension,
  JudgeTarget,
  JudgeVerdict,
  JudgeIssue,
  MultiJudgeResult,
  JudgeRunConfig,
  JudgeRunSummary,
  PositionScheme,
  ScoreAnchor,
} from "./types";

export {
  median,
  variance,
  interJudgeAgreement,
  generatePositionScheme,
} from "./types";
