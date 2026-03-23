import { DEFAULT_RETRIEVAL_BUDGET } from "../constants";
import { getRuntimeLore } from "./getRuntimeLore";
import type { LoreFact, PromptInjectionPayload, RetrievalQuery } from "../types";

function buildFactBlock(fact: LoreFact, idx: number): string {
  return [`[RAG事实 #${idx + 1}]`, fact.canonicalText].join("\n");
}

/**
 * buildRagLoreBlock：将检索到的事实拼成可注入 prompt 的 lore facts block。
 *
 * 注意：本函数只负责“拼接格式”，不负责检索逻辑。
 */
export function buildRagLoreBlock(facts: LoreFact[]): string {
  if (!facts.length) return "";
  return facts.map((f, idx) => buildFactBlock(f, idx)).join("\n\n");
}

// 向后兼容：历史命名（保持 scaffold 即可）
export function buildRagLoreFactsBlock(facts: LoreFact[]): string {
  return buildRagLoreBlock(facts);
}

export async function retrieveLoreFactsForTurn(ctx: {
  latestUserInput: string;
  playerContext: string;
  userId: string | null;
  worldRevision: bigint;
}): Promise<PromptInjectionPayload> {
  const packet = await getRuntimeLore({
    latestUserInput: ctx.latestUserInput,
    userId: ctx.userId,
    sessionId: null,
    playerLocation: null,
    recentlyEncounteredEntities: [],
    taskType: "PLAYER_CHAT",
    tokenBudget: DEFAULT_RETRIEVAL_BUDGET.maxFacts * 35,
    worldScope: ["core", "shared", "user", "session"],
  });
  const block = packet.compactPromptText || buildRagLoreBlock(packet.retrievedFacts);

  return {
    ragLoreFactsBlock: block,
    usedFactKeys: packet.retrievedFacts.map((f) => f.identity.factKey),
    worldRevision: ctx.worldRevision,
    cache: {
      hit: packet.debugMeta.cache.redisHit || packet.debugMeta.cache.level0MemoHit,
      backend: packet.debugMeta.cache.redisHit ? "redis" : "memory",
    },
  };
}

export { getRuntimeLore };
export type { RetrievalQuery };

