export type ModerationDecision = "allow" | "review" | "block";

export type ModerationRiskLevel = "normal" | "gray" | "black";

/**
 * ModerationStage maps to where the content is used.
 * - input: player/user input entering the system
 * - output: model/DM output shown to the player
 * - public: content that will be shown publicly (if any)
 */
export type ModerationStage = "input" | "output" | "public";

/**
 * ModerationScene is an operator-friendly label (not a control decision).
 * Keep it as string to support future scenes without changing core types.
 */
export type ModerationScene = string;

export type ModerationCategory = string;

export type ModerationErrorKind = "auth_error" | "network_timeout" | "service_error" | "response_structure_error" | "unknown_error";

export type ModerationEvidence = {
  provider: string;
  /**
   * Content fingerprint (salted hash) to help correlate incidents without storing plaintext.
   * Provider implementations decide the exact fingerprint algorithm.
   */
  contentFingerprint?: string;
  /**
   * Short, non-PII trace info (e.g. traceId or request id) to connect logs/audits.
   * Must not include raw user narrative text by default.
   */
  traceId?: string;

  /**
   * Vendor normalized signals (minimum necessary).
   * Must not include raw credentials.
   */
  vendor?: Record<string, unknown>;

  /**
   * When the provider fails, evidence.errorKind describes which failure class it fell into.
   */
  errorKind?: ModerationErrorKind;
  errorMessage?: string;
};

export type ModerationResult = {
  decision: ModerationDecision;
  riskLevel: ModerationRiskLevel;
  categories: ModerationCategory[];
  /**
   * Optional numeric score in provider-specific scale, but should be roughly comparable.
   * Convention: 0..100 where higher means higher risk.
   */
  score?: number;
  /**
   * Stable reason code for debugging and later arbitration.
   * Do not place the raw narrative text here.
   */
  reasonCode: string;
  evidence: ModerationEvidence;
};

export type ModerationRequest = {
  text: string;
  scene: ModerationScene;
  stage: ModerationStage;
  /**
   * A caller-provided trace id to connect moderation, auditing, and user reports.
   */
  traceId?: string;
  /**
   * A salted hash of userId on the caller side (no raw user id).
   */
  userIdHash?: string;
  routeContext?: Record<string, unknown>;
};

export interface ContentSafetyProvider {
  readonly name: string;
  moderateText(req: ModerationRequest): Promise<ModerationResult>;
}

