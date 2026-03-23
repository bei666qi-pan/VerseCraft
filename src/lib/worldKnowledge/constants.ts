/**
 * VerseCraft 世界知识 RAG 的常量与默认预算（仅用于骨架阶段）。
 *
 * 尽量与现有 `src/lib/kg/*` 的 pgvector 语义缓存参数保持一致，避免后续接入时出现“同名不同语义”的坑。
 */

export const WORLD_KNOWLEDGE_EMBED_DIM = 256;

/**
 * 预算默认值：对齐现有 KG semanticCache 的语义（probes=5, k=5, minSimilarity=0.78）。
 * 注意：本阶段不会接入任何业务逻辑，仅提供可落地的默认预算。
 */
export const DEFAULT_RETRIEVAL_BUDGET = {
  keyTopN: 5,
  ftsTopN: 6,
  vectorTopN: 5,
  maxFacts: 14,
  minSimilarity: 0.78,
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

