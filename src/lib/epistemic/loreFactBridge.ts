/**
 * 将 RAG LoreFact 转为认知层 KnowledgeFact（纯函数，供越界检测）。
 */

import type { LoreFact } from "@/lib/worldKnowledge/types";
import { PLAYER_ACTOR_ID, type KnowledgeFact, type KnowledgeScope } from "./types";

export function loreFactsToKnowledgeFacts(facts: LoreFact[], nowIso: string): KnowledgeFact[] {
  return facts.map((f) => loreFactToKnowledgeFact(f, nowIso));
}

function loreFactToKnowledgeFact(f: LoreFact, nowIso: string): KnowledgeFact {
  if (f.layer === "user_private_lore") {
    return {
      id: `lore:${f.identity.factKey}`,
      content: f.canonicalText,
      scope: "player",
      sourceType: "memory",
      certainty: "confirmed",
      visibleTo: [PLAYER_ACTOR_ID],
      inferableByOthers: false,
      tags: [...(f.tags ?? []), "lore", "user_private"],
      createdAt: nowIso,
    };
  }

  const entityId = f.source.entityId?.trim() ?? "";
  if (f.factType === "npc" && /^N-\d{3}$/i.test(entityId)) {
    const owner = entityId.toUpperCase();
    return {
      id: `lore:npc:${f.identity.factKey}`,
      content: f.canonicalText,
      scope: "npc",
      ownerId: owner,
      sourceType: "memory",
      certainty: "confirmed",
      visibleTo: [owner],
      inferableByOthers: false,
      tags: [...(f.tags ?? []), "lore", "npc_shell"],
      createdAt: nowIso,
    };
  }

  let scope: KnowledgeScope;
  switch (f.layer) {
    case "shared_public_lore":
      scope = "public";
      break;
    case "session_ephemeral_facts":
      scope = "shared_scene";
      break;
    case "core_canon":
    default:
      scope = "world";
      break;
  }

  return {
    id: `lore:${f.identity.factKey}`,
    content: f.canonicalText,
    scope,
    sourceType: "memory",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: scope === "shared_scene",
    tags: [...(f.tags ?? []), "lore", f.layer],
    createdAt: nowIso,
  };
}

export function mergeLorePacketSlices(packet: {
  retrievedFacts: LoreFact[];
  sceneFacts: LoreFact[];
  privateFacts: LoreFact[];
  coreAnchors: LoreFact[];
  relevantEntities: LoreFact[];
}): LoreFact[] {
  const m = new Map<string, LoreFact>();
  for (const f of [
    ...packet.retrievedFacts,
    ...packet.sceneFacts,
    ...packet.privateFacts,
    ...packet.coreAnchors,
    ...packet.relevantEntities,
  ]) {
    m.set(f.identity.factKey, f);
  }
  return [...m.values()];
}
