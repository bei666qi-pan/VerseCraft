import { buildLorePacket } from "@/lib/worldKnowledge/retrieval/buildLorePacket";
import { planWorldKnowledgeQuery } from "@/lib/worldKnowledge/retrieval/queryPlanner";
import { rerankCandidates } from "@/lib/worldKnowledge/retrieval/rerank";
import { retrieveWorldKnowledge } from "@/lib/worldKnowledge/retrieval/retrieveWorldKnowledge";
import { readWorldLoreCache, writeWorldLoreCache } from "@/lib/worldKnowledge/cache/worldKnowledgeCache";
import { buildRegistryFallbackLorePacket } from "./fallbackFromRegistry";
import { gateCandidatesForLorePacket } from "../reveal/revealGate";
import { DEFAULT_RUNTIME_LORE_TOKEN_BUDGET, WORLD_KNOWLEDGE_RETRIEVAL_TIMEOUT_MS } from "../constants";
import type { LorePacket, RuntimeLoreRequest } from "../types";

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

  const plan = deps.planWorldKnowledgeQuery(normalizedInput);
  const cacheRead = await deps.readWorldLoreCache({
    input: normalizedInput,
    queryFingerprint: plan.fingerprint,
    entitiesHash: plan.entitiesFingerprint,
  });
  if (cacheRead.packet) {
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

  let retrieval;
  try {
    retrieval = await withTimeout(
      deps.retrieveWorldKnowledge({ input: normalizedInput, plan }),
      WORLD_KNOWLEDGE_RETRIEVAL_TIMEOUT_MS
    );
  } catch {
    return deps.buildRegistryFallbackLorePacket({
      input: normalizedInput,
      plan,
      reason: "db_error",
    });
  }
  if (!retrieval.facts || retrieval.facts.length === 0) {
    return deps.buildRegistryFallbackLorePacket({
      input: normalizedInput,
      plan,
      reason: "db_empty",
    });
  }
  const reranked = deps.rerankCandidates(retrieval.debugCandidates ?? [], {
    playerLocation: normalizedInput.playerLocation,
    recentlyEncounteredEntities: normalizedInput.recentlyEncounteredEntities,
  });

  const maxRevealRank = plan.maxRevealRank;
  const gated = gateCandidatesForLorePacket(reranked, maxRevealRank);

  const packet = deps.buildLorePacket({
    input: normalizedInput,
    candidates: gated,
    queryFingerprint: plan.fingerprint,
    cache: {
      level0MemoHit: false,
      redisHit: false,
      postgresHit: (retrieval.facts?.length ?? 0) > 0,
      writtenToRedis: false,
    },
    dbRoundTrips: retrieval.dbRoundTrips ?? 0,
  });

  const wrote = await deps.writeWorldLoreCache({
    key: cacheRead.key,
    input: normalizedInput,
    packet,
  });

  return {
    ...packet,
    debugMeta: {
      ...packet.debugMeta,
      cache: { ...packet.debugMeta.cache, writtenToRedis: wrote.wroteRedis },
    },
  };
}
