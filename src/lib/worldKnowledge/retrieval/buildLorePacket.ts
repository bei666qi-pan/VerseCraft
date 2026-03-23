import { DEFAULT_RUNTIME_LORE_CHAR_BUDGET, WORLD_KNOWLEDGE_MAX_PACKET_CHARS, WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS } from "../constants";
import type { LoreFact, LorePacket, RetrievalCandidate, RetrievalDebugMeta, RuntimeLoreRequest } from "../types";

function compactLine(fact: LoreFact): string {
  const shortText = fact.canonicalText.replace(/\s+/g, " ").slice(0, 180);
  return `- [${fact.factType}|${fact.layer}] ${shortText}`;
}

function trimByCharBudget(facts: LoreFact[], charBudget: number): { facts: LoreFact[]; trimmed: boolean } {
  const out: LoreFact[] = [];
  let n = 0;
  for (const f of facts) {
    const add = Math.min(200, f.canonicalText.length) + 16;
    if (n + add > charBudget) return { facts: out, trimmed: true };
    out.push(f);
    n += add;
  }
  return { facts: out, trimmed: false };
}

function groupFacts(facts: LoreFact): "core" | "private" | "scene" | "other" {
  if (facts.layer === "core_canon" || facts.factType === "world_mechanism" || facts.factType === "rule") return "core";
  if (facts.layer === "user_private_lore") return "private";
  if (facts.factType === "location" || facts.factType === "npc" || facts.factType === "anomaly") return "scene";
  return "other";
}

export function buildLorePacket(args: {
  input: RuntimeLoreRequest;
  candidates: RetrievalCandidate[];
  queryFingerprint: string;
  cache: RetrievalDebugMeta["cache"];
  dbRoundTrips: number;
}): LorePacket {
  const allFacts = args.candidates.map((c) => c.fact).slice(0, WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS);
  const byPriority = allFacts;
  const tokenDerivedCharBudget = Math.max(
    500,
    Math.min(DEFAULT_RUNTIME_LORE_CHAR_BUDGET, WORLD_KNOWLEDGE_MAX_PACKET_CHARS, args.input.tokenBudget * 4)
  );
  const trimmed = trimByCharBudget(byPriority, tokenDerivedCharBudget);

  const coreAnchors: LoreFact[] = [];
  const privateFacts: LoreFact[] = [];
  const sceneFacts: LoreFact[] = [];
  const relevantEntities: LoreFact[] = [];
  const retrievedFacts = trimmed.facts;

  for (const f of retrievedFacts) {
    const g = groupFacts(f);
    if (g === "core") coreAnchors.push(f);
    if (g === "private") privateFacts.push(f);
    if (g === "scene") sceneFacts.push(f);
    if (f.factType === "npc" || f.factType === "anomaly" || f.factType === "item" || f.factType === "location") relevantEntities.push(f);
  }

  let compactPromptText = [
    "【RAG-Lore精简片段】",
    ...retrievedFacts.map(compactLine),
  ].join("\n");
  if (compactPromptText.length > WORLD_KNOWLEDGE_MAX_PACKET_CHARS) {
    compactPromptText = compactPromptText.slice(0, WORLD_KNOWLEDGE_MAX_PACKET_CHARS);
  }

  const scores: Record<string, number> = {};
  const hitSources = new Set<"exact" | "tag" | "fts" | "vector">();
  for (const c of args.candidates) {
    scores[c.fact.identity.factKey] = c.score;
    if (c.debug?.from) hitSources.add(c.debug.from);
  }

  return {
    coreAnchors,
    relevantEntities,
    retrievedFacts,
    privateFacts,
    sceneFacts,
    compactPromptText,
    debugMeta: {
      queryFingerprint: args.queryFingerprint,
      cache: args.cache,
      hitSources: [...hitSources],
      scores,
      trimmedByBudget: trimmed.trimmed,
      trimReason: trimmed.trimmed ? "char_budget" : undefined,
      dbRoundTrips: args.dbRoundTrips,
    },
  };
}
