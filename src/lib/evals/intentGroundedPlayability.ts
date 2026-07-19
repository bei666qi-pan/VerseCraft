import type { PlayerControlPlane, PlayerIntentKind, PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import { isLiveModelControlEvidence, type ControlPreflightSource } from "@/lib/playRealtime/controlPreflightEvidence";
import { computePreNarrativeDelta } from "@/lib/turnEngine/computeStateDelta";
import { normalizePlayerInput } from "@/lib/turnEngine/normalizePlayerInput";

export const INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION = "intent-grounded-playability-v1";

export type IntentDisposition = "allow" | "clarify" | "refuse";

export interface IntentGroundedExpression {
  id: string;
  text: string;
}

export interface IntentGroundedCase {
  id: string;
  category: "explore" | "investigate" | "dialogue" | "use_item" | "combat" | "negation" | "ambiguity" | "injection" | "authority";
  sceneFacts: string[];
  expressions: IntentGroundedExpression[];
  ruleSnapshot: PlayerRuleSnapshot;
  expected: {
    disposition: IntentDisposition;
    intent?: PlayerIntentKind;
    requiredSlots?: Partial<Record<"target" | "item_hint" | "location_hint", string>>;
    forbiddenSlotValues?: string[];
    maxConfidence?: number;
  };
  invariants: Array<"must_block" | "must_not_block" | "must_consume_time" | "must_not_expose_slot">;
}

export interface IntentGroundedCorpus {
  version: typeof INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION;
  cases: IntentGroundedCase[];
}

export interface IntentOracleIssue {
  code: "intent_mismatch" | "slot_missing" | "forbidden_slot" | "unexpected_block" | "missing_block" | "confidence_too_high" | "time_invariant" | "non_model_evidence" | "missing_candidate";
  message: string;
}

export interface IntentOracleVerdict {
  status: "pass" | "fail" | "inconclusive";
  issues: IntentOracleIssue[];
  normalizedIntent?: ReturnType<typeof normalizePlayerInput>;
  preDelta?: ReturnType<typeof computePreNarrativeDelta>;
}

function nonEmptyStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

export function lintIntentGroundedCorpus(value: unknown): string[] {
  const corpus = value as Partial<IntentGroundedCorpus> | null;
  const errors: string[] = [];
  if (!corpus || corpus.version !== INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION) errors.push("invalid corpus version");
  if (!Array.isArray(corpus?.cases) || corpus.cases.length < 8) return [...errors, "corpus requires at least eight cases"];
  const ids = new Set<string>();
  for (const row of corpus.cases) {
    if (!row || typeof row !== "object") {
      errors.push("case is not an object");
      continue;
    }
    const item = row as IntentGroundedCase;
    if (!item.id || ids.has(item.id)) errors.push(`invalid or duplicate case id: ${String(item.id)}`);
    ids.add(item.id);
    if (!nonEmptyStrings(item.sceneFacts) || item.sceneFacts.length < 2) errors.push(`${item.id}: sceneFacts must contain at least two facts`);
    if (!Array.isArray(item.expressions) || item.expressions.length < 2 || item.expressions.some((expression) => !expression?.id || !expression.text?.trim())) errors.push(`${item.id}: requires at least two non-empty expressions`);
    if (!item.expected || !["allow", "clarify", "refuse"].includes(item.expected.disposition)) errors.push(`${item.id}: invalid expected disposition`);
    if (item.expected?.disposition === "allow" && !item.expected.intent) errors.push(`${item.id}: allowed action requires expected intent`);
    if (item.expected?.disposition === "clarify" && (!Number.isFinite(item.expected.maxConfidence) || (item.expected.maxConfidence ?? 2) > 0.7)) errors.push(`${item.id}: clarify must cap confidence at 0.7 or lower`);
    if (!Array.isArray(item.invariants) || item.invariants.length === 0) errors.push(`${item.id}: requires invariants`);
  }
  return errors;
}

function slots(control: PlayerControlPlane): string[] {
  return [control.extracted_slots.target, control.extracted_slots.item_hint, control.extracted_slots.location_hint]
    .map((value) => value?.trim())
    .filter((value): value is string => typeof value === "string" && value.length > 0) as string[];
}

function includesExpected(actual: string | undefined, expected: string): boolean {
  return Boolean(actual && actual.replace(/\s+/g, "").includes(expected.replace(/\s+/g, "")));
}

/**
 * The control schema has deliberately small, overlapping slot fields.  A model
 * can ground "305" as a target ("305 门") or as a location ("305 外面")
 * without changing the actual player intent.  The evaluator must measure that
 * semantic grounding, rather than falsely failing on one field name.
 */
function hasGroundedSlot(control: PlayerControlPlane, expected: string): boolean {
  return slots(control).some((actual) => includesExpected(actual, expected));
}

export function evaluateIntentGroundedCandidate(args: {
  testCase: IntentGroundedCase;
  expression: IntentGroundedExpression;
  control: PlayerControlPlane | null;
  source: ControlPreflightSource;
}): IntentOracleVerdict {
  if (!isLiveModelControlEvidence({ ok: Boolean(args.control), source: args.source })) {
    return { status: "inconclusive", issues: [{ code: "non_model_evidence", message: `execution source ${args.source} is not live model evidence` }] };
  }
  const control = args.control;
  if (!control) return { status: "inconclusive", issues: [{ code: "missing_candidate", message: "model result contains no control candidate" }] };

  const issues: IntentOracleIssue[] = [];
  const expected = args.testCase.expected;
  if (expected.disposition === "allow" && control.intent !== expected.intent) {
    issues.push({ code: "intent_mismatch", message: `expected intent ${expected.intent}, received ${control.intent}` });
  }
  if (expected.disposition === "clarify") {
    if (control.intent !== "other") issues.push({ code: "intent_mismatch", message: `ambiguous or untrusted action must be other, received ${control.intent}` });
    if (control.confidence > (expected.maxConfidence ?? 0.7)) issues.push({ code: "confidence_too_high", message: `ambiguous confidence ${control.confidence} exceeds ${expected.maxConfidence ?? 0.7}` });
  }
  if (expected.disposition === "refuse" && !control.block_dm) issues.push({ code: "missing_block", message: "refusal policy requires block_dm" });
  if (expected.disposition !== "refuse" && control.block_dm) issues.push({ code: "unexpected_block", message: "safe action was blocked" });
  for (const [key, value] of Object.entries(expected.requiredSlots ?? {}) as Array<[keyof PlayerControlPlane["extracted_slots"], string]>) {
    if (!hasGroundedSlot(control, value)) issues.push({ code: "slot_missing", message: `required ${key}=${value} is absent from all semantic slots` });
  }
  const allSlots = slots(control);
  for (const forbidden of expected.forbiddenSlotValues ?? []) {
    if (allSlots.some((slot) => slot.includes(forbidden))) issues.push({ code: "forbidden_slot", message: `forbidden slot value ${forbidden} was accepted` });
  }
  if (args.testCase.invariants.includes("must_not_expose_slot") && allSlots.length > 0) {
    issues.push({ code: "forbidden_slot", message: "case forbids control-plane slots but one was emitted" });
  }

  const normalizedIntent = normalizePlayerInput({
    latestUserInput: args.expression.text,
    control,
    riskTags: control.risk_tags,
    isFirstAction: false,
    shouldApplyFirstActionConstraint: false,
    clientPurpose: "normal",
  });
  const preDelta = computePreNarrativeDelta({
    intent: normalizedIntent,
    control,
    rule: args.testCase.ruleSnapshot,
    inputFellBack: false,
    antiCheatFallback: false,
  });
  if (args.testCase.invariants.includes("must_block") && (preDelta.isActionLegal !== false || !preDelta.mustDegrade)) issues.push({ code: "missing_block", message: "blocked action did not produce a degrading illegal pre-delta" });
  if (args.testCase.invariants.includes("must_not_block") && preDelta.isActionLegal === false) issues.push({ code: "unexpected_block", message: "safe action produced illegal pre-delta" });
  if (args.testCase.invariants.includes("must_consume_time") && !preDelta.consumesTime) issues.push({ code: "time_invariant", message: "story action unexpectedly avoids time cost" });
  return { status: issues.length === 0 ? "pass" : "fail", issues, normalizedIntent, preDelta };
}

export function summarizeIntentGroundedVerdicts(verdicts: IntentOracleVerdict[]): { total: number; passed: number; failed: number; inconclusive: number; strictGatePass: boolean } {
  const passed = verdicts.filter((verdict) => verdict.status === "pass").length;
  const failed = verdicts.filter((verdict) => verdict.status === "fail").length;
  const inconclusive = verdicts.filter((verdict) => verdict.status === "inconclusive").length;
  return { total: verdicts.length, passed, failed, inconclusive, strictGatePass: verdicts.length > 0 && failed === 0 && inconclusive === 0 };
}
