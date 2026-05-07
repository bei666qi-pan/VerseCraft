import type {
  NarrativeValidationIssue,
  NarrativeValidationIssueCode,
  NarrativeValidationReport,
  NarrativeValidationTelemetry,
} from "@/lib/turnEngine/validateNarrative";
import type {
  NpcKnowledgeValidationIssue,
  NpcKnowledgeValidationIssueCode,
  NpcKnowledgeValidationReport,
} from "@/lib/npcKnowledge/npcKnowledgeValidator";
import type {
  UnsupportedFactCandidate,
  UnsupportedFactDetectorReport,
  UnsupportedFactIssueCode,
} from "@/lib/worldFacts/unsupportedFactDetector";
import type { NpcSceneAuthorityPacket } from "@/lib/npcSceneAuthority/types";
import type { WorldFact } from "@/lib/worldFacts/worldFactRegistry";
import type { NormalizedPlayerIntent, StateDelta } from "@/lib/turnEngine/types";
import type {
  PacingIssue,
  PacingIssueCode,
  PacingValidationReport,
} from "@/lib/turnEngine/pacing";

export type NarrativeSafetySeverity = "low" | "medium" | "high";

export type NarrativeSafetyDecision = "pass" | "repair" | "fallback" | "block_commit";

export type SafetyInvariantCode =
  | "unknown_entity_surface"
  | "unregistered_npc_id"
  | "offscreen_npc_direct_speech"
  | "speaker_not_present"
  | "npc_status_forbidden_direct_speech"
  | "npc_mentions_unknown_npc"
  | "npc_knows_forbidden_fact"
  | "unsupported_new_fact"
  | "unsupported_relationship_claim"
  | "unsupported_location_claim"
  | "unsupported_root_cause_claim"
  | "fact_id_not_allowed"
  | "used_fact_id_missing_from_registry"
  | "narrative_state_delta_conflict"
  | "schema_contract_violation"
  | "pacing_budget_breach"
  | "prompt_injection_entity_creation_attempt";

export type NarrativeSafetyIssueCode =
  | SafetyInvariantCode
  | NarrativeValidationIssueCode
  | NpcKnowledgeValidationIssueCode
  | UnsupportedFactIssueCode
  | PacingIssueCode;

export type NarrativeSafetyIssueSource =
  | "validateNarrative"
  | "npcKnowledgeValidator"
  | "unsupportedFactDetector"
  | "npcSceneAuthority"
  | "worldFactRegistry"
  | "stateDelta"
  | "normalizedPlayerIntent"
  | "schema"
  | "pacing"
  | "entityAudit";

export type NarrativeSafetyEntityKind =
  | "npc"
  | "location"
  | "item"
  | "faction"
  | "relationship"
  | "fact";

export type NarrativeSafetyEntityReference = {
  id: string;
  kind: NarrativeSafetyEntityKind;
  registered: boolean;
  surface?: string;
  source?: "narrative" | "options" | "dm_record" | "intent" | "external_validator";
};

export type NarrativeSafetyPacingBudget = {
  maxNarrativeChars?: number;
  maxOptions?: number;
};

export type NarrativeSafetyInput = {
  dmRecord?: Record<string, unknown> | null;
  narrative?: string | null;
  options?: readonly string[] | null;

  validateNarrativeReport?: NarrativeValidationReport | null;
  validateNarrativeIssues?: readonly NarrativeValidationIssue[] | null;
  validateNarrativeTelemetry?: NarrativeValidationTelemetry | null;

  npcKnowledgeReport?: NpcKnowledgeValidationReport | null;
  npcKnowledgeIssues?: readonly NpcKnowledgeValidationIssue[] | null;

  unsupportedFactReport?: UnsupportedFactDetectorReport | null;
  unsupportedFactIssues?: readonly UnsupportedFactCandidate[] | null;

  pacingReport?: PacingValidationReport | null;
  pacingIssues?: readonly PacingIssue[] | null;

  npcSceneAuthorityPacket?: NpcSceneAuthorityPacket | null;
  speakerNpcId?: string | null;

  allowedFactIds?: readonly string[] | null;
  usedFactIds?: readonly string[] | null;
  worldFacts?: readonly Pick<WorldFact, "factId" | "revealTier">[] | null;
  maxRevealRank?: number | null;

  stateDelta?: StateDelta | null;
  intent?: NormalizedPlayerIntent | null;

  registeredNpcIds?: readonly string[] | null;
  registeredItemIds?: readonly string[] | null;
  allowedEntityIds?: readonly string[] | null;
  sessionCommittedEntityIds?: readonly string[] | null;
  serverAllowedGeneratedEntityIds?: readonly string[] | null;
  entityReferences?: readonly NarrativeSafetyEntityReference[] | null;
  pacingBudget?: NarrativeSafetyPacingBudget | null;
};

export type NarrativeSafetyTelemetry = {
  totalIssues: number;
  byCode: Partial<Record<NarrativeSafetyIssueCode, number>>;
  bySeverity: Record<NarrativeSafetySeverity, number>;
  bySource: Partial<Record<NarrativeSafetyIssueSource, number>>;
  validateNarrative?: NarrativeValidationTelemetry;
  npcKnowledge?: NpcKnowledgeValidationReport["telemetry"];
  unsupportedFacts?: UnsupportedFactDetectorReport["telemetry"];
  pacing?: PacingValidationReport["telemetry"];
};

export type NarrativeSafetyIssue = {
  code: NarrativeSafetyIssueCode;
  severity: NarrativeSafetySeverity;
  source: NarrativeSafetyIssueSource;
  detail?: string;
  anchor?: string;
  invariant?: SafetyInvariantCode;
  originalCode?: string;
};

export type NarrativeSafetyReport = {
  ok: boolean;
  decision: NarrativeSafetyDecision;
  issues: NarrativeSafetyIssue[];
  invariantsViolated: SafetyInvariantCode[];
  maxSeverity: NarrativeSafetySeverity | null;
  telemetry: NarrativeSafetyTelemetry;
};
