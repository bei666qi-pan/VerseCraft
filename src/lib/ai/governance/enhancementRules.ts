// src/lib/ai/governance/enhancementRules.ts
import "server-only";

export type { EnhancementGateResult } from "@/lib/ai/governance/enhancementRulesPure";
export {
  evaluateNarrativeEnhancementGate,
  sampleEnhancementAttempt,
} from "@/lib/ai/governance/enhancementRulesPure";
