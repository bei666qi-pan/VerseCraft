/**
 * VerseCraft 世界知识 RAG 的常量与默认预算（仅用于骨架阶段）。
 *
 * 尽量与现有 `src/lib/kg/*` 的 pgvector 语义缓存参数保持一致，避免后续接入时出现“同名不同语义”的坑。
 */

export const WORLD_KNOWLEDGE_EMBED_DIM = 256;

/**
 * 预算默认值：提高各层召回量以供给 MMR 多样性重排更多候选（fusion topK=14）。
 * 降低 minSimilarity 让更多向量候选通过，质量由 MMR 后续过滤。
 */
export const DEFAULT_RETRIEVAL_BUDGET = {
  keyTopN: 6,
  ftsTopN: 8,
  vectorTopN: 7,
  maxFacts: 16,
  minSimilarity: 0.72,
  probes: 5,
  k: 5,
} as const;

/** Prompt lore block 的软容量上限（用于后续实现 prompt 体积控制） */
export const DEFAULT_PROMPT_MAX_LORE_CHARS = 6000;

/** Redis prompt 片段缓存 TTL（秒级，短 TTL 适配单机 4C8G） */
export const DEFAULT_PROMPT_FRAGMENT_TTL_SEC = 180;

export const WORLD_KNOWLEDGE_CACHE_VERSION = "v1";
export const WORLD_KNOWLEDGE_MAX_DB_ROUND_TRIPS = 6;
export const DEFAULT_RUNTIME_LORE_TOKEN_BUDGET = 420;
export const DEFAULT_RUNTIME_LORE_CHAR_BUDGET = 1800;
/**
 * Safety cap applied in buildLorePacket as the final .slice(0, N) on candidates.
 * In practice the effective limit is tighter: hybridFusion topK defaults to 14
 * (VERSECRAFT_HYBRID_TOP_K), so this 18 is a secondary ceiling that only matters
 * if fusion's topK is raised above it or if candidates bypass fusion entirely.
 */
export const WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS = 18;
export const WORLD_KNOWLEDGE_MAX_PACKET_CHARS = 2200;
export const WORLD_KNOWLEDGE_MAX_WRITEBACK_FACTS = 12;
export const WORLD_KNOWLEDGE_RETRIEVAL_TIMEOUT_MS = 180;

export const WORLD_KNOWLEDGE_TTL = {
  coreSec: 900,
  sharedSec: 420,
  userSec: 120,
  sessionSec: 90,
  riskShortSec: 45,
} as const;

