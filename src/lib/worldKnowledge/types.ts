/**
 * VerseCraft 世界知识 RAG 的“最小可用”类型骨架。
 *
 * 注意：本阶段只提供类型与接口，避免接入任何 /api/chat 业务逻辑。
 */
import type { TaskType } from "@/lib/ai/types/core";

export type WorldKnowledgeLayer =
  | "core_canon"
  | "shared_public_lore"
  | "user_private_lore"
  | "session_ephemeral_facts";

export type LoreFactType =
  | "npc"
  | "anomaly"
  | "rule"
  | "location"
  | "item"
  | "relationship"
  | "event"
  | "world_mechanism"
  | "compliance"
  | "system_hint";

export type LoreSourceKind = "registry" | "db" | "user" | "session" | "bootstrap";

export interface LoreFactIdentity {
  /** 稳定 fact id（优先用 normalized_hash 或 fact_key），用于 prompt 注入去重与缓存键 */
  factKey: string;
}

export interface LoreFact {
  identity: LoreFactIdentity;
  layer: WorldKnowledgeLayer;
  factType: LoreFactType;
  canonicalText: string;
  /** 用于精确键检索与去重（可复用项目既有 normalized_hash 语义） */
  normalizedHash?: string;
  tags?: string[];
  source: {
    kind: LoreSourceKind;
    entityId?: string;
  };
  /** 热事实优先级（用于 4C8G：先用 is_hot 召回） */
  isHot?: boolean;
}

export interface RetrievalBudget {
  /** 精确键召回 topN */
  keyTopN: number;
  /** FTS 召回 topN */
  ftsTopN: number;
  /** 向量召回 topN（pgvector） */
  vectorTopN: number;
  /** 最终最大事实条数（用于防止 prompt 体积爆炸） */
  maxFacts: number;
  /** 向量相似度门槛（与语义缓存实现保持一致的语义：相似度 = 1 - distance） */
  minSimilarity: number;
  /** ivfflat probes */
  probes: number;
  /** pgvector k */
  k: number;
}

export type RuntimeWorldScope = "core" | "shared" | "user" | "session";
export type RuntimeLoreTaskType = TaskType | "BACKGROUND";
export type RetrievalIntentType = "scene" | "character" | "rule" | "private" | "shared";

export interface RuntimeLoreRequest {
  latestUserInput: string;
  userId: string | null;
  sessionId: string | null;
  worldRevision?: bigint;
  playerLocation: string | null;
  recentlyEncounteredEntities: string[];
  taskType: RuntimeLoreTaskType;
  tokenBudget: number;
  worldScope: RuntimeWorldScope[];
}

export interface RetrievalPlan {
  intents: RetrievalIntentType[];
  exactCodes: string[];
  exactCanonicalNames: string[];
  floorHints: string[];
  locationHints: string[];
  tagHints: string[];
  ftsQuery: string;
  scope: RuntimeWorldScope[];
  tokenBudget: number;
  retrievalBudget: RetrievalBudget;
  fingerprint: string;
  entitiesFingerprint: string;
}

export interface RetrievalQuery {
  latestUserInput: string;
  playerContext: string;
  userId: string | null;
  /** 对齐 world_revision：用于缓存失效与事实一致性 */
  worldRevision: bigint;

  desiredLayers?: WorldKnowledgeLayer[];
  desiredFactTypes?: LoreFactType[];

  /** 预算 */
  budget: RetrievalBudget;

  /** 可选：精确键/实体 ID 直接命中 */
  exactKeys?: string[];

  /** 可选：标签过滤 */
  tags?: string[];

  /** 可选：FTS 查询（例如把玩家输入做规范化后的 query string） */
  ftsQuery?: string;

  /** 可选：向量查询 embedding（建议由上层生成一次，避免每回合多次） */
  vectorQuery?: {
    embedding: number[];
    minSimilarity?: number;
  };
}

export interface RetrievalCandidate {
  fact: LoreFact;
  score: number;
  debug?: {
    from?: "key" | "tag" | "fts" | "vector";
    similarity?: number;
  };
}

export interface RetrievalResult {
  facts: LoreFact[];
  used: {
    keyCount: number;
    ftsCount: number;
    vectorCount: number;
    tagCount?: number;
  };
  /** 如果发生 truncation（fact 数超出 maxFacts），用于诊断与后续优化 */
  truncated?: boolean;
  debugCandidates?: RetrievalCandidate[];
  dbRoundTrips?: number;
}

export interface RetrievalDebugMeta {
  queryFingerprint: string;
  cache: {
    level0MemoHit: boolean;
    redisHit: boolean;
    postgresHit: boolean;
    writtenToRedis: boolean;
  };
  hitSources: Array<"exact" | "tag" | "fts" | "vector">;
  scores: Record<string, number>;
  trimmedByBudget: boolean;
  trimReason?: string;
  dbRoundTrips: number;
}

export interface LorePacket {
  coreAnchors: LoreFact[];
  relevantEntities: LoreFact[];
  retrievedFacts: LoreFact[];
  privateFacts: LoreFact[];
  sceneFacts: LoreFact[];
  compactPromptText: string;
  debugMeta: RetrievalDebugMeta;
}

export interface PromptInjectionPayload {
  /** 要注入 prompt 的 lore block（稳定前缀不动，动态 suffix 拼接） */
  ragLoreFactsBlock: string;
  usedFactKeys: string[];
  worldRevision: bigint;
  cache: {
    hit: boolean;
    /** 未来可扩展：cache backend 类型与命中来源 */
    backend?: "redis" | "postgres" | "memory";
  };
}

export type LoreReranker = (candidates: RetrievalCandidate[], ctx: { playerContext: string }) => Promise<RetrievalCandidate[]>;

