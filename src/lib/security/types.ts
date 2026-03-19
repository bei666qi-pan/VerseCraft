export type ModerationStage = "pre_input" | "post_model" | "final_output";

export type RiskCategory =
  | "none"
  | "illegal_extreme"
  | "sexual"
  | "violence"
  | "hate"
  | "prompt_injection"
  | "malicious_payload"
  | "abuse_spam";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type ModerationDecision = "allow" | "review" | "block";

export type ModerationResult = {
  decision: ModerationDecision;
  severity: RiskSeverity;
  score: number;
  categories: RiskCategory[];
  reason: string;
  sanitizedText?: string;
  metadata?: Record<string, unknown>;
};

export type ModerationContext = {
  requestId: string;
  userId?: string | null;
  ip?: string;
  path?: string;
  stage: ModerationStage;
};

export type ModerationProvider = {
  name: string;
  moderate: (input: string, context: ModerationContext) => Promise<ModerationResult>;
};

export type RiskDecision = {
  blocked: boolean;
  statusCode: number;
  userMessage: string;
};
