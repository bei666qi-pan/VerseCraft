/**
 * Evaluation recommendation builder.
 *
 * Converts evidence-backed defects into an explicit implementation handoff.
 * This module never edits files, launches a writer, or claims a repair ran.
 */

import type {
  TriagedDefect,
  EvaluationRecommendation,
} from "./types";

interface RecommendationSuggestion {
  rootCause: string;
  candidateFiles: string[];
  approach: string;
  risks: string[];
  impactOnNormalPlay: string;
}

const RECOMMENDATION_KNOWLEDGE_BASE: Record<string, RecommendationSuggestion> = {
  action_legality: {
    rootCause: "Action validation does not properly gate this player action.",
    candidateFiles: ["src/lib/security/chatValidation.ts", "src/lib/playRealtime/normalizePlayerDmJson.ts"],
    approach: "Open an implementation task to reproduce the invariant failure, add a regression test, and tighten the existing validation path.",
    risks: ["May block legitimate edge-case actions", "Could affect opening-scene flexibility"],
    impactOnNormalPlay: "Legitimate actions should remain available while the evidenced invalid pattern is blocked.",
  },
  resource_conservation: {
    rootCause: "Item or currency deltas are not fully validated against authoritative player state.",
    candidateFiles: ["src/lib/playRealtime/forgeService.ts", "src/lib/play/itemGameplay.ts", "src/lib/turnEngine/commitTurn.ts"],
    approach: "Open an implementation task to add a failing conservation test before changing pre-commit validation.",
    risks: ["Could affect forge or reward flows if validation is too broad"],
    impactOnNormalPlay: "Valid item use and rewards should remain unchanged.",
  },
  npc_epistemic_boundary: {
    rootCause: "NPC-scoped knowledge filtering may be missing or bypassed for the evidenced interaction.",
    candidateFiles: ["src/lib/epistemic/filterFacts.ts", "src/lib/epistemic/builders.ts", "src/lib/npcConsistency/validator.ts"],
    approach: "Open an implementation task to reproduce the fact leak and correct the existing epistemic filter or validator.",
    risks: ["Overcorrection may hide reasonable shared context"],
    impactOnNormalPlay: "NPCs retain actor-scoped and scene-public knowledge.",
  },
  state_narrative_consistency: {
    rootCause: "Player-visible narrative conflicts with the authoritative structured state delta.",
    candidateFiles: ["src/lib/turnEngine/validateNarrative.ts", "src/features/play/turnCommit/resolveDmTurn.ts"],
    approach: "Open an implementation task to add an evidence-specific validator regression without parsing narrative as state.",
    risks: ["Broad text matching can create literary false positives"],
    impactOnNormalPlay: "Creative prose remains allowed while factual contradictions are rejected or degraded.",
  },
  option_executability: {
    rootCause: "Generated options are not fully checked against the current authoritative state.",
    candidateFiles: ["src/lib/playRealtime/normalizePlayerDmJson.ts", "src/lib/play/optionsRegenContext.ts"],
    approach: "Open an implementation task to reproduce the impossible option and reuse the existing option-validation path.",
    risks: ["Overly broad filtering may reduce option variety"],
    impactOnNormalPlay: "Executable options remain visible.",
  },
};

export function buildEvaluationRecommendation(defect: TriagedDefect): EvaluationRecommendation {
  const suggestion = RECOMMENDATION_KNOWLEDGE_BASE[defect.signature.category] ?? {
    rootCause: `Evidence requires investigation in ${defect.signature.affectedSystem}.`,
    candidateFiles: [],
    approach: "Open an explicit implementation task, reproduce the cited invariant, then add a failing test before changing production code.",
    risks: ["Impact is not yet bounded by deterministic reproduction"],
    impactOnNormalPlay: "Unknown until the evidence is reproduced.",
  };

  return {
    defectSignature: defect.signature,
    rootCause: suggestion.rootCause,
    candidateFiles: suggestion.candidateFiles,
    approach: suggestion.approach,
    risks: suggestion.risks,
    requiredTests: [
      `Regression test for ${defect.signature.ruleId}`,
      `Forward keep-alive test for ${defect.signature.affectedSystem}`,
    ],
    impactOnNormalPlay: suggestion.impactOnNormalPlay,
    handoff: "explicit_implementation_task_required",
  };
}
