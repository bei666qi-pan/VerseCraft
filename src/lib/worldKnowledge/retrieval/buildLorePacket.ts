import { DEFAULT_RUNTIME_LORE_CHAR_BUDGET, WORLD_KNOWLEDGE_MAX_PACKET_CHARS, WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS } from "../constants";
import { toLoreEvidenceBundleEntry } from "../canon/adapters";
import type { LoreGateResultV1 } from "../reveal/revealGate";
import type { LoreFact, LorePacket, RetrievalCandidate, RetrievalDebugMeta, RuntimeLoreRequest } from "../types";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";

function compactLine(fact: LoreFact): string {
  const shortText = fact.canonicalText.replace(/\s+/g, " ").slice(0, 200);
  const source = fact.source?.entityId ? `[src:${fact.source.entityId}]` : "";
  const typeTag = fact.factType;
  const hotMarker = fact.isHot ? "🔥" : "";
  return `- ${hotMarker}[${typeTag}|${fact.layer}]${source} ${shortText}`;
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
  gateResults?: LoreGateResultV1[];
  queryFingerprint: string;
  cache: RetrievalDebugMeta["cache"];
  dbRoundTrips: number;
}): LorePacket {
  // Safety cap: fusion already limits candidates to topK (default 14 via
  // VERSECRAFT_HYBRID_TOP_K). This .slice(0, 18) is a secondary ceiling in
  // case fusion is bypassed or its topK is raised above this constant.
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
    "【世界知识检索】", // World Knowledge Retrieval header
    coreAnchors.length > 0 ? `▎核心真相 (${coreAnchors.length}条)` : "",
    ...coreAnchors.map(compactLine),
    sceneFacts.length > 0 ? `\n▎场景事实 (${sceneFacts.length}条)` : "",
    ...sceneFacts.map(compactLine),
    privateFacts.length > 0 ? `\n▎私有知识 (${privateFacts.length}条)` : "",
    ...privateFacts.map(compactLine),
    retrievedFacts
      .filter((f) => !coreAnchors.includes(f) && !sceneFacts.includes(f) && !privateFacts.includes(f))
      .length > 0
      ? `\n▎其他相关 (${retrievedFacts.filter((f) => !coreAnchors.includes(f) && !sceneFacts.includes(f) && !privateFacts.includes(f)).length}条)`
      : "",
    ...retrievedFacts
      .filter((f) => !coreAnchors.includes(f) && !sceneFacts.includes(f) && !privateFacts.includes(f))
      .slice(0, 5)
      .map(compactLine),
  ].filter(Boolean).join("\n");
  if (compactPromptText.length > WORLD_KNOWLEDGE_MAX_PACKET_CHARS) {
    compactPromptText = compactPromptText.slice(0, WORLD_KNOWLEDGE_MAX_PACKET_CHARS);
  }

  const scores: Record<string, number> = {};
  const hitSources = new Set<"exact" | "tag" | "fts" | "vector">();
  for (const c of args.candidates) {
    scores[c.fact.identity.factKey] = c.score;
    if (c.debug?.from) hitSources.add(c.debug.from);
  }
  const rollout = getVerseCraftRolloutFlags();
  const evidenceBundle =
    rollout.enableCanonFactV1 || rollout.enableRevealAwareEvidenceBundle || rollout.enableProvenanceVerifierShadow
      ? (args.gateResults && args.gateResults.length > 0
          ? args.gateResults.map((result) =>
              toLoreEvidenceBundleEntry(result.candidate, result.gateDecision, result.gateReason)
            )
          : args.candidates.map((candidate) => toLoreEvidenceBundleEntry(candidate, "included", "included")))
      : undefined;

  return {
    coreAnchors,
    relevantEntities,
    retrievedFacts,
    privateFacts,
    sceneFacts,
    compactPromptText,
    ...(evidenceBundle ? { evidenceBundle } : {}),
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
