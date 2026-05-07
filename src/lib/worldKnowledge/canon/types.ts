export type CanonTruthClass =
  | "observable"
  | "rumor"
  | "verified"
  | "hidden"
  | "player_known"
  | "dm_only";

export type CanonAudience =
  | "player"
  | "dm"
  | "all_npcs"
  | "present_npcs"
  | "specific_npc"
  | "faction"
  | "location"
  | "system_only";

export interface CanonEvidenceRefV1 {
  id: string;
  sourceType:
    | "registry"
    | "runtime_packet"
    | "retrieved_lore"
    | "memory"
    | "task"
    | "event_log"
    | "doc"
    | "unknown";
  sourcePath?: string;
  sourceId?: string;
  quote?: string;
  confidence?: number;
}

export interface CanonFactV1 {
  factId: string;
  canonicalText: string;
  truthClass: CanonTruthClass;
  audience: CanonAudience[];
  specificNpcIds?: string[];
  factionIds?: string[];
  locationIds?: string[];
  revealMinRank: number;
  revealTier?: "surface" | "fracture" | "deep" | "epilogue";
  evidenceRefs: CanonEvidenceRefV1[];
  sourceType: CanonEvidenceRefV1["sourceType"];
  tags?: string[];
  expiresAtTurn?: number;
  confidence?: number;
  createdAt?: string;
}

export type EvidenceGateDecision = "included" | "blocked" | "downgraded" | "fallback";

export interface LoreEvidenceBundleEntryV1 {
  factId: string;
  canonicalText: string;
  truthClass: CanonTruthClass;
  audience: CanonAudience[];
  specificNpcIds?: string[];
  factionIds?: string[];
  locationIds?: string[];
  revealMinRank: number;
  revealTier?: CanonFactV1["revealTier"];
  evidenceRefs: CanonEvidenceRefV1[];
  sourceType: CanonEvidenceRefV1["sourceType"];
  tags?: string[];
  confidence?: number;
  retrievalScore?: number;
  rerankScore?: number;
  gateDecision: EvidenceGateDecision;
  gateReason: string;
}
