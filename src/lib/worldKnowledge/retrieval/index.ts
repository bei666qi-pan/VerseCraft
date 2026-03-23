import type { RetrievalQuery, RetrievalResult } from "../types";
import { hybridMerge } from "./hybridMerge";
import { exactKeyLookup } from "./exactKeyLookup";
import { ftsSearch } from "./ftsSearch";
import { rerankCandidates } from "./rerank";
import { vectorSearch } from "./vectorSearch";

export * from "./queryPlanner";
export * from "./retrieveWorldKnowledge";
export * from "./buildLorePacket";
export * from "./rerank";

export async function retrieveLoreFactsForTurn(query: RetrievalQuery): Promise<RetrievalResult> {
  const keyCandidates = query.exactKeys && query.exactKeys.length > 0 ? await exactKeyLookup(query) : [];
  const ftsCandidates = await ftsSearch(query);
  const vectorCandidates = query.vectorQuery ? await vectorSearch(query) : [];
  const merged = hybridMerge([keyCandidates, ftsCandidates, vectorCandidates]);
  const reranked = rerankCandidates(merged, {
    playerLocation: null,
    recentlyEncounteredEntities: [],
  });
  return {
    facts: reranked.map((x) => x.fact).slice(0, query.budget.maxFacts),
    used: {
      keyCount: keyCandidates.length,
      ftsCount: ftsCandidates.length,
      vectorCount: vectorCandidates.length,
    },
  };
}

