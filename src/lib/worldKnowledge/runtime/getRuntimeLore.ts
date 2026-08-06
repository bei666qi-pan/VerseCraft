import { buildLorePacket } from "@/lib/worldKnowledge/retrieval/buildLorePacket";
import { planWorldKnowledgeQuery } from "@/lib/worldKnowledge/retrieval/queryPlanner";
import { rerankCandidates } from "@/lib/worldKnowledge/retrieval/rerank";
import { retrieveWorldKnowledge } from "@/lib/worldKnowledge/retrieval/retrieveWorldKnowledge";
import { readWorldLoreCache, writeWorldLoreCache } from "@/lib/worldKnowledge/cache/worldKnowledgeCache";
import { buildRegistryFallbackLorePacket } from "./fallbackFromRegistry";
import { gateCandidatesForLorePacketV1 } from "../reveal/revealGate";
import { DEFAULT_RUNTIME_LORE_TOKEN_BUDGET, WORLD_KNOWLEDGE_RETRIEVAL_TIMEOUT_MS } from "../constants";
import type { LorePacket, RuntimeLoreRequest } from "../types";
import {
  startRagSpan,
  endRagSpan,
  RAG_SPAN_NAMES,
  buildQueryPlanningMeta,
  buildRetrievalMeta,
  buildRerankMeta,
  buildRevealGateMeta,
  buildLorePacketMeta,
} from "../observability/ragTracing";
import { mmrRerank, dynamicTopK, getMmrConfig } from "../retrieval/diversityReranker";
import { validateRetrievedFacts } from "../retrieval/factValidator";

export interface RuntimeLoreDeps {
  planWorldKnowledgeQuery: typeof planWorldKnowledgeQuery;
  readWorldLoreCache: typeof readWorldLoreCache;
  retrieveWorldKnowledge: typeof retrieveWorldKnowledge;
  rerankCandidates: typeof rerankCandidates;
  writeWorldLoreCache: typeof writeWorldLoreCache;
  buildLorePacket: typeof buildLorePacket;
  buildRegistryFallbackLorePacket: typeof buildRegistryFallbackLorePacket;
}

const defaultDeps: RuntimeLoreDeps = {
  planWorldKnowledgeQuery,
  readWorldLoreCache,
  retrieveWorldKnowledge,
  rerankCandidates,
  writeWorldLoreCache,
  buildLorePacket,
  buildRegistryFallbackLorePacket,
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("wk_retrieval_timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function getRuntimeLore(input: RuntimeLoreRequest, deps: RuntimeLoreDeps = defaultDeps): Promise<LorePacket> {
  const normalizedInput: RuntimeLoreRequest = {
    ...input,
    worldRevision: input.worldRevision ?? BigInt(0),
    tokenBudget: input.tokenBudget > 0 ? input.tokenBudget : DEFAULT_RUNTIME_LORE_TOKEN_BUDGET,
    recentlyEncounteredEntities: input.recentlyEncounteredEntities ?? [],
    worldScope: input.worldScope?.length ? input.worldScope : ["core", "shared"],
  };

  // ── Stage 1: Query Planning ──
  const querySpan = startRagSpan(RAG_SPAN_NAMES.QUERY_PLANNING);
  const plan = deps.planWorldKnowledgeQuery(normalizedInput);
  endRagSpan(querySpan, "ok", buildQueryPlanningMeta({
    inputLength: normalizedInput.latestUserInput.length,
    intentCount: plan.intents.length,
    exactCodeCount: plan.exactCodes.length,
    tagHintCount: plan.tagHints.length,
    floorHintCount: plan.floorHints.length,
    maxRevealRank: plan.maxRevealRank,
    ftsQueryLength: plan.ftsQuery.length,
    semanticQueryLength: plan.semanticQuery.length,
    expandedTokenCount: plan.retrievalBudget.maxFacts,
    entityCount: plan.exactCodes.length + plan.exactCanonicalNames.length,
  }));

  // ── Stage 2: Cache Read ──
  const cacheSpan = startRagSpan(RAG_SPAN_NAMES.CACHE_READ);
  const cacheRead = await deps.readWorldLoreCache({
    input: normalizedInput,
    queryFingerprint: plan.fingerprint,
    entitiesHash: plan.entitiesFingerprint,
  });
  if (cacheRead.packet) {
    endRagSpan(cacheSpan, "cached", { cacheLevel: cacheRead.level0Hit ? "memory" : "redis" });
    return {
      ...cacheRead.packet,
      debugMeta: {
        ...cacheRead.packet.debugMeta,
        cache: {
          level0MemoHit: cacheRead.level0Hit,
          redisHit: cacheRead.redisHit,
          postgresHit: false,
          writtenToRedis: false,
        },
      },
    };
  }

  endRagSpan(cacheSpan, "skipped", { hit: 0 });

  // ── Stage 3: Retrieval Execution ──
  const retrievalSpan = startRagSpan(RAG_SPAN_NAMES.RETRIEVAL);
  let retrieval;
  try {
    retrieval = await withTimeout(
      deps.retrieveWorldKnowledge({ input: normalizedInput, plan }),
      WORLD_KNOWLEDGE_RETRIEVAL_TIMEOUT_MS
    );
  } catch {
    endRagSpan(retrievalSpan, "error", { error: "timeout_or_db_error" });
    const fallbackSpan = startRagSpan(RAG_SPAN_NAMES.FALLBACK);
    const result = deps.buildRegistryFallbackLorePacket({
      input: normalizedInput,
      plan,
      reason: "db_error",
    });
    endRagSpan(fallbackSpan, "degraded", { reason: "db_error" });
    return result;
  }
  if (!retrieval.facts || retrieval.facts.length === 0) {
    endRagSpan(retrievalSpan, "degraded", { totalFacts: 0 });
    const fallbackSpan = startRagSpan(RAG_SPAN_NAMES.FALLBACK);
    const result = deps.buildRegistryFallbackLorePacket({
      input: normalizedInput,
      plan,
      reason: "db_empty",
    });
    endRagSpan(fallbackSpan, "degraded", { reason: "db_empty" });
    return result;
  }
  endRagSpan(retrievalSpan, "ok", buildRetrievalMeta({
    keyCount: retrieval.used.keyCount,
    ftsCount: retrieval.used.ftsCount,
    vectorCount: retrieval.used.vectorCount,
    tagCount: retrieval.used.tagCount ?? 0,
    totalFacts: retrieval.facts.length,
    dbRoundTrips: retrieval.dbRoundTrips ?? 0,
    latencyMs: 0,
    truncated: retrieval.truncated ?? false,
  }));

  // ── Stage 4: Rerank ──
  const rerankSpan = startRagSpan(RAG_SPAN_NAMES.RERANK);
  const candidatesBefore = (retrieval.debugCandidates ?? []).length;
  const reranked = deps.rerankCandidates(retrieval.debugCandidates ?? [], {
    playerLocation: normalizedInput.playerLocation,
    recentlyEncounteredEntities: normalizedInput.recentlyEncounteredEntities,
    actorNpcId: normalizedInput.actorNpcId,
    presentNpcIds: normalizedInput.presentNpcIds ?? [],
    locationId: normalizedInput.locationId ?? normalizedInput.playerLocation,
    activeTaskIds: normalizedInput.activeTaskIds ?? [],
    threatLevel: normalizedInput.threatLevel,
    scenePressure: normalizedInput.scenePressure,
    playerKnownFactIds: normalizedInput.playerKnownFactIds ?? [],
  });
  endRagSpan(rerankSpan, "ok", buildRerankMeta({
    candidatesBefore,
    candidatesAfter: reranked.length,
    boostApplied: reranked.length > 0 ? Math.round((reranked[0]?.score ?? 0) - ((retrieval.debugCandidates ?? [])[0]?.score ?? 0)) : 0,
  }));

  // ── Stage 4.5: MMR Diversity Re-ranking ──
  const mmrConfig = getMmrConfig();
  const diversityTopK = dynamicTopK({
    inputLength: normalizedInput.latestUserInput.length,
    intentCount: plan.intents.length,
    entityCount: plan.exactCodes.length + plan.exactCanonicalNames.length,
    baseTopK: plan.retrievalBudget.maxFacts,
    maxTopK: plan.retrievalBudget.maxFacts + 6,
  });
  const diversitySpan = startRagSpan("rag.mmr_diversity");
  const diverseCandidates = mmrRerank(reranked, diversityTopK, mmrConfig);
  endRagSpan(diversitySpan, "ok", {
    beforeMmr: reranked.length,
    afterMmr: diverseCandidates.length,
    duplicatesRemoved: reranked.length - diverseCandidates.length,
    mmrLambda: mmrConfig.lambda,
  });

  // ── Stage 5: Reveal Gate ──
  const gateSpan = startRagSpan(RAG_SPAN_NAMES.REVEAL_GATE);
  const maxRevealRank = plan.maxRevealRank;
  const gateResult = gateCandidatesForLorePacketV1(diverseCandidates, {
    maxRank: maxRevealRank,
    actorNpcId: plan.actorNpcId,
    presentNpcIds: plan.presentNpcIds,
  });
  const gated = gateResult.included.map((result) => result.candidate);
  endRagSpan(gateSpan, "ok", buildRevealGateMeta({
    candidatesBefore: reranked.length,
    included: gateResult.included.length,
    blocked: gateResult.blocked.length,
    downgraded: gateResult.downgraded.length,
    maxRevealRank,
  }));
  if (gated.length === 0) {
    const fallbackSpan = startRagSpan(RAG_SPAN_NAMES.FALLBACK);
    const result = deps.buildRegistryFallbackLorePacket({
      input: normalizedInput,
      plan,
      reason: "db_empty",
    });
    endRagSpan(fallbackSpan, "degraded", { reason: "gate_empty" });
    return result;
  }

  // ── Stage 5.5: Post-Retrieval Fact Validation ──
  const validationSpan = startRagSpan("rag.fact_validation");
  const validationResult = validateRetrievedFacts(gated, {
    filterDuplicates: true,
    detectContradictions: gated.length <= 20,
  });
  const validatedCandidates = validationResult.valid;
  endRagSpan(validationSpan, "ok", {
    totalChecked: validationResult.summary.totalChecked,
    passed: validationResult.summary.passed,
    filtered: validationResult.summary.filtered,
    errors: validationResult.summary.errorCount,
    warnings: validationResult.summary.warningCount,
  });

  // ── Stage 6: Lore Packet Building ──
  const packetSpan = startRagSpan(RAG_SPAN_NAMES.LORE_PACKET);
  const packet = deps.buildLorePacket({
    input: normalizedInput,
    candidates: validatedCandidates,
    gateResults: [...gateResult.included, ...gateResult.blocked, ...gateResult.downgraded],
    queryFingerprint: plan.fingerprint,
    cache: {
      level0MemoHit: false,
      redisHit: false,
      postgresHit: (retrieval.facts?.length ?? 0) > 0,
      writtenToRedis: false,
    },
    dbRoundTrips: retrieval.dbRoundTrips ?? 0,
  });
  endRagSpan(packetSpan, "ok", buildLorePacketMeta({
    totalFacts: packet.retrievedFacts.length,
    coreAnchorCount: packet.coreAnchors.length,
    sceneFactCount: packet.sceneFacts.length,
    privateFactCount: packet.privateFacts.length,
    relevantEntityCount: packet.relevantEntities.length,
    compactChars: packet.compactPromptText.length,
    trimmedByBudget: packet.debugMeta.trimmedByBudget,
    hitSources: packet.debugMeta.hitSources.join(","),
  }));

  // ── Stage 7: Cache Write ──
  const cacheWriteSpan = startRagSpan(RAG_SPAN_NAMES.CACHE_WRITE);
  const wrote = await deps.writeWorldLoreCache({
    key: cacheRead.key,
    input: normalizedInput,
    packet,
  });

  endRagSpan(cacheWriteSpan, "ok", { wroteRedis: wrote.wroteRedis ? 1 : 0, ttlSec: wrote.ttlSec });

  return {
    ...packet,
    debugMeta: {
      ...packet.debugMeta,
      cache: { ...packet.debugMeta.cache, writtenToRedis: wrote.wroteRedis },
    },
  };
}
