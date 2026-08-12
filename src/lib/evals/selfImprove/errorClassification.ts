/**
 * Evaluation & Regression Campaign — Error Classification
 *
 * Classifies trace-level errors so infrastructure / gateway / parse failures
 * are never counted as gameplay Oracle mismatches and never reach the
 * gameplay Repair Queue.
 *
 * Pure functions only: no IO, no LLM, no network.
 */

export type ErrorClass =
  | "product_defect"
  | "infrastructure_failure"
  | "model_unavailable"
  | "insufficient_evidence"
  | "parse_contract_defect"
  | "external_blocked";

const INFRA_PATTERNS = [
  /aborted due to timeout/i,
  /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i,
  /fetch failed/i,
  /socket hang up/i,
  /No response body reader available/i,
  // Server emitted a visible site-failure fallback instead of a real model
  // turn (e.g. upstream stream stall) — infra evidence, never gameplay.
  /site_fallback|site_unavailable|stream_idle_timeout/i,
];

const MODEL_UNAVAILABLE_PATTERNS = [
  /^HTTP (429|500|502|503|504)\b/,
  /keys_missing/i,
  /rate[_ ]limit/i,
  /model.*(unavailable|overloaded)/i,
  /insufficient.? (quota|balance)/i,
];

const PARSE_CONTRACT_PATTERNS = [
  /Failed to parse __VERSECRAFT_FINAL__/,
  /No __VERSECRAFT_FINAL__ frame received/,
];

const EXTERNAL_BLOCKED_PATTERNS = [
  /^HTTP (401|403|402)\b/,
  /invalid api key|unauthorized|forbidden/i,
];

function matchesAny(patterns: RegExp[], errors: string[]): boolean {
  return errors.some((e) => patterns.some((p) => p.test(e)));
}

/**
 * Classify a trace's error list into a single ErrorClass.
 * Precedence: external_blocked > model_unavailable > infrastructure_failure
 * > parse_contract_defect > product_defect (default).
 * An empty error list yields "product_defect" (meaning: let the Oracle judge).
 */
export function classifyTraceErrors(errors: string[]): ErrorClass {
  if (!errors || errors.length === 0) return "product_defect";
  if (matchesAny(EXTERNAL_BLOCKED_PATTERNS, errors)) return "external_blocked";
  if (matchesAny(MODEL_UNAVAILABLE_PATTERNS, errors)) return "model_unavailable";
  if (matchesAny(INFRA_PATTERNS, errors)) return "infrastructure_failure";
  if (matchesAny(PARSE_CONTRACT_PATTERNS, errors)) return "parse_contract_defect";
  return "product_defect";
}

/** Error classes that must never be Oracle-judged or sent to gameplay repair. */
export const NON_GAMEPLAY_CLASSES: ReadonlySet<ErrorClass> = new Set([
  "infrastructure_failure",
  "model_unavailable",
  "external_blocked",
  "insufficient_evidence",
]);

/** Error classes that may enter a (separate) repair queue. */
export const REPAIRABLE_CLASSES: ReadonlySet<ErrorClass> = new Set([
  "product_defect",
  "parse_contract_defect",
]);
