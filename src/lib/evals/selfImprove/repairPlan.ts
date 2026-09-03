/**
 * Self-Improving Agent System — Repair Plan
 *
 * Generates repair plans from triaged defects. Each plan specifies:
 * - Root cause analysis
 * - Candidate files to modify
 * - Repair approach
 * - Risks and impact assessment
 * - Required tests
 *
 * In the current smoke profile, the main orchestrator (Codex) acts
 * as the repair agent. This module provides the interface that the
 * orchestrator uses to structure and track repairs.
 */

import type {
  TriagedDefect,
  DefectSignature,
  RepairPlan,
  RepairResult,
} from "./types";

// ── Repair candidate generation ───────────────────────

interface RepairSuggestion {
  rootCause: string;
  candidateFiles: string[];
  approach: string;
  risks: string[];
  impactOnNormalPlay: string;
}

const REPAIR_KNOWLEDGE_BASE: Record<string, Record<string, RepairSuggestion>> = {
  action_legality: {
    default: {
      rootCause: "Action validation logic does not properly gate the specific player action.",
      candidateFiles: [
        "src/lib/security/chatValidation.ts",
        "src/lib/playRealtime/normalizePlayerDmJson.ts",
      ],
      approach: "Add validation rule in chatValidation or normalizePlayerDmJson to catch invalid actions before commit.",
      risks: ["May block legitimate edge-case actions", "Could affect opening scene flexibility"],
      impactOnNormalPlay: "Legitimate actions should continue to work; only new invalid patterns blocked.",
    },
  },
  resource_conservation: {
    default: {
      rootCause: "Item/currency delta is not properly validated against player inventory state.",
      candidateFiles: [
        "src/lib/playRealtime/forgeService.ts",
        "src/lib/play/itemGameplay.ts",
        "src/lib/turnEngine/commitTurn.ts",
      ],
      approach: "Add pre-commit inventory validation: verify items/currency exist before awarding or deducting.",
      risks: ["Could break forge flow if validation is too strict", "Must handle edge cases like quest rewards"],
      impactOnNormalPlay: "Normal item usage and rewards should be unaffected; only prevents impossible transactions.",
    },
  },
  npc_epistemic_boundary: {
    default: {
      rootCause: "NPC knowledge filter is not applied or is bypassed for this interaction pattern.",
      candidateFiles: [
        "src/lib/epistemic/filterFacts.ts",
        "src/lib/epistemic/builders.ts",
        "src/lib/npcConsistency/validator.ts",
      ],
      approach: "Ensure epistemic filter runs for the NPC before generating response; add post-generation consistency check.",
      risks: ["May make NPCs seem ignorant of reasonable shared context", "Could slow down dialogue turns"],
      impactOnNormalPlay: "NPCs should still know their own facts and publicly available information.",
    },
  },
  state_narrative_consistency: {
    default: {
      rootCause: "Narrative claims a state change that is not reflected in the structured state delta.",
      candidateFiles: [
        "src/lib/turnEngine/validateNarrative.ts",
        "src/lib/turnEngine/commitTurn.ts",
        "src/features/play/turnCommit/resolveDmTurn.ts",
      ],
      approach: "Add post-generation validator that cross-references narrative claims with state delta fields.",
      risks: ["Narrative flexibility may decrease", "Some literary descriptions may trigger false positives"],
      impactOnNormalPlay: "Narrative should still be creative; only flagging factual contradictions.",
    },
  },
  option_executability: {
    default: {
      rootCause: "Options are generated without verifying they can be executed in current game state.",
      candidateFiles: [
        "src/lib/playRealtime/normalizePlayerDmJson.ts",
        "src/lib/play/optionsSemanticGuards.ts",
      ],
      approach: "Add option validation against current state before presenting to player.",
      risks: ["Could reduce option variety", "Dynamic option generation may be affected"],
      impactOnNormalPlay: "Valid options should still appear; only impossible options filtered out.",
    },
  },
  death_state_gating: {
    default: {
      rootCause: "Death/incapacitated state is not checked before processing player actions.",
      candidateFiles: [
        "src/lib/security/chatValidation.ts",
        "src/lib/turnEngine/routeTurnLane.ts",
      ],
      approach: "Add early gate in chatValidation that rejects actions when player is dead/incapacitated.",
      risks: ["Must handle revival/resurrection mechanics correctly", "Narrative death scenes may need special handling"],
      impactOnNormalPlay: "Alive players unaffected; dead players get appropriate rejection messages.",
    },
  },
  idempotency: {
    default: {
      rootCause: "Turn processing does not detect or prevent duplicate action submissions.",
      candidateFiles: [
        "src/lib/turnEngine/commitTurn.ts",
        "src/app/api/chat/route.ts",
      ],
      approach: "Add idempotency key or state hash check before processing turn.",
      risks: ["Could block legitimate repeated actions (e.g., 'try again')", "May need session-level tracking"],
      impactOnNormalPlay: "Repeated actions that are genuinely different should still work.",
    },
  },
  npc_fact_grounding: {
    default: {
      rootCause: "NPC is given facts they should not have access to.",
      candidateFiles: [
        "src/lib/epistemic/filterFacts.ts",
        "src/lib/epistemic/builders.ts",
        "src/lib/npcConsistency/validator.ts",
      ],
      approach: "Tighten epistemic filter for NPCs; add post-generation fact-source check.",
      risks: ["NPCs may lose some narrative depth", "Complex NPC relationships may be harder to express"],
      impactOnNormalPlay: "NPCs retain knowledge of their own domain and publicly known facts.",
    },
  },
  playability_agency: {
    default: {
      rootCause: "Turn resolution produces dead-end states or ignores player input.",
      candidateFiles: [
        "src/features/play/turnCommit/resolveDmTurn.ts",
        "src/lib/playRealtime/normalizePlayerDmJson.ts",
      ],
      approach: "Ensure every turn produces at least one forward path; validate input acknowledgment.",
      risks: ["Could force options in situations where dead-ends are narratively appropriate"],
      impactOnNormalPlay: "Players should always have agency; narrative dead-ends should be deliberate, not accidental.",
    },
  },
};

export function suggestRepair(defect: TriagedDefect): RepairSuggestion {
  const category = defect.signature.category;
  const ruleId = defect.signature.ruleId;

  const categoryKB = REPAIR_KNOWLEDGE_BASE[category];
  if (!categoryKB) {
    return {
      rootCause: `Unknown category: ${category}`,
      candidateFiles: [],
      approach: "Manual investigation required.",
      risks: ["Unknown impact"],
      impactOnNormalPlay: "Unknown",
    };
  }

  const suggestion = categoryKB[ruleId] || categoryKB.default;
  return suggestion || {
    rootCause: `Unmapped rule: ${ruleId}`,
    candidateFiles: [],
    approach: "Manual investigation required.",
    risks: ["Unknown"],
    impactOnNormalPlay: "Unknown",
  };
}

// ── Repair plan construction ──────────────────────────

export function buildRepairPlan(defect: TriagedDefect): RepairPlan {
  const suggestion = suggestRepair(defect);

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
    selected: false,
  };
}

// ── Repair result tracking ────────────────────────────

export function createRepairResult(
  defectSignature: DefectSignature,
  success: boolean,
  addedTests: string[],
  modifiedFiles: string[],
  testFailedBefore: boolean,
  testPassedAfter: boolean,
  regressionPassed: boolean,
  notes: string,
): RepairResult {
  return {
    defectSignature,
    success,
    addedTests,
    modifiedFiles,
    testFailedBeforeRepair: testFailedBefore,
    testPassedAfterRepair: testPassedAfter,
    regressionTestsPassed: regressionPassed,
    notes,
    reverted: false,
  };
}
