// src/lib/worldKnowledge/retrieval/diversityReranker.ts
// Diversity re-ranking for retrieved world knowledge candidates.
//
// Maximal Marginal Relevance (MMR) balances relevance and diversity:
//   MMR = λ * relevance(d, Q) - (1 - λ) * max_similarity(d, already_selected)
//
// This prevents the top-K results from being near-duplicates of the same
// entity or fact, ensuring the LLM sees a diverse set of world knowledge.
//
// Configure via:
//   VERSECRAFT_MMR_LAMBDA        — relevance/diversity trade-off (default 0.7)
//   VERSECRAFT_MMR_ENABLED       — feature flag (default true)
//   VERSECRAFT_MMR_MIN_DIVERSITY — minimum diversity score to consider (default 0.3)

import { envBoolean, envNumber } from "@/lib/config/envRaw";
import type { RetrievalCandidate } from "../types";

// ── Config ──────────────────────────────────────────────

export interface MmrConfig {
  /** Relevance weight. 1.0 = pure relevance, 0.0 = pure diversity */
  lambda: number;
  /** Whether MMR diversity re-ranking is enabled */
  enabled: boolean;
  /** Minimum similarity for two facts to be considered "related" */
  minDiversityScore: number;
}

export function getMmrConfig(): MmrConfig {
  return {
    lambda: envNumber("VERSECRAFT_MMR_LAMBDA", 0.7),
    enabled: envBoolean("VERSECRAFT_MMR_ENABLED", true),
    minDiversityScore: envNumber("VERSECRAFT_MMR_MIN_DIVERSITY", 0.3),
  };
}

// ── Content-based similarity ────────────────────────────

/**
 * Compute a lightweight content-based similarity between two candidates.
 * Uses:
 * 1. Entity-level similarity (same entity = high overlap)
 * 2. Text overlap (Jaccard on CJK bigrams)
 * 3. Fact type similarity (same type gets a boost)
 */
function contentSimilarity(a: RetrievalCandidate, b: RetrievalCandidate): number {
  let score = 0;
  let weights = 0;

  // 1. Same entity ID → high similarity
  const aEntity = a.fact.identity.factKey.split(":")[0];
  const bEntity = b.fact.identity.factKey.split(":")[0];
  if (aEntity && bEntity && aEntity === bEntity) {
    score += 0.4;
  }
  weights += 0.4;

  // 2. Fact type similarity
  if (a.fact.factType === b.fact.factType) {
    score += 0.15;
  }
  weights += 0.15;

  // 3. Text overlap via CJK bigram Jaccard
  const aBigrams = extractBigrams(a.fact.canonicalText);
  const bBigrams = extractBigrams(b.fact.canonicalText);
  if (aBigrams.size > 0 && bBigrams.size > 0) {
    const intersection = new Set([...aBigrams].filter((x) => bBigrams.has(x)));
    const union = new Set([...aBigrams, ...bBigrams]);
    const jaccard = intersection.size / union.size;
    score += jaccard * 0.45;
  }
  weights += 0.45;

  return weights > 0 ? score / weights : 0;
}

function extractBigrams(text: string): Set<string> {
  const bigrams = new Set<string>();
  const cleaned = text.replace(/\s+/g, "");
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.add(cleaned.slice(i, i + 2));
  }
  return bigrams;
}

// ── Duplicate detection ─────────────────────────────────

/**
 * Detect near-duplicate candidates by content hash.
 * Two facts are near-duplicates if their normalized content is highly similar.
 */
function detectDuplicates(candidates: RetrievalCandidate[]): Map<string, RetrievalCandidate[]> {
  const groups = new Map<string, RetrievalCandidate[]>();
  const SIMILARITY_THRESHOLD = 0.85;

  for (const c of candidates) {
    let bestKey: string | null = null;
    let bestSim = 0;

    for (const [key, group] of groups) {
      const sim = contentSimilarity(c, group[0]);
      if (sim > bestSim) {
        bestSim = sim;
        bestKey = key;
      }
    }

    if (bestKey && bestSim > SIMILARITY_THRESHOLD) {
      groups.get(bestKey)!.push(c);
    } else {
      groups.set(c.fact.identity.factKey, [c]);
    }
  }

  return groups;
}

// ── MMR Algorithm ───────────────────────────────────────

/**
 * Apply MMR diversity re-ranking to the candidate list.
 *
 * Algorithm:
 * 1. Sort candidates by relevance score descending
 * 2. Select top candidate
 * 3. For each remaining candidate, compute MMR score
 * 4. Select candidate with highest MMR score
 * 5. Repeat until topK is reached
 *
 * @param candidates - Relevance-ranked candidates
 * @param topK - Number of diverse results to return
 * @param config - MMR configuration
 */
export function mmrRerank(
  candidates: RetrievalCandidate[],
  topK: number,
  config?: Partial<MmrConfig>,
): RetrievalCandidate[] {
  const cfg = { ...getMmrConfig(), ...config };

  if (!cfg.enabled || candidates.length <= 1) {
    return candidates.slice(0, topK);
  }

  // First: deduplicate (keep highest-scored entry per duplicate group)
  const dupGroups = detectDuplicates(candidates);

  // For each duplicate group, keep the highest-scored candidate
  const deduped: RetrievalCandidate[] = [];
  for (const group of dupGroups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
    } else {
      // Keep the highest score, but mark the rest as "duplicate_filtered"
      const best = group.reduce((a, b) => (a.score >= b.score ? a : b));
      deduped.push(best);
    }
  }

  // Sort by relevance
  deduped.sort((a, b) => b.score - a.score);

  if (deduped.length <= topK) {
    return deduped;
  }

  // MMR selection
  const selected: RetrievalCandidate[] = [deduped[0]];
  const remaining = deduped.slice(1);

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestMmr = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Normalize relevance to [0, 1]
      const maxScore = deduped[0].score || 1;
      const rel = candidate.score / maxScore;

      // Max similarity to any already-selected candidate
      let maxSim = 0;
      for (const sel of selected) {
        const sim = contentSimilarity(candidate, sel);
        if (sim > maxSim) maxSim = sim;
      }

      const mmr = cfg.lambda * rel - (1 - cfg.lambda) * maxSim;

      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = i;
      }
    }

    if (bestMmr < cfg.minDiversityScore && selected.length > 0) {
      // Don't add low-diversity items — stop early
      break;
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

// ── Dynamic TopK ────────────────────────────────────────

/**
 * Compute a dynamic topK based on query characteristics.
 *
 * More complex queries (longer input, multiple intents, more entities)
 * get a higher topK, up to a configurable maximum.
 */
export function dynamicTopK(params: {
  inputLength: number;
  intentCount: number;
  entityCount: number;
  baseTopK: number;
  maxTopK: number;
}): number {
  // Complexity score: weighted sum of signals
  const lengthScore = Math.min(1.0, params.inputLength / 80); // max at 80 chars
  const intentScore = Math.min(1.0, params.intentCount / 3);   // max at 3 intents
  const entityScore = Math.min(1.0, params.entityCount / 5);   // max at 5 entities

  const complexity = (lengthScore * 0.3 + intentScore * 0.4 + entityScore * 0.3);
  const extra = Math.round(complexity * (params.maxTopK - params.baseTopK));

  return Math.min(params.maxTopK, params.baseTopK + extra);
}
