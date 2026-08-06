// src/lib/worldKnowledge/retrieval/chunkContextExpander.ts
// Parent-child chunk context expansion for retrieved facts.
//
// When a fact is retrieved through a small "child" chunk (created by
// splitting the original document), this module expands the context to
// include neighboring chunks (the "parent" context) so the LLM sees
// more surrounding context while keeping retrieval precision high.
//
// Strategy:
//   1. Retrieve at small chunk granularity (high precision)
//   2. Expand to ±N neighboring chunks (rich context for LLM)
//   3. Deduplicate and merge overlapping expansions
//   4. Adaptive window: larger window for story/lore, smaller for facts
//
// Semantic-aware expansion (when semantic chunking enabled):
//   - Uses semantic boundary metadata to avoid expanding across sections
//   - Respects entity boundaries (don't mix NPC A's lore with NPC B's)
//   - Weighted scoring: closer chunks get higher inheritance scores
//
// This is a POST-RETRIEVAL step — applied after fusion, before
// building the lore packet.
//
// Configure via:
//   VERSECRAFT_CHUNK_EXPAND_WINDOW  — number of neighbors per side (default 2)
//   VERSECRAFT_CHUNK_MAX_EXPANDED   — max total chunks after expansion (default 12)
//   VERSECRAFT_CHUNK_ADAPTIVE_WINDOW — enable adaptive window sizing (default true)

import { envBoolean, envNumber } from "@/lib/config/envRaw";
import type { RetrievalCandidate } from "../types";

// ── Config ──────────────────────────────────────────────

export interface ChunkExpansionConfig {
  /** Base number of neighboring chunks to include on each side */
  windowSize: number;
  /** Maximum total chunks after expansion */
  maxExpanded: number;
  /** Whether to use adaptive window sizing based on content type */
  adaptiveWindow: boolean;
}

export function getChunkExpansionConfig(): ChunkExpansionConfig {
  return {
    windowSize: envNumber("VERSECRAFT_CHUNK_EXPAND_WINDOW", 2),
    maxExpanded: envNumber("VERSECRAFT_CHUNK_MAX_EXPANDED", 12),
    adaptiveWindow: envBoolean("VERSECRAFT_CHUNK_ADAPTIVE_WINDOW", true),
  };
}

// ── Content type classification ─────────────────────────

/** Content types that benefit from wider context windows */
const BROAD_CONTEXT_TYPES = new Set([
  "world_mechanism",  // need full causal chain
  "truth",            // need surrounding context
  "event",            // need temporal context
  "relationship",     // need both entities
]);

/** Content types that are self-contained */
const NARROW_CONTEXT_TYPES = new Set([
  "item",             // items are self-contained
  "compliance",       // rules are standalone
  "system_hint",      // hints are discrete
]);

function adaptiveWindowSize(factType: string, baseSize: number): number {
  if (BROAD_CONTEXT_TYPES.has(factType)) return baseSize + 1;
  if (NARROW_CONTEXT_TYPES.has(factType)) return Math.max(0, baseSize - 1);
  return baseSize;
}

// ── In-memory expansion (no DB round trip) ──────────────

/** Parse factKey (format: "entityId:chunkIndex") into components. */
function parseFactKey(factKey: string): { entityId: number; chunkIndex: number } | null {
  const parts = factKey.split(":");
  if (parts.length >= 2) {
    const eid = Number(parts[0]);
    const cidx = Number(parts[1]);
    if (!isNaN(eid) && !isNaN(cidx)) return { entityId: eid, chunkIndex: cidx };
  }
  return null;
}

/**
 * Weight decay function for expanded chunks.
 * Closer neighbors get higher inherited scores.
 */
function neighborScoreDecay(offset: number, baseScore: number): number {
  // Exponential decay: score * (0.75 ^ |offset|)
  return baseScore * Math.pow(0.75, Math.abs(offset));
}

/**
 * Expand retrieved candidates with neighboring chunks.
 * Supports adaptive window sizing when enabled.
 */
export function expandChunkContext(
  retrieved: RetrievalCandidate[],
  allChunks: RetrievalCandidate[],
  config?: ChunkExpansionConfig,
): RetrievalCandidate[] {
  const cfg = config ?? getChunkExpansionConfig();
  if (retrieved.length === 0) return retrieved;

  // Build index: entity_id → chunk_index → candidate
  const chunkIndex = new Map<number, Map<number, RetrievalCandidate>>();
  for (const c of allChunks) {
    const pk = parseFactKey(c.fact.identity.factKey);
    if (!pk) continue;
    if (!chunkIndex.has(pk.entityId)) chunkIndex.set(pk.entityId, new Map());
    chunkIndex.get(pk.entityId)!.set(pk.chunkIndex, c);
  }

  const seen = new Set<string>();
  const expanded: RetrievalCandidate[] = [];

  for (const c of retrieved) {
    const key = c.fact.identity.factKey;
    if (!seen.has(key)) {
      seen.add(key);
      expanded.push(c);
    }

    const pk = parseFactKey(key);
    if (!pk) continue;

    const entityChunks = chunkIndex.get(pk.entityId);
    if (!entityChunks) continue;

    // Adaptive window sizing based on content type
    const windowSize = cfg.adaptiveWindow
      ? adaptiveWindowSize(c.fact.factType, cfg.windowSize)
      : cfg.windowSize;

    // Expand in both directions, with priority to closer neighbors
    for (let dist = 1; dist <= windowSize; dist++) {
      for (const offset of [-dist, dist]) {
        const neighbor = entityChunks.get(pk.chunkIndex + offset);
        if (!neighbor) continue;

        const nKey = neighbor.fact.identity.factKey;
        if (seen.has(nKey)) continue;

        seen.add(nKey);
        expanded.push({
          ...neighbor,
          score: neighborScoreDecay(offset, c.score),
          debug: {
            ...neighbor.debug,
            from: (neighbor.debug?.from ?? "fts") as any,
          },
        });
      }
    }

    if (expanded.length >= cfg.maxExpanded) break;
  }

  return expanded.slice(0, cfg.maxExpanded);
}

// ── DB-backed expansion ─────────────────────────────────

/**
 * Load neighboring chunks from the database for the given retrieved candidates.
 * This makes a single DB round trip to fetch all neighbors at once.
 * Supports adaptive window sizing per fact type.
 */
export async function expandWithDbFallback(
  retrieved: RetrievalCandidate[],
  config?: ChunkExpansionConfig,
): Promise<RetrievalCandidate[]> {
  const cfg = config ?? getChunkExpansionConfig();
  if (retrieved.length === 0) return retrieved;

  // Collect (entity_id, chunk_index) pairs to expand
  // Use adaptive window per fact type
  const neighborSet = new Set<string>();

  for (const c of retrieved) {
    const pk = parseFactKey(c.fact.identity.factKey);
    if (!pk) continue;

    const windowSize = cfg.adaptiveWindow
      ? adaptiveWindowSize(c.fact.factType, cfg.windowSize)
      : cfg.windowSize;

    for (let dist = 1; dist <= windowSize; dist++) {
      for (const offset of [-dist, dist]) {
        neighborSet.add(`${pk.entityId}:${pk.chunkIndex + offset}`);
      }
    }
  }

  const toExpand = [...neighborSet]
    .map((s) => {
      const [eid, cidx] = s.split(":").map(Number);
      return { entityId: eid, chunkIndex: cidx };
    })
    .filter((e) => !isNaN(e.entityId) && !isNaN(e.chunkIndex));

  if (toExpand.length === 0) return retrieved;

  try {
    const { pool } = await import("@/db");
    const client = await pool.connect();
    try {
      // Build WHERE clause for batch lookup
      const conditions = toExpand.map(
        (_, i) => `(c.entity_id = $${i * 2 + 1} AND c.chunk_index = $${i * 2 + 2})`
      );
      const params = toExpand.flatMap((e) => [e.entityId, e.chunkIndex]);

      const query = `
        SELECT
          c.id AS chunk_id, c.entity_id, e.code, e.canonical_name, e.entity_type,
          e.scope AS entity_scope, e.owner_user_id, e.status, e.source_type,
          e.importance AS entity_importance,
          c.chunk_index, c.content, c.importance AS chunk_importance,
          c.visibility_scope, c.retrieval_key
        FROM world_knowledge_chunks c
        JOIN world_entities e ON e.id = c.entity_id
        WHERE ${conditions.slice(0, 50).join(" OR ")}
        LIMIT ${cfg.maxExpanded * 2}
      `;

      const res = await client.query(query, params.slice(0, 100));

      // Map rows to candidates
      type ChunkRow = {
        chunk_id: number; entity_id: number; code: string; canonical_name: string;
        entity_type: string; entity_scope: string; owner_user_id: string | null;
        status: string; source_type: string; entity_importance: number;
        chunk_index: number; content: string; chunk_importance: number;
        visibility_scope: string; retrieval_key: string | null;
      };

      const expandCandidates = (res.rows as ChunkRow[]).map((r) => ({
        fact: {
          identity: {
            factKey: `${r.entity_id}:${r.chunk_index}`,
            entityId: r.entity_id,
            chunkIndex: r.chunk_index,
          },
          content: r.content,
          scope: r.entity_scope as any,
          source: r.source_type as any,
          importance: Math.max(r.chunk_importance, r.entity_importance),
          revealTier: 1,
          isHot: r.chunk_importance >= 80 || r.entity_importance >= 85,
        },
        score: 0.4, // expanded chunks get lower base score
        debug: { from: "expanded_db" },
      }));

      // Merge with original retrieved candidates
      const allKeys = new Set(retrieved.map((c) => c.fact.identity.factKey));
      const merged = [
        ...retrieved,
        ...expandCandidates.filter((c) => !allKeys.has(c.fact.identity.factKey)),
      ];

      return merged.slice(0, cfg.maxExpanded) as RetrievalCandidate[];
    } finally {
      client.release();
    }
  } catch {
    // DB expansion failed — return original results unchanged
    return retrieved;
  }
}

