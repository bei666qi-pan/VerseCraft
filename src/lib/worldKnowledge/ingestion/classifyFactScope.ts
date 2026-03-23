import type { ExtractedFact } from "./extractFactsFromTurn";

export type FactScope = "core_protected" | "shared_candidate" | "user_private" | "session_fact";

export interface ScopedFact extends ExtractedFact {
  scope: FactScope;
  reasons: string[];
}

const AMBIGUOUS_PATTERNS = [/好像/, /似乎/, /可能/, /大概/, /也许/, /应该是/, /我猜/];
const PRIVATE_PATTERNS = [/我/, /我的/, /我们/, /我在/, /我看到/, /我获得/];

function isAmbiguous(text: string): boolean {
  return AMBIGUOUS_PATTERNS.some((re) => re.test(text));
}

function isPrivateSignal(text: string): boolean {
  return PRIVATE_PATTERNS.some((re) => re.test(text));
}

export function classifyFactScope(facts: ExtractedFact[]): ScopedFact[] {
  return facts.map((fact) => {
    const reasons: string[] = [];

    if (fact.source === "session_memory" || fact.source === "player_location" || fact.source === "npc_location_update") {
      reasons.push("session_state_signal");
      return { ...fact, scope: "session_fact", reasons };
    }

    if (fact.source === "codex_update" || fact.source === "rule_hit") {
      reasons.push("high_confidence_system_source");
      return { ...fact, scope: "shared_candidate", reasons };
    }

    if (isPrivateSignal(fact.text) || fact.source === "user_input") {
      reasons.push("player_perspective_signal");
      return { ...fact, scope: "user_private", reasons };
    }

    if (isAmbiguous(fact.text) || fact.confidence < 0.72) {
      reasons.push("low_confidence_or_ambiguous");
      return { ...fact, scope: "user_private", reasons };
    }

    reasons.push("default_candidate");
    return { ...fact, scope: "shared_candidate", reasons };
  });
}
