// src/lib/worldKnowledge/retrieval/hybridFusion.ts
// Hybrid fusion for multi-layer retrieval results.
//
// Combines BM25 (FTS) and vector (embedding) retrieval results using
// Reciprocal Rank Fusion (RRF) with configurable per-layer weights.
//
// RRF formula: score(d) = Σ w_layer / (k + rank_layer(d))
//   - k: rank constant (default 60, higher = more weight on absolute rank)
//   - w_layer: layer weight (default equal: 1.0 each)
//
// Configure via env vars:
//   VERSECRAFT_HYBRID_FTS_WEIGHT    — FTS layer weight (default 1.0)
//   VERSECRAFT_HYBRID_VECTOR_WEIGHT — vector layer weight (default 1.0)
//   VERSECRAFT_HYBRID_RRF_K         — RRF k constant (default 60)
//   VERSECRAFT_HYBRID_TOP_K         — max candidates after fusion (default 14).
//                                      This is the primary limit for retrieved facts;
//                                      buildLorePacket applies a secondary safety cap
//                                      of WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS (18).

import { envNumber } from "@/lib/config/envRaw";
import type { RetrievalCandidate } from "../types";

// ── Config ──────────────────────────────────────────────

export interface HybridFusionConfig {
  ftsWeight: number;
  vectorWeight: number;
  rrfK: number;
  topK: number;
}

export function getHybridConfig(): HybridFusionConfig {
  return {
    ftsWeight: envNumber("VERSECRAFT_HYBRID_FTS_WEIGHT", 1.2),
    vectorWeight: envNumber("VERSECRAFT_HYBRID_VECTOR_WEIGHT", 1.0),
    rrfK: envNumber("VERSECRAFT_HYBRID_RRF_K", 60),
    topK: envNumber("VERSECRAFT_HYBRID_TOP_K", 14),
  };
}

// ── Layer separation ────────────────────────────────────

type LayerName = "fts" | "vector" | "exact" | "tag";

interface LayerResult {
  layer: LayerName;
  candidates: RetrievalCandidate[];
  weight: number;
}

/**
 * Separate candidates by their source layer for per-layer scoring.
 * Exact and tag matches bypass fusion (they're deterministic).
 */
function separateLayers(candidates: RetrievalCandidate[], config: HybridFusionConfig): LayerResult[] {
  const byLayer = new Map<LayerName, RetrievalCandidate[]>();

  for (const c of candidates) {
    const layer = c.debug?.from as LayerName | undefined;
    const key = layer ?? "fts";
    if (!byLayer.has(key)) byLayer.set(key, []);
    byLayer.get(key)!.push(c);
  }

  return [
    {
      layer: "exact",
      candidates: byLayer.get("exact") ?? [],
      weight: 2.0, // exact matches always get high weight
    },
    {
      layer: "tag",
      candidates: byLayer.get("tag") ?? [],
      weight: 1.5, // tag matches get moderate weight
    },
    {
      layer: "fts",
      candidates: byLayer.get("fts") ?? [],
      weight: config.ftsWeight,
    },
    {
      layer: "vector",
      candidates: byLayer.get("vector") ?? [],
      weight: config.vectorWeight,
    },
  ];
}

// ── Reciprocal Rank Fusion ──────────────────────────────

interface ScoredCandidate extends RetrievalCandidate {
  rrfScore: number;
  contributingLayers: LayerName[];
}

/**
 * Apply RRF to merge multi-layer results.
 *
 * Exact/tag matches are always included (deterministic, high confidence).
 * FTS and vector results compete via RRF for the remaining slots.
 */
export function fuseResults(
  candidates: RetrievalCandidate[],
  config?: HybridFusionConfig,
): RetrievalCandidate[] {
  const cfg = config ?? getHybridConfig();
  const layers = separateLayers(candidates, cfg);

  // 1. Always include exact matches (bypass fusion)
  const exactResults: RetrievalCandidate[] = [];
  const fusionCandidates: RetrievalCandidate[] = [];

  for (const layer of layers) {
    if (layer.layer === "exact" || layer.layer === "tag") {
      // Exact and tag matches are deterministic — always include
      exactResults.push(...layer.candidates);
    } else {
      fusionCandidates.push(...layer.candidates);
    }
  }

  // Deduplicate exact/tag by factKey
  const exactMap = new Map<string, RetrievalCandidate>();
  for (const c of exactResults) {
    const key = c.fact.identity.factKey;
    if (!exactMap.has(key) || c.score > exactMap.get(key)!.score) {
      exactMap.set(key, c);
    }
  }
  const exactDeduped = [...exactMap.values()];

  // 2. RRF fusion for FTS + vector
  if (fusionCandidates.length === 0) {
    return exactDeduped.slice(0, cfg.topK);
  }

  // Group fusion candidates by factKey and track their ranks per layer
  const factMap = new Map<string, ScoredCandidate>();

  for (const layer of layers) {
    if (layer.layer !== "fts" && layer.layer !== "vector") continue;
    if (layer.candidates.length === 0) continue;

    // Sort by score descending to get ranks
    const ranked = [...layer.candidates].sort((a, b) => b.score - a.score);

    for (let rank = 0; rank < ranked.length; rank++) {
      const c = ranked[rank];
      const key = c.fact.identity.factKey;

      // Skip facts already covered by exact/tag matches
      if (exactMap.has(key)) continue;

      const rrfContribution = layer.weight / (cfg.rrfK + rank + 1);

      if (factMap.has(key)) {
        const existing = factMap.get(key)!;
        existing.rrfScore += rrfContribution;
        existing.contributingLayers.push(layer.layer);
        // Keep the higher individual score
        if (c.score > existing.score) {
          existing.score = c.score;
          existing.fact = c.fact;
          existing.debug = c.debug;
        }
      } else {
        factMap.set(key, {
          ...c,
          rrfScore: rrfContribution,
          contributingLayers: [layer.layer],
        });
      }
    }
  }

  // 3. Sort by RRF score descending
  const fusedResults = [...factMap.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ rrfScore: _, contributingLayers: __, ...c }) => c);

  // 4. Combine: exact first, then fused (deduped by factKey)
  const exactKeys = new Set(exactDeduped.map((c) => c.fact.identity.factKey));
  const finalCandidates = [
    ...exactDeduped,
    ...fusedResults.filter((c) => !exactKeys.has(c.fact.identity.factKey)),
  ];

  return finalCandidates.slice(0, cfg.topK);
}

// ── Weighted score fusion (alternative to RRF) ──────────

/**
 * Simple weighted score fusion for when RRF is not needed.
 * score = w_bm25 * norm_bm25 + w_vector * norm_vector
 */
export function weightedScoreFusion(
  ftsCandidates: RetrievalCandidate[],
  vectorCandidates: RetrievalCandidate[],
  config?: HybridFusionConfig,
): RetrievalCandidate[] {
  const cfg = config ?? getHybridConfig();

  // Normalize scores to [0,1] per layer
  function normalize(candidates: RetrievalCandidate[]): RetrievalCandidate[] {
    if (candidates.length === 0) return candidates;
    const maxScore = Math.max(...candidates.map((c) => c.score));
    if (maxScore === 0) return candidates.map((c) => ({ ...c, score: 0 }));
    return candidates.map((c) => ({ ...c, score: c.score / maxScore }));
  }

  const normFts = normalize(ftsCandidates.map((c) => ({ ...c })));
  const normVec = normalize(vectorCandidates.map((c) => ({ ...c })));

  const totalWeight = cfg.ftsWeight + cfg.vectorWeight;

  const fused = new Map<string, RetrievalCandidate>();

  for (const c of normFts) {
    const key = c.fact.identity.factKey;
    fused.set(key, { ...c, score: c.score * (cfg.ftsWeight / totalWeight) });
  }

  for (const c of normVec) {
    const key = c.fact.identity.factKey;
    const vecWeight = cfg.vectorWeight / totalWeight;
    if (fused.has(key)) {
      const existing = fused.get(key)!;
      existing.score += c.score * vecWeight;
    } else {
      fused.set(key, { ...c, score: c.score * vecWeight });
    }
  }

  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, cfg.topK);
}
