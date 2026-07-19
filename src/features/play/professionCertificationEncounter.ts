import { PROFESSION_IDS, PROFESSION_REGISTRY } from "@/lib/profession/registry";
import type { ProfessionId } from "@/lib/profession/types";

type UnknownRecord = Record<string, unknown>;

export const PROFESSION_CERTIFICATION_OPTION_TEXT: Record<ProfessionId, string> = {
  守灯人: "认证职业：守灯人",
  巡迹客: "认证职业：巡迹客",
  觅兆者: "认证职业：觅兆者",
  齐日角: "认证职业：齐日角",
  溯源师: "认证职业：溯源师",
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function collectIds(rows: unknown, key: "id" | "npcId", target: Set<string>): void {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const value = record(row)?.[key];
    if (typeof value === "string" && value.trim()) target.add(value.trim());
  }
}

/**
 * Only current-turn structured deltas can prove a first meeting with a
 * profession certifier. Narrative text and passive NPC locations are not
 * encounter evidence because either may be stale or non-authoritative.
 */
export function hasStructuredProfessionCertifierEncounter(args: {
  playerLocation: string | null | undefined;
  dmRecord: UnknownRecord;
}): boolean {
  if (!String(args.playerLocation ?? "").trim().startsWith("1F_")) return false;
  const seenNpcIds = new Set<string>();
  collectIds(args.dmRecord.codex_updates, "id", seenNpcIds);
  collectIds(args.dmRecord.relationship_updates, "npcId", seenNpcIds);
  collectIds(args.dmRecord.npc_location_updates, "id", seenNpcIds);
  const certifierNpcIds = new Set(PROFESSION_IDS.map((id) => PROFESSION_REGISTRY[id].certification.certifierNpcId));
  return [...seenNpcIds].some((npcId) => certifierNpcIds.has(npcId));
}

export function resolveProfessionCertificationGate(args: {
  playerLocation: string | null | undefined;
  dmRecord: UnknownRecord;
  hasMetProfessionCertifier: boolean;
  currentProfession: ProfessionId | null | undefined;
  eligibilityByProfession: Partial<Record<ProfessionId, boolean>> | null | undefined;
}): { markEncounter: boolean; eligibleProfessions: ProfessionId[] } {
  const structuredEncounter = hasStructuredProfessionCertifierEncounter(args);
  const hasConfirmedEncounter = args.hasMetProfessionCertifier || structuredEncounter;
  const atFirstFloor = String(args.playerLocation ?? "").trim().startsWith("1F_");
  const eligibleProfessions =
    !args.currentProfession && atFirstFloor && hasConfirmedEncounter
      ? PROFESSION_IDS.filter((id) => Boolean(args.eligibilityByProfession?.[id]))
      : [];
  return {
    markEncounter: !args.hasMetProfessionCertifier && structuredEncounter,
    eligibleProfessions,
  };
}

/**
 * Rebuilds the UI-only option mapping from persisted, already-confirmed
 * state. The mapping itself is deliberately not persisted: it is a derived
 * view, while the encounter proof and eligibility remain the authority.
 */
export function buildPersistedProfessionCertificationChoice(args: {
  playerLocation: string | null | undefined;
  hasMetProfessionCertifier: boolean;
  currentProfession: ProfessionId | null | undefined;
  eligibilityByProfession: Partial<Record<ProfessionId, boolean>> | null | undefined;
}): { options: string[]; mapping: Record<string, ProfessionId> } {
  const gate = resolveProfessionCertificationGate({
    ...args,
    dmRecord: {},
  });
  const options = gate.eligibleProfessions.map((profession) => PROFESSION_CERTIFICATION_OPTION_TEXT[profession]);
  return {
    options,
    mapping: Object.fromEntries(
      gate.eligibleProfessions.map((profession) => [PROFESSION_CERTIFICATION_OPTION_TEXT[profession], profession])
    ) as Record<string, ProfessionId>,
  };
}
