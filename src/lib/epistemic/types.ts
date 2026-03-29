/**
 * VerseCraft 认知权限层（阶段 1）：类型定义。
 * 与游玩主链路解耦；后续由 prompt 组装、检测、后验校验引用。
 */

/** 叙述者/编排视角（非游戏内角色） */
export const DM_ACTOR_ID = "__dm__" as const;
/** 玩家在游戏内认知主体 */
export const PLAYER_ACTOR_ID = "player" as const;

export type KnowledgeScope = "world" | "public" | "player" | "npc" | "shared_scene" | "inferred";

export type KnowledgeSourceType = "observation" | "dialogue" | "rumor" | "memory" | "system_canon";

export type KnowledgeCertainty = "suspected" | "heard" | "believed" | "confirmed";

/**
 * 单条可审计知识（最小可用；不要求与 DB 一一对应）。
 */
export interface KnowledgeFact {
  id: string;
  content: string;
  scope: KnowledgeScope;
  /** scope=npc 时表示知晓该事实的 NPC id */
  ownerId?: string;
  sourceType: KnowledgeSourceType;
  certainty: KnowledgeCertainty;
  /**
   * 非空时：仅列表内 actor 可读（actorId 与 PLAYER_ACTOR_ID / DM_ACTOR_ID / N-xxx 对齐）。
   * 空数组：按 scope 默认规则解析（见 guards）。
   */
  visibleTo: string[];
  /** 为 true 时，其他在场者可「感觉不对劲」类推断，但仍不应当成本人亲历事实 */
  inferableByOthers: boolean;
  tags: string[];
  createdAt: string;
  /** ISO 或空表示不过期 */
  expiresAt?: string | null;
}

/** 记忆/身份策略（可独立于人格心核配置） */
export interface NpcMemoryPolicy {
  remembersPlayerIdentity: "none" | "vague" | "exact";
  remembersPastLoops: boolean;
  retainsEmotionalResidue: boolean;
  canRecognizeForbiddenKnowledge: boolean;
  /** 0..1，越高越不易被玩家「试探性越界」唬住 */
  surpriseThreshold?: number;
  /** -1..1，正值更易先入为主怀疑 */
  suspicionBias?: number;
}

/**
 * 单 NPC 认知配置 + 元数据。
 * `isXinlanException` 由 policy/builder 显式写入，供下游分支（禁止仅靠注释）。
 */
export interface NpcEpistemicProfile extends NpcMemoryPolicy {
  npcId: string;
  isXinlanException: boolean;
}

/** 情绪残响通道：与「可引用的命题事实」分离 */
export type EmotionalResidueMode = "none" | "mood_only" | "mood_plus_identity_anchor";

export interface EpistemicRuntimeRefs {
  revealTierRank?: number;
  /** 可选：已注入的 packet 名列表（仅引用，不承载正文） */
  runtimePacketKeys?: string[];
}

/**
 * 单回合或单次推理用的认知切片（阶段 1 为组装预留，主链路尚未全量填充）。
 */
export interface EpistemicContext {
  actorId: string;
  playerKnownFacts: KnowledgeFact[];
  /** 当前聚焦 NPC 已知事实（多 NPC 场景可建多个 context） */
  npcKnownFacts: KnowledgeFact[];
  publicSceneFacts: KnowledgeFact[];
  inferredFacts: KnowledgeFact[];
  /** 对当前 actor 不应作为「已知」引用的事实（常来自 world / 他私域） */
  forbiddenFacts: KnowledgeFact[];
  refs?: EpistemicRuntimeRefs;
}

export type EpistemicAlertSeverity = "low" | "medium" | "high";

export type EpistemicReactionHint = "confused" | "suspicious" | "defensive" | "hostile";

/**
 * 玩家越界或生成泄露风险的结构化提示（阶段 1 可先由规则产生占位）。
 */
export interface EpistemicAlert {
  unknownFactMentioned: boolean;
  severity: EpistemicAlertSeverity;
  reaction: EpistemicReactionHint;
  triggerFactIds: string[];
  requiredBehaviorTags: string[];
  /** 叙事生成时应避免的行为标签（如直接确认隐秘） */
  forbiddenResponseTags?: string[];
}

/** 认知异常检测器输出（阶段 3：供 control augmentation 紧凑注入） */
export interface EpistemicAnomalyResult {
  anomaly: boolean;
  npcId: string;
  severity: EpistemicAlertSeverity;
  reactionStyle: EpistemicReactionHint;
  triggerFactIds: string[];
  requiredBehaviorTags: string[];
  forbiddenResponseTags: string[];
  mustInclude: string[];
  mustAvoid: string[];
}

/**
 * 会话压缩层 NPC 轻量快照（不入独立大表；嵌在 session playerStatus 的 epistemic 嵌入块中）。
 */
export interface NpcEpistemicSnapshotMin {
  npcId: string;
  knownFactIds: string[];
  playerPerceptionLevel: "stranger" | "familiar" | "named" | "recognized_loop";
  /** 仅情绪/体感短句，不得承载系统真相命题 */
  emotionalResidueNotes: string;
}

/** filter / canKnow 用的最小场景信息 */
export interface EpistemicSceneContext {
  presentNpcIds: string[];
}
