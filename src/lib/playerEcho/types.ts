import type {
  NpcCanonicalIdentity,
  NpcMemoryPrivilege,
  NpcPlayerRecognitionMode,
} from "@/lib/registry/types";
import type { RevealTierRank } from "@/lib/registry/revealTierRank";
import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";

export type EchoSafetyLevel = 0 | 1 | 2 | 3 | 4;

export type EchoFragmentType =
  | "death"
  | "ending"
  | "npc_bond"
  | "betrayal"
  | "rescue"
  | "truth_glimpse"
  | "promise"
  | "debt"
  | "relationship_shift"
  | "death_mark"
  | "route_hint"
  | "danger_hint"
  | "secret_fragment"
  | "escape_condition"
  | "hook"
  | "npc_attitude";

export type EchoTargetType = "npc" | "location" | "floor" | "task" | "item" | "world" | "route" | "anomaly" | "global";

export type EchoFragmentStatus = "active" | "consumed" | "expired";

export type EchoFragmentAnchors = {
  npcIds?: string[];
  locationIds?: string[];
  floorIds?: string[];
  taskIds?: string[];
  itemIds?: string[];
  worldFlags?: string[];
  keywords?: string[];
};

export type EchoFragment = {
  id: string;
  type: EchoFragmentType;
  targetType: EchoTargetType;
  targetId: string | null;
  summary: string;
  safetyLevel: EchoSafetyLevel;
  emotionalWeight: number;
  salience: number;
  confidence: number;
  status: EchoFragmentStatus;
  sourceLoop?: number;
  sourceTurnId?: string;
  anchors?: EchoFragmentAnchors;
  revealTierMin?: RevealTierRank;
  allowedNpcPrivilege?: NpcMemoryPrivilege[];
  tone?: "unease" | "familiar_pull" | "page_metaphor" | "xinlan_anchor" | "regret" | "cold_hint";
};

export type NpcEchoBond = {
  npcId: string;
  memoryPrivilege: NpcMemoryPrivilege;
  recognitionMode: NpcPlayerRecognitionMode;
  bondScore: number;
  fragmentIds: string[];
  lastEchoedAtLoop?: number;
  cooldownTurns?: number;
};

export type PlayerEchoCanon = {
  schema: "player_echo_canon_v1";
  version: 1;
  playerKey: string | null;
  worldId: string | null;
  loopCount: number;
  fragments: EchoFragment[];
  npcBonds: NpcEchoBond[];
  strongestChoices: string[];
  unresolvedRegrets: string[];
  repeatedDeathCauses: string[];
  stableEchoSummary: string | null;
  lastRunSummary: string | null;
  updatedAt: string | null;
};

export type PlayerEchoSelectionContext = {
  activeNpcId?: string | null;
  presentNpcIds?: string[];
  locationId?: string | null;
  floorId?: string | null;
  latestUserInput?: string;
  revealTier?: RevealTierRank | number;
  npcMemoryPrivilegeById?: Record<string, NpcMemoryPrivilege>;
};

export type SelectedEchoFragment = {
  id: string;
  type: EchoFragmentType;
  targetType: EchoTargetType;
  targetId: string | null;
  npcId: string | null;
  summary: string;
  safetyLevel: EchoSafetyLevel;
  score: number;
};

export type NpcFirstEncounterEchoIntensity = "none" | "subtle" | "noticeable" | "strong";
export type NpcFirstEncounterEchoStrength = NpcFirstEncounterEchoIntensity;

export type NpcFirstEncounterAllowedForm =
  | "pause"
  | "gesture"
  | "misnaming"
  | "sensory_deja_vu"
  | "metaphor"
  | "registration_hesitation";

export type NpcFirstEncounterForbiddenClaim =
  | "explicit_previous_run_memory"
  | "loop_truth_full_reveal"
  | "exact_death_recall"
  | "canon_override"
  | "current_run_fact_override"
  | "official_canon_rewrite"
  | "old_friend_default"
  | "known_friend_claim"
  | "exact_previous_run_memory"
  | "warm_old_friend_recognition"
  | "seven_keys_full_reveal"
  | "school_root_cause_full_reveal"
  | "safety_level_4_expression"
  | "explicit_loop_memory";

export type NpcFirstEncounterEchoPlan = {
  schema: "npc_first_encounter_echo_plan_v1";
  activeNpcId: string | null;
  npcId: string | null;
  memoryPrivilege: NpcMemoryPrivilege | "unknown";
  intensity: NpcFirstEncounterEchoIntensity;
  /** @deprecated kept as an alias for older prompt/tests; use intensity. */
  strength: NpcFirstEncounterEchoStrength;
  allowedForms: NpcFirstEncounterAllowedForm[];
  forbiddenClaims: NpcFirstEncounterForbiddenClaim[];
  allowExplicitLoopMemory: boolean;
  revealTier: RevealTierRank | number;
  safetyLevelCap: EchoSafetyLevel;
  styleHint: string | null;
  reason: string | null;
};

export type NpcFirstEncounterEchoPlanArgs = {
  canonIdentity: NpcCanonicalIdentity | null | undefined;
  echoCanon: PlayerEchoCanon | null | undefined;
  activeNpcId: string | null | undefined;
  currentRunDiscovered?: readonly string[] | Record<string, boolean> | Set<string> | null;
  snapshot?: RunSnapshotV2 | null;
  revealTier?: RevealTierRank | number;
};
