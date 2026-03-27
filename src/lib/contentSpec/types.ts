export type ContentLayer = "canonical" | "dramatic_overlay" | "runtime_packet" | "authoring_template";

export type ContentRef = { kind: string; id: string };

export type ContentMeta = {
  version: string;
  source: "in_repo" | "migrated";
  migratedFrom?: string;
  lastReviewedAt?: string; // ISO date
  tags?: string[];
};

export type ContentPackManifest = {
  packId: string; // e.g. baseApartmentPack
  version: string;
  dependsOn?: string[];
  enabledScopes?: Array<"base" | "b1" | "escape" | "highfloor">;
  stats?: Record<string, number>;
  meta?: ContentMeta;
};

export type ContentPack = {
  manifest: ContentPackManifest;
  npcSpecs?: NpcContentSpec[];
  taskSpecs?: TaskContentSpec[];
  escapeSpecs?: EscapeContentSpec;
};

export type VoiceContract = {
  oneLine: string;
  forbiddenPhrases?: string[];
  preferredMotifs?: string[];
  antiRepetitionHints?: string[];
};

export type RevealPolicy = {
  // 简化：不做导演层，只做内容生产边界
  maxRevealTier?: number;
  neverSay?: string[];
};

export type NpcContentSpec = {
  id: string; // N-xxx
  layer: "canonical" | "dramatic_overlay";
  meta?: ContentMeta;

  identity: {
    displayName: string;
    homeNode: string;
    floor: string;
    specialty: string;
  };

  surface: {
    appearance: string;
    publicPersonality: string;
  };

  interaction: {
    speechPattern: string;
    tabooBoundary: string;
    relationshipHooks?: string[];
    questHooks?: string[];
    surfaceSecrets?: string[];
  };

  secret?: {
    trueMotives?: string[];
    conspiracyRole?: string;
    revealConditions?: string[];
  };

  heart?: {
    coreFear?: string;
    ruptureThreshold?: { trustBelow?: number; fearAbove?: number; debtAbove?: number };
    taskStyle?: "direct" | "transactional" | "manipulative" | "avoidant" | "protective";
    truthfulnessBand?: "low" | "medium" | "high";
    emotionalDebtPattern?: string;
  };

  roles?: {
    escapeRole?: "route_holder" | "gatekeeper" | "liar" | "ally" | "sacrificer" | "blocker";
    guidanceRoles?: string[];
    contentTags?: string[];
  };

  voiceContract?: VoiceContract;
  revealPolicy?: RevealPolicy;
};

export type TaskContentSpec = {
  id: string; // task.xxx / main.xxx
  layer: "canonical" | "dramatic_overlay";
  meta?: ContentMeta;

  core: {
    title: string;
    desc: string;
    type: "main" | "floor" | "character" | "side";
    floorTier: string;
  };

  issuer: {
    issuerId: string;
    issuerName: string;
    claimMode: "auto" | "manual" | "npc_grant";
    npcProactiveGrant?: {
      enabled: boolean;
      npcId: string;
      minFavorability: number;
      preferredLocations: string[];
      cooldownHours: number;
    };
  };

  dramatic?: {
    dramaticType?: string;
    issuerIntent?: string;
    playerHook?: string;
    urgencyReason?: string;
    riskNote?: string;
    taboo?: string;
    hiddenMotive?: string;
    deadlineHint?: string;
    residueOnComplete?: string;
    residueOnFail?: string;
    relatedNpcIds?: string[];
    relatedLocationIds?: string[];
    relatedEscapeProgress?: string;
    trustImpactHint?: string;
    canBackfire?: boolean;
    backfireConsequences?: string[];
    followupSeedCodes?: string[];
    spokenDeliveryStyle?: string;
  };

  hooks?: {
    worldConsequences?: string[];
    reward?: { originium?: number; items?: string[]; unlocks?: string[] };
    hiddenTriggerConditions?: string[];
  };
};

export type EscapeConditionSpec = {
  code: string; // escape.condition.xxx
  label: string;
  required: boolean;
  kind: "route_hint" | "escape_condition" | "access_grant" | "cost_or_sacrifice" | "false_lead";
};

export type EscapeRouteFragmentSpec = {
  code: string; // escape.fragment.xxx
  label: string;
  hint: string;
  anchors?: { npcIds?: string[]; locationIds?: string[] };
};

export type FalseLeadSpec = {
  code: string; // escape.falselead.xxx
  label: string;
  warning: string;
  anchors?: { npcIds?: string[]; locationIds?: string[] };
};

export type EscapeOutcomeSpec = {
  code: "true_escape" | "false_escape" | "costly_escape" | "doom";
  title: string;
  toneLine: string;
};

export type EscapeContentSpec = {
  meta?: ContentMeta;
  conditions: EscapeConditionSpec[];
  fragments: EscapeRouteFragmentSpec[];
  falseLeads: FalseLeadSpec[];
  outcomes: EscapeOutcomeSpec[];
};

