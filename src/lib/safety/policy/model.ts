export type RiskLevel = "allow" | "review" | "soft_block" | "hard_block";

/**
 * Final moderation action that feature code should follow.
 * - allow: proceed as-is
 * - rewrite: safe rewrite is allowed/required (retain atmosphere but suppress details)
 * - fallback: return a safe fallback response/template
 * - reject: reject request / do not show content (hard stop)
 */
export type ModerationDecision = "allow" | "rewrite" | "fallback" | "reject";

export type ModerationStage = "input" | "output" | "public_display";

export type ModerationScene =
  | "private_story_action"
  | "private_story_output"
  | "npc_dialogue"
  | "threat_encounter"
  | "b1_safe_zone"
  | "task_text"
  | "codex_text"
  | "public_share"
  | "feedback"
  | "report"
  | "account_profile";

export type FailMode = "fail_soft" | "fail_closed";

export type SafetyRuntimeContext = {
  locationId?: string | null;
  floorId?: string | null;
  isB1SafeZone?: boolean;
  threat?: {
    activeThreatId?: string | null;
    phase?: "idle" | "active" | "suppressed" | "breached" | string;
    suppressionProgress?: number | null;
  } | null;
  activeTasks?: string[];
  nearbyNpcIds?: string[];
  worldFlags?: string[];

  /** True when content will be shown publicly (e.g. public share). */
  isPublic?: boolean;
};

export type ProviderSignal = {
  provider: string;
  /**
   * Provider decision is treated as a signal, not final verdict.
   */
  decision: "allow" | "review" | "block";
  /**
   * Provider riskLevel in our own terminology.
   */
  riskLevel: "normal" | "gray" | "black";
  categories: string[];
  score?: number;
  reasonCode?: string;
  evidence?: Record<string, unknown>;
  errorKind?: string;
};

export type WhitelistSignals = {
  worldviewTerms: string[];
  gameplayActions: string[];
  styleToneHints: string[];
  /**
   * True means: the text contains worldview/style/action tokens in a context-consistent way.
   * It reduces false positives but never bypasses legal redlines.
   */
  contextConsistent: boolean;
};

export type PolicyEvaluationInput = {
  text: string;
  scene: ModerationScene;
  stage: ModerationStage;
  runtimeContext?: SafetyRuntimeContext;
  /**
   * Provider results, e.g. Baidu. Treated as signals.
   */
  providerSignals?: ProviderSignal[];
  /**
   * Fail mode determines what to do when providers fail (timeouts, auth errors, etc.).
   */
  failMode?: FailMode;
};

export type PolicyEvaluationResult = {
  riskLevel: RiskLevel;
  decision: ModerationDecision;
  /**
   * Stable reason code; do not include raw narrative text.
   */
  reasonCode: string;
  /**
   * Operator-friendly summary (no raw user text by default).
   */
  summary: string;
  /**
   * Optional: the engine can propose a rewritten safe version (Phase2 keeps it optional).
   */
  rewrittenText?: string;
  /**
   * Optional: user-facing message when fallback/reject.
   */
  userMessage?: string;

  providerUsed?: string[];
  whitelist?: WhitelistSignals;
  debug?: Record<string, unknown>;
};

