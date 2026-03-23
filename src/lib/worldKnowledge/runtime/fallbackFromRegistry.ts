import { buildCoreCanonFactsFromRegistry } from "@/lib/worldKnowledge/bootstrap/coreCanonMapping";
import type { LoreFact, LorePacket, RetrievalPlan, RuntimeLoreRequest } from "../types";

function scoreFallbackFact(f: LoreFact, req: RuntimeLoreRequest, plan: RetrievalPlan): number {
  const text = `${f.identity.factKey} ${f.canonicalText}`.toLowerCase();
  let score = 0;
  if (req.playerLocation && text.includes(req.playerLocation.toLowerCase())) score += 40;
  for (const e of req.recentlyEncounteredEntities) {
    if (text.includes(e.toLowerCase())) score += 30;
  }
  for (const t of plan.tagHints) {
    if (text.includes(t.toLowerCase())) score += 10;
  }
  if (f.factType === "rule" || f.factType === "world_mechanism") score += 12;
  if (f.layer === "core_canon") score += 6;
  return score;
}

function compactFallbackText(facts: LoreFact[]): string {
  const lines = facts.map((f) => `- [${f.factType}] ${f.canonicalText.replace(/\s+/g, " ").slice(0, 160)}`);
  return ["【RAG-Lore精简片段(RegistryFallback)】", ...lines].join("\n");
}

export function buildRegistryFallbackLorePacket(args: {
  input: RuntimeLoreRequest;
  plan: RetrievalPlan;
  reason: "db_error" | "db_empty";
}): LorePacket {
  const all = buildCoreCanonFactsFromRegistry();
  const ranked = [...all]
    .map((f) => ({ fact: f, score: scoreFallbackFact(f, args.input, args.plan) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(6, Math.floor(args.input.tokenBudget / 40)))
    .map((x) => x.fact);

  const coreAnchors = ranked.filter((f) => f.layer === "core_canon" && (f.factType === "rule" || f.factType === "world_mechanism"));
  const sceneFacts = ranked.filter((f) => f.factType === "location" || f.factType === "npc" || f.factType === "anomaly");
  const privateFacts: LoreFact[] = [];
  const relevantEntities = ranked.filter((f) => f.factType === "npc" || f.factType === "anomaly" || f.factType === "item");

  return {
    coreAnchors,
    relevantEntities,
    retrievedFacts: ranked,
    privateFacts,
    sceneFacts,
    compactPromptText: compactFallbackText(ranked),
    debugMeta: {
      queryFingerprint: args.plan.fingerprint,
      cache: {
        level0MemoHit: false,
        redisHit: false,
        postgresHit: false,
        writtenToRedis: false,
      },
      hitSources: [],
      scores: {},
      trimmedByBudget: false,
      trimReason: args.reason === "db_error" ? "registry_fallback_db_error" : "registry_fallback_db_empty",
      dbRoundTrips: 0,
    },
  };
}
