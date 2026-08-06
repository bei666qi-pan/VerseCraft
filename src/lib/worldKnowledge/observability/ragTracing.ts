// src/lib/worldKnowledge/observability/ragTracing.ts
// Langfuse observability for the RAG pipeline.
//
// Wraps each stage of the world knowledge retrieval pipeline with
// Langfuse spans for end-to-end visibility into query→retrieve→rerank→gate→packet.
//
// Fail-open: all tracing errors are caught and logged; RAG pipeline
// correctness is never affected by observability failures.

import { startStageSpan } from "@/lib/observability/langfuse";
import type { SpanHandle } from "@/lib/observability/langfuse";

// ── Stage names ─────────────────────────────────────────

export const RAG_SPAN_NAMES = {
  QUERY_PLANNING: "rag.query_planning",
  CACHE_READ: "rag.cache_read",
  RETRIEVAL: "rag.retrieval",
  HYBRID_FUSION: "rag.hybrid_fusion",
  RERANK: "rag.rerank",
  MMR_DIVERSITY: "rag.mmr_diversity",
  REVEAL_GATE: "rag.reveal_gate",
  CHUNK_EXPAND: "rag.chunk_expand",
  FACT_VALIDATION: "rag.fact_validation",
  LORE_PACKET: "rag.lore_packet",
  CACHE_WRITE: "rag.cache_write",
  FALLBACK: "rag.fallback",
} as const;

// ── Span helper ─────────────────────────────────────────

/**
 * Start a RAG pipeline stage span.
 * Always returns a valid SpanHandle (noop if Langfuse is not configured).
 */
export function startRagSpan(
  name: string,
  metadata?: Record<string, string | number | boolean>,
): SpanHandle {
  try {
    return startStageSpan({
      name,
      status: "ok",
      resultSummary: metadata as Record<string, string | number>,
    });
  } catch {
    // Fail-open — return a noop handle
    return { end() {}, setAttributes() {} };
  }
}

/**
 * End a RAG span with optional metadata.
 */
export function endRagSpan(
  span: SpanHandle,
  _status: "ok" | "error" | "cached" | "skipped" | "degraded" = "ok",
  metadata?: Record<string, string | number>,
): void {
  try {
    if (metadata) span.setAttributes(metadata);
    span.end();
  } catch {
    // Fail-open
  }
}

// ── Structured metadata builders ────────────────────────

export interface QueryPlanningMeta {
  inputLength: number;
  intentCount: number;
  exactCodeCount: number;
  tagHintCount: number;
  floorHintCount: number;
  maxRevealRank: number;
  ftsQueryLength: number;
  semanticQueryLength: number;
  expandedTokenCount: number;
  entityCount: number;
}

export function buildQueryPlanningMeta(m: QueryPlanningMeta): Record<string, string | number> {
  return {
    inputLength: m.inputLength,
    intentCount: m.intentCount,
    exactCodeCount: m.exactCodeCount,
    tagHintCount: m.tagHintCount,
    floorHintCount: m.floorHintCount,
    maxRevealRank: m.maxRevealRank,
    ftsQueryLength: m.ftsQueryLength,
    semanticQueryLength: m.semanticQueryLength,
    expandedTokenCount: m.expandedTokenCount,
    entityCount: m.entityCount,
  };
}

export interface RetrievalMeta {
  keyCount: number;
  ftsCount: number;
  vectorCount: number;
  tagCount: number;
  totalFacts: number;
  dbRoundTrips: number;
  latencyMs: number;
  truncated: boolean;
}

export function buildRetrievalMeta(m: RetrievalMeta): Record<string, string | number> {
  return {
    keyHits: m.keyCount,
    ftsHits: m.ftsCount,
    vectorHits: m.vectorCount,
    tagHits: m.tagCount,
    totalFacts: m.totalFacts,
    dbRoundTrips: m.dbRoundTrips,
    retrievalLatencyMs: m.latencyMs,
    truncated: m.truncated ? 1 : 0,
  };
}

export interface RerankMeta {
  candidatesBefore: number;
  candidatesAfter: number;
  boostApplied: number;
}

export function buildRerankMeta(m: RerankMeta): Record<string, string | number> {
  return {
    candidatesBefore: m.candidatesBefore,
    candidatesAfter: m.candidatesAfter,
    boostApplied: m.boostApplied,
  };
}

export interface RevealGateMeta {
  candidatesBefore: number;
  included: number;
  blocked: number;
  downgraded: number;
  maxRevealRank: number;
}

export function buildRevealGateMeta(m: RevealGateMeta): Record<string, string | number> {
  return {
    candidatesBefore: m.candidatesBefore,
    included: m.included,
    blocked: m.blocked,
    downgraded: m.downgraded,
    maxRevealRank: m.maxRevealRank,
  };
}

export interface LorePacketMeta {
  totalFacts: number;
  coreAnchorCount: number;
  sceneFactCount: number;
  privateFactCount: number;
  relevantEntityCount: number;
  compactChars: number;
  trimmedByBudget: boolean;
  hitSources: string;
}

export function buildLorePacketMeta(m: LorePacketMeta): Record<string, string | number> {
  return {
    totalFacts: m.totalFacts,
    coreAnchorCount: m.coreAnchorCount,
    sceneFactCount: m.sceneFactCount,
    privateFactCount: m.privateFactCount,
    relevantEntityCount: m.relevantEntityCount,
    compactChars: m.compactChars,
    trimmedByBudget: m.trimmedByBudget ? 1 : 0,
    hitSources: m.hitSources,
  };
}
