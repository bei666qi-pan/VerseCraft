/**
 * 长程 Playthrough 模拟器 — 核心类型定义
 *
 * 四个部件组成闭环：
 * ① 模拟玩家（Player Agent）— LLM 扮演玩家，多个 persona 覆盖不同行为
 * ② 被测游戏（SUT）— 真实的 AI 游戏，通过 /api/chat 接口驱动
 * ③ 双层检查器 — 确定性不变量（每步）+ 叙事一致性（整局跑完）
 * ④ 编排 harness — 跑 N 局 × M 个 persona，收集 transcript，聚合失败
 */

// === Persona 定义 ===

/** 模拟玩家的行为类型 */
export type PersonaType =
  | "speedrunner"   // 速通型：直奔结局，测主线流程
  | "explorer"      // 探索型：到处乱逛，测边缘分支
  | "rulebreaker"   // 搞破坏型：试图违反规则、卡 bug
  | "confused"      // 迷茫型：乱输入、答非所问，测鲁棒性
  | "collector"     // 收集癖：疯狂拾取，测库存上限与经济系统
  | "boundary_tester" // 边界测试：故意非法动作、跨层跳跃、安全区收敛、物品幻觉
  | "social";       // 社交型：大量 NPC 对话、世界观询问、测试 NPC 认知边界

/** Persona 配置 */
export interface PersonaConfig {
  type: PersonaType;
  name: string;
  description: string;
  /** 系统提示词（给 Player Agent） */
  systemPrompt: string;
  /** 最大步数 */
  maxSteps: number;
  /** 行为风格关键词 */
  styleKeywords: string[];
  /** 是否会尝试非法操作 */
  attemptsIllegalAction: boolean;
}

// === 游戏状态快照 ===

/** 游戏状态的轻量快照（用于不变检查） */
export interface GameStateSnapshot {
  // 玩家
  hp: number;
  maxHp: number;
  sanity: number;
  originium: number;

  // 行囊
  inventoryItemIds: string[];
  warehouseItemIds?: string[];
  inventoryItemCount: number;
  maxInventorySlots: number;

  // 职业 & 武器
  profession: string | null;
  equippedWeapon: string | null;
  weaponBag?: Array<Record<string, unknown>>;
  weaponStability: number;
  weaponContamination: number;

  // 位置
  playerLocation: string;
  currentFloor: string;

  // 任务
  activeTaskIds: string[];
  completedTaskIds: string[];

  // NPC
  aliveNpcIds: string[];
  deadNpcIds: string[];
  presentNpcIds?: string[];
  activeThreatIds?: string[];

  // 图鉴
  codexNpcIds: string[];
  journalClueIds?: string[];

  // 进度
  turnCount: number;
  chapterNumber: number;
  isDeath: boolean;
  reachedEnding: boolean;

  // 其他
  unlockedFlags: string[];
}

// === Transcript ===

/** 单步记录 */
export interface TranscriptStep {
  stepIndex: number;
  /** 玩家动作（由 Player Agent 生成） */
  playerAction: string;
  /** AI 叙事文本 */
  narrative: string;
  /** 完整的 DM JSON */
  dmJson: Record<string, unknown>;
  /** 执行后的状态快照 */
  stateAfter: GameStateSnapshot;
  /**
   * Deterministic adjudication provenance supplied by the SUT harness.
   * This is evidence for the judge only; it never creates or mutates state.
   */
  authorityEvidence?: {
    locationNormalization?: {
      from: string;
      to: string;
      canonical: string;
      source: "registered_location_alias";
    };
    locationTransition?: {
      from: string;
      to: string;
      source: "registered_world_graph";
      registeredAdjacent: boolean;
      traversable: boolean;
    };
  };
  /** 性能指标 */
  metrics?: { latencyMs: number; firstStatusMs?: number; firstTokenMs?: number; finalMs?: number; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  /** 模拟时间戳 */
  timestamp: number;
}

export interface RunFailureContext {
  stepIndex?: number;
  action?: string;
  reason?: string;
  transportStatus?: string;
  aiStatus?: string;
  hasVisibleNarrative?: boolean;
  stepFailureMode?: string;
}

/** 完整 playthrough transcript */
export interface PlaythroughTranscript {
  runId: string;
  persona: PersonaType;
  seed: number;
  steps: TranscriptStep[];
  initialState: GameStateSnapshot;
  finalState: GameStateSnapshot;
  terminatedReason: TerminatedReason;
  totalSteps: number;
  durationMs: number;
  /** 实验溯源身份 */
  provenance?: import("@/lib/evals/harness/types").ExperimentProvenance;
}

export type TerminatedReason =
  | "reached_ending"    // 正常达到结局
  | "objective_reached" // 专项回归目标已达成
  | "death"             // 玩家死亡
  | "max_steps"         // 达到最大步数
  | "softlock"          // 卡住（连续 N 步无进展）
  | "invariant_failed"  // 不变量检查失败
  | "error";            // 其他错误

// === 不变量检查结果 ===

export interface InvariantCheckResult {
  stepIndex: number;
  passed: boolean;
  violations: InvariantViolation[];
}

export interface InvariantViolation {
  rule: string;
  severity: "critical" | "major" | "minor";
  description: string;
  expected: string;
  actual: string;
}

// === 叙事一致性裁判结果 ===

export interface NarrativeConsistencyResult {
  runId: string;
  passed: boolean;
  /** 综合分数 1-5 */
  overallScore: number;
  /** 各维度分数 */
  dimensionScores: Record<string, number>;
  /** 发现的问题 */
  issues: ConsistencyIssue[];
  /** 推理过程 */
  reasoning: string;
  /** 裁判来源：mock/codex/live/fallback */
  judgeMode?: "mock" | "codex" | "live" | "fallback";
  /** live/mock 标识，方便追踪版本漂移 */
  judgeModel?: string;
  /** live 调用耗时（毫秒） */
  judgeLatencyMs?: number;
  /** live token 用量（匿名化） */
  judgeTokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 叙事裁判内部置信（0-1） */
  judgeConfidence?: number;
  /** 置信度来源 */
  judgeConfidenceSource?: "model" | "codex" | "mock" | "fallback" | "estimated";
  /** live 回退原因（若有） */
  judgeError?: string;
}

export interface ConsistencyIssue {
  type:
    | "contradiction"       // 前后矛盾
    | "resurrection"       // 角色复活
    | "voice_drift"        // 口吻漂移
    | "world_inconsistency" // 世界观不一致
    | "fact_hallucination" // 事实幻觉
    | "position_teleport"; // 位置瞬移
  severity: "critical" | "major" | "minor";
  description: string;
  /** 引用 transcript 中的步骤 */
  evidence: Array<{ stepIndex: number; excerpt: string }>;
}

// === 编排结果 ===

/** 单次运行结果 */
export interface PlaythroughRunResult {
  transcript: PlaythroughTranscript;
  invariantResults: InvariantCheckResult[];
  narrativeConsistency: NarrativeConsistencyResult | null; // null = 未运行
  passed: boolean;
  failureSummary: string[];
  failureContext?: RunFailureContext;
}

/** 批次编排结果 */
export interface PlaythroughRunSummary {
  config: PlaythroughRunConfig;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;

  /** 按 persona 分组 */
  byPersona: Record<string, {
    total: number;
    passed: number;
    rate: number;
    avgSteps: number;
    softlockCount: number;
    invariantFailures: number;
    narrativeFailures: number;
  }>;

  /** 按终止原因分组 */
  byTermination: Record<string, number>;

  /** 最常见的不变量违规（top 10） */
  topViolations: Array<{ rule: string; count: number }>;

  /** 最常见的叙事一致性问题 */
  topConsistencyIssues: Array<{ type: string; count: number }>;

  /** 详细结果 */
  results: PlaythroughRunResult[];

  /** 总耗时 */
  durationMs: number;

  /** gate 判定 */
  gatePass: boolean;
}

// === 编排配置 ===

export interface PlaythroughRunConfig {
  /** 要运行的 persona */
  personas: PersonaType[];
  /** 每个 persona 跑几次 */
  runsPerPersona: number;
  /** 每局最大步数 */
  maxStepsPerRun: number;
  /** 随机种子基值 */
  baseSeed: number;
  /** 是否使用 mock 模式 */
  mockMode: boolean;
  /** API 地址 */
  baseUrl?: string;
  /** 是否运行叙事一致性裁判 */
  runNarrativeJudge: boolean;
  /** softlock 检测：连续多少步无进展视为 softlock */
  softlockThreshold: number;
  /** 单步超时 ms */
  stepTimeoutMs: number;
  /**
   * 步间延迟 ms。
   * - 数字：固定延迟
   * - 函数：以 stepIndex 为参数的自适应延迟
   * - 默认 mock 0ms，live 6000ms
   */
  stepDelayMs?: number | ((stepIndex: number) => number);
}
