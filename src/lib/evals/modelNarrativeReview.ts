import { createHash } from "node:crypto";
// Eval CLI must be runnable outside the Next server-component runtime. It still uses the
// task-policy-enforced executor and is restricted to the offline EVAL_JUDGE task below.
// eslint-disable-next-line no-restricted-imports
import { executeChatCompletion } from "@/lib/ai/router/execute";
import { envBoolean } from "@/lib/config/envRaw";
import { tryConsumeBudget } from "@/lib/evals/harness/budgetGuard";
import { buildLiveResultCacheKey, readLiveResultCache, writeLiveResultCache } from "@/lib/evals/harness/liveResultCache";

export const MODEL_NARRATIVE_REVIEW_RUBRIC_VERSION = "model-narrative-review-v2";

export const MODEL_NARRATIVE_REVIEW_DIMENSIONS = [
  "fact_support",
  "epistemic_boundary",
  "state_narrative_consistency",
  "option_executability",
  "player_agency",
  "readable_suspense",
] as const;

export type ModelNarrativeReviewDimension = (typeof MODEL_NARRATIVE_REVIEW_DIMENSIONS)[number];
export type ModelNarrativeReviewProvenance = "live_model" | "offline_heuristic" | "inconclusive" | "not_run";
export type ModelNarrativeReviewReason =
  | "feature_disabled"
  | "live_not_requested"
  | "budget_exhausted"
  | "gateway_error"
  | "invalid_json"
  | "low_confidence"
  | "unsupported_issue_evidence";

export interface ModelNarrativeReviewFact {
  id: string;
  text: string;
  revealTier?: number;
  actorScope?: string;
}

export interface ModelNarrativeReviewStep {
  stepIndex: number;
  playerAction: string;
  narrative: string;
  options: string[];
  optionsSource?: "main_turn" | "client_regenerated";
  clientOptionRegeneration?: Record<string, unknown>;
  dmJson: Record<string, unknown>;
  stateBefore?: Record<string, unknown>;
  stateAfter?: Record<string, unknown>;
}

export interface ModelNarrativeReviewTarget {
  caseId: string;
  scenario: string;
  permittedFacts: ModelNarrativeReviewFact[];
  steps: ModelNarrativeReviewStep[];
}

export interface ModelNarrativeReviewIssue {
  dimension: ModelNarrativeReviewDimension;
  severity: "critical" | "major" | "minor";
  description: string;
  stepIndex?: number;
  evidence?: string;
  factId?: string;
}

export interface ModelNarrativeReviewVerdict {
  confidence: number;
  dimensionScores: Record<ModelNarrativeReviewDimension, number>;
  passed: boolean;
  reasoning: string;
  issues: ModelNarrativeReviewIssue[];
}

export interface ModelNarrativeReviewResult {
  caseId: string;
  contentHash: string;
  rubricVersion: typeof MODEL_NARRATIVE_REVIEW_RUBRIC_VERSION;
  provenance: ModelNarrativeReviewProvenance;
  reason?: ModelNarrativeReviewReason;
  verdict?: ModelNarrativeReviewVerdict;
  model?: string;
  logicalTask: "EVAL_JUDGE";
  cacheHit: boolean;
  failure?: {
    code: string;
    lastFailureSummary?: string;
    attempts?: Array<{
      logicalRole: string;
      failureKind?: string;
      httpStatus?: number;
      latencyMs?: number;
    }>;
  };
}

export interface ModelNarrativeReviewSummary {
  total: number;
  liveReviewed: number;
  passed: number;
  failed: number;
  inconclusive: number;
  notRun: number;
  liveCoverage: number;
  strictGatePass: boolean;
}

export interface ReviewModelNarrativeOptions {
  liveRequested: boolean;
  minimumConfidence?: number;
  timeoutMs?: number;
  callJudge?: typeof executeChatCompletion;
  consumeBudget?: (purpose: string) => boolean;
}

function score(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
}

function confidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const body = fenced ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!body || !body.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function contentHashForModelNarrativeReview(target: ModelNarrativeReviewTarget): string {
  return createHash("sha256")
    .update(JSON.stringify({ rubric: MODEL_NARRATIVE_REVIEW_RUBRIC_VERSION, target }))
    .digest("hex");
}

export function buildModelNarrativeReviewPrompt(target: ModelNarrativeReviewTarget): { system: string; user: string } {
  const allowedFacts = target.permittedFacts.map((fact) => ({ id: fact.id, text: fact.text, revealTier: fact.revealTier, actorScope: fact.actorScope }));
  const transcript = target.steps.map((step) => ({
    stepIndex: step.stepIndex,
    playerAction: step.playerAction,
    narrative: step.narrative,
    options: step.options,
    optionsSource: step.optionsSource ?? "main_turn",
    clientOptionRegeneration: step.clientOptionRegeneration,
    dmJson: step.dmJson,
    stateBefore: step.stateBefore,
    stateAfter: step.stateAfter,
  }));
  return {
    system: `你是 VerseCraft 互动叙事质量评审。只能依据提供的玩家可见轨迹、结构化状态和允许事实评分；不得把缺失信息当作错误，也不得发明世界事实。请严格以 JSON 格式输出，不要输出 Markdown。\n\n玩家可见证据仅包括 narrative、最终 options、玩家动作和最终结构化状态。dmJson 中的 _narrative_audit、candidate_new_facts、used_fact_ids、security_meta 仅是未提交的内部审计元数据，绝不可单独作为事实幻觉、认知泄露或玩家可见 evidence；只有它们也出现在 narrative/options/最终状态时才可引用。\n\n评分维度：fact_support（事实支撑）、epistemic_boundary（认知边界）、state_narrative_consistency（状态叙事一致性）、option_executability（选项可执行性）、player_agency（玩家能动性）、readable_suspense（可读悬疑）。每项 1-5 分。critical 或 major 问题必须含 stepIndex、玩家可见 evidence，且事实类问题必须含 factId。若问题是“凭空添加了未在允许事实中登记的事实”，factId 必须写字面量 "__unsupported_fact__"，绝不可写 null、空串或省略。无法引用玩家可见 evidence 时不要报告该问题。`,
    user: `请评审以下轨迹。\n\n场景：${target.scenario}\n允许事实（仅这些可用于判断世界事实）：\n${JSON.stringify(allowedFacts)}\n\n轨迹：\n${JSON.stringify(transcript)}\n\n输出 schema：\n{"confidence":0-1,"dimensionScores":{"fact_support":1-5,"epistemic_boundary":1-5,"state_narrative_consistency":1-5,"option_executability":1-5,"player_agency":1-5,"readable_suspense":1-5},"passed":true,"reasoning":"简短理由","issues":[{"dimension":"fact_support|epistemic_boundary|state_narrative_consistency|option_executability|player_agency|readable_suspense","severity":"critical|major|minor","description":"问题","stepIndex":0,"evidence":"玩家可见原文摘录","factId":"允许事实 id（仅事实问题需要）"}]}`,
  };
}

export function parseModelNarrativeReviewVerdict(raw: string): ModelNarrativeReviewVerdict | null {
  const value = extractJson(raw);
  if (!value) return null;
  const parsedConfidence = confidence(value.confidence);
  const rawScores = value.dimensionScores;
  if (parsedConfidence === null || !rawScores || typeof rawScores !== "object" || Array.isArray(rawScores) || typeof value.passed !== "boolean" || typeof value.reasoning !== "string" || !Array.isArray(value.issues)) return null;
  const dimensionScores = {} as Record<ModelNarrativeReviewDimension, number>;
  for (const dimension of MODEL_NARRATIVE_REVIEW_DIMENSIONS) {
    const valueForDimension = score((rawScores as Record<string, unknown>)[dimension]);
    if (valueForDimension === null) return null;
    dimensionScores[dimension] = valueForDimension;
  }
  const issues: ModelNarrativeReviewIssue[] = [];
  for (const rawIssue of value.issues) {
    if (!rawIssue || typeof rawIssue !== "object" || Array.isArray(rawIssue)) return null;
    const issue = rawIssue as Record<string, unknown>;
    const dimension = issue.dimension;
    const severity = issue.severity;
    if (!MODEL_NARRATIVE_REVIEW_DIMENSIONS.includes(dimension as ModelNarrativeReviewDimension) || !["critical", "major", "minor"].includes(String(severity)) || typeof issue.description !== "string" || issue.description.trim().length === 0) return null;
    const criticalOrMajor = severity === "critical" || severity === "major";
    if (criticalOrMajor && (!Number.isInteger(issue.stepIndex) || typeof issue.evidence !== "string" || issue.evidence.trim().length === 0)) return null;
    if (criticalOrMajor && (dimension === "fact_support" || dimension === "epistemic_boundary") && (typeof issue.factId !== "string" || issue.factId.trim().length === 0)) return null;
    issues.push({
      dimension: dimension as ModelNarrativeReviewDimension,
      severity: severity as ModelNarrativeReviewIssue["severity"],
      description: issue.description,
      stepIndex: Number.isInteger(issue.stepIndex) ? issue.stepIndex as number : undefined,
      evidence: typeof issue.evidence === "string" ? issue.evidence : undefined,
      factId: typeof issue.factId === "string" ? issue.factId : undefined,
    });
  }
  return { confidence: parsedConfidence, dimensionScores, passed: value.passed, reasoning: value.reasoning, issues };
}

function baseResult(
  target: ModelNarrativeReviewTarget,
  contentHash: string,
  provenance: ModelNarrativeReviewProvenance,
  reason?: ModelNarrativeReviewReason,
  failure?: ModelNarrativeReviewResult["failure"],
): ModelNarrativeReviewResult {
  return { caseId: target.caseId, contentHash, rubricVersion: MODEL_NARRATIVE_REVIEW_RUBRIC_VERSION, provenance, reason, logicalTask: "EVAL_JUDGE", cacheHit: false, ...(failure ? { failure } : {}) };
}

export async function reviewModelNarrative(target: ModelNarrativeReviewTarget, options: ReviewModelNarrativeOptions): Promise<ModelNarrativeReviewResult> {
  const hash = contentHashForModelNarrativeReview(target);
  if (!options.liveRequested) return baseResult(target, hash, "not_run", "live_not_requested");
  if (!envBoolean("VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS", false)) return baseResult(target, hash, "not_run", "feature_disabled");
  const cacheKey = buildLiveResultCacheKey({ suite: MODEL_NARRATIVE_REVIEW_RUBRIC_VERSION, hash });
  const cached = readLiveResultCache<ModelNarrativeReviewResult>(cacheKey);
  if (cached) return { ...cached, cacheHit: true };
  const consumeBudget = options.consumeBudget ?? tryConsumeBudget;
  if (!consumeBudget("model_narrative_review")) return baseResult(target, hash, "inconclusive", "budget_exhausted");
  const prompt = buildModelNarrativeReviewPrompt(target);
  const callJudge = options.callJudge ?? executeChatCompletion;
  try {
    const response = await callJudge({
      task: "EVAL_JUDGE",
      messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
      ctx: { requestId: `model-narrative-review-${hash.slice(0, 12)}`, task: "EVAL_JUDGE", tags: { rubric: MODEL_NARRATIVE_REVIEW_RUBRIC_VERSION } },
      requestTimeoutMs: options.timeoutMs ?? 90_000,
      extraBody: { enable_thinking: false, thinking: { type: "disabled" } },
      skipCache: false,
    });
    if (!response.ok) {
      return baseResult(target, hash, "inconclusive", "gateway_error", {
        code: response.code,
        lastFailureSummary: response.routing?.lastFailureSummary,
        attempts: response.routing?.attempts.map((attempt) => ({
          logicalRole: attempt.logicalRole,
          ...(attempt.failureKind ? { failureKind: attempt.failureKind } : {}),
          ...(typeof attempt.httpStatus === "number" ? { httpStatus: attempt.httpStatus } : {}),
          ...(typeof attempt.latencyMs === "number" ? { latencyMs: attempt.latencyMs } : {}),
        })),
      });
    }
    const verdict = parseModelNarrativeReviewVerdict(response.content);
    if (!verdict) return baseResult(target, hash, "inconclusive", "invalid_json");
    if (verdict.confidence < (options.minimumConfidence ?? 0.7)) return baseResult(target, hash, "inconclusive", "low_confidence");
    const model = response.routing?.attempts.findLast((attempt) => Boolean(attempt.gatewayModel))?.gatewayModel ?? response.providerId;
    const result: ModelNarrativeReviewResult = { ...baseResult(target, hash, "live_model"), verdict, model, cacheHit: Boolean(response.fromCache) };
    writeLiveResultCache(cacheKey, result);
    return result;
  } catch (error) {
    return baseResult(target, hash, "inconclusive", "gateway_error", {
      code: "exception",
      lastFailureSummary: error instanceof Error ? error.name : "unknown",
    });
  }
}

export function summarizeModelNarrativeReviews(results: ModelNarrativeReviewResult[], minimumLiveCoverage = 1): ModelNarrativeReviewSummary {
  const liveReviewed = results.filter((result) => result.provenance === "live_model").length;
  const passed = results.filter((result) => result.provenance === "live_model" && result.verdict?.passed).length;
  const failed = results.filter((result) => result.provenance === "live_model" && !result.verdict?.passed).length;
  const inconclusive = results.filter((result) => result.provenance === "inconclusive").length;
  const notRun = results.filter((result) => result.provenance === "not_run").length;
  const liveCoverage = results.length === 0 ? 0 : liveReviewed / results.length;
  const supportedSeriousIssue = results.some((result) => result.provenance === "live_model" && result.verdict?.issues.some((issue) => (issue.severity === "critical" || issue.severity === "major") && Boolean(issue.evidence)));
  return { total: results.length, liveReviewed, passed, failed, inconclusive, notRun, liveCoverage, strictGatePass: liveCoverage >= minimumLiveCoverage && !supportedSeriousIssue && failed === 0 };
}
