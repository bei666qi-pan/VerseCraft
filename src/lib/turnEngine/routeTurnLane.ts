// src/lib/turnEngine/routeTurnLane.ts
/**
 * Phase-2: turn lane routing.
 *
 * `TurnLane` ("FAST" | "RULE" | "REVEAL") is the semantic execution lane of
 * this turn. It is *orthogonal* to the legacy `RiskLane` ("fast" | "slow")
 * which controls TTFT / security budget.
 *
 * Routing is deterministic and code-reviewable. The narrative main model never
 * implicitly decides the lane — by the time we reach generation, the lane has
 * already been chosen here.
 *
 * Routing priority (explicit, top-down):
 * 1. `options_regen_only` client purpose    -> FAST
 * 2. `system_transition` or opening first-action -> RULE (with reason)
 * 3. Explicit reveal / investigation intent -> REVEAL
 * 4. Dialogue with a focused NPC (epistemic candidate) -> REVEAL
 * 5. Combat / high-risk tags / high tension -> RULE
 * 6. RiskLane === "fast" + short acknowledgement -> FAST
 * 7. Default -> RULE
 */
import type {
  NormalizedPlayerIntent,
  RiskLane,
  TurnLaneDecision,
  TurnLaneReason,
} from "@/lib/turnEngine/types";

const SHORT_ACK_RE = /^(继续|嗯|好|好的|然后呢|下一步)$/;
const EXPLICIT_REVEAL_RE =
  /(揭露|坦白|说实话|告诉我真相|你到底是谁|你藏了什么|你在骗我|说清楚|不要回避)/;

type RouteArgs = {
  intent: NormalizedPlayerIntent;
  riskLane: RiskLane;
  /** Optional: focus NPC id indicates epistemic-heavy turn. */
  focusNpcId: string | null;
  /** Optional: director digest beat / tension (from clientState). */
  directorBeat?: string | null;
  directorTension?: number | null;
  /** Whether epistemic rollout is enabled; gates REVEAL routing. */
  epistemicEnabled: boolean;
};

function pickConfidence(reasons: TurnLaneReason[]): "low" | "medium" | "high" {
  if (reasons.length === 0) return "low";
  const strong = new Set<TurnLaneReason>([
    "options_regen_only",
    "system_transition_input",
    "opening_first_action_constraint",
    "explicit_reveal_intent",
    "high_risk_tags",
    "combat_intent",
  ]);
  for (const r of reasons) if (strong.has(r)) return "high";
  return reasons.length >= 2 ? "medium" : "low";
}

export function routeTurnLane(args: RouteArgs): TurnLaneDecision {
  const reasons: TurnLaneReason[] = [];
  const intent = args.intent;

  // 1. options_regen_only → FAST (never mutates world state)
  if (intent.clientPurpose === "options_regen_only") {
    reasons.push("options_regen_only");
    return { lane: "FAST", reasons, confidence: pickConfidence(reasons) };
  }

  // 2. system_transition / opening first action → RULE, must not FAST away
  if (intent.isSystemTransition) {
    reasons.push("system_transition_input");
    return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
  }
  if (intent.isFirstAction) {
    reasons.push("opening_first_action_constraint");
    return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
  }

  // 3. explicit reveal intent in text → REVEAL
  if (EXPLICIT_REVEAL_RE.test(intent.rawText)) {
    reasons.push("explicit_reveal_intent");
    if (args.epistemicEnabled) {
      return { lane: "REVEAL", reasons, confidence: pickConfidence(reasons) };
    }
    return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
  }

  // 4. investigation intent → REVEAL (tends to surface new facts)
  if (intent.kind === "investigate") {
    reasons.push("investigation_intent");
    if (args.epistemicEnabled) {
      return { lane: "REVEAL", reasons, confidence: pickConfidence(reasons) };
    }
  }

  // 5. dialogue with epistemic focus NPC → REVEAL
  if (intent.kind === "dialogue" && args.focusNpcId && args.epistemicEnabled) {
    reasons.push("dialogue_with_epistemic_focus");
    return { lane: "REVEAL", reasons, confidence: pickConfidence(reasons) };
  }

  // 6. combat or high risk tags → RULE (never fast-lane skip)
  if (intent.kind === "combat") {
    reasons.push("combat_intent");
    return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
  }
  if (intent.riskTags.length > 0) {
    reasons.push("high_risk_tags");
    return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
  }

  // 7. high director tension → RULE
  if (typeof args.directorTension === "number" && Number.isFinite(args.directorTension) && args.directorTension >= 85) {
    reasons.push("high_tension_director");
    return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
  }
  if (args.directorBeat === "collision" || args.directorBeat === "countdown" || args.directorBeat === "peak") {
    reasons.push("high_tension_director");
    return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
  }

  // 8. RiskLane === fast + short ack → FAST
  if (args.riskLane === "fast" && SHORT_ACK_RE.test(intent.rawText.trim())) {
    reasons.push("short_acknowledgement");
    reasons.push("fast_risk_lane");
    return { lane: "FAST", reasons, confidence: pickConfidence(reasons) };
  }
  if (args.riskLane === "fast" && intent.rawText.trim().length <= 12) {
    reasons.push("fast_risk_lane");
    return { lane: "FAST", reasons, confidence: pickConfidence(reasons) };
  }

  // Default.
  reasons.push("default_rule");
  return { lane: "RULE", reasons, confidence: pickConfidence(reasons) };
}

