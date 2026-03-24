import type { ProfessionId } from "./types";
import { getProfessionTrialIssuer } from "./trials";

export type ProfessionImprintCodexEntry = {
  id: string;
  name: string;
  type: "npc" | "anomaly";
  favorability?: number;
  rules_discovered?: string;
  traits?: string;
};

export function getProfessionImprintFlag(profession: ProfessionId): string {
  return `profession.certified.${profession}`;
}

export function buildProfessionImprintCodex(profession: ProfessionId): ProfessionImprintCodexEntry {
  return {
    id: `profession_imprint_${profession}`,
    name: `${profession}认证纪要`,
    type: "anomaly",
    traits: "职业认证",
    rules_discovered: `你已被正式承认为「${profession}」。`,
  };
}

export function buildProfessionIssuerRelationshipDelta(profession: ProfessionId): {
  npcId: string;
  npcName: string;
  favorabilityDelta: number;
} {
  const issuer = getProfessionTrialIssuer(profession);
  return {
    npcId: issuer.issuerId,
    npcName: issuer.issuerName,
    favorabilityDelta: 3,
  };
}

