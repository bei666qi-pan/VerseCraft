// src/lib/playRealtime/narrativeEnhancement.ts
import { pushAiObservability } from "@/lib/ai/debug/observabilityRing";
import { evaluateNarrativeEnhancementGate, sampleEnhancementAttempt } from "@/lib/ai/governance/enhancementRules";
import { aiGovernanceEnv } from "@/lib/ai/governance/governanceEnvCore";
import {
  commitNarrativeEnhancementBudget,
  isNarrativeEnhancementBudgetAvailable,
} from "@/lib/ai/governance/sessionBudget";
import { executeChatCompletion } from "@/lib/ai/service";
import type { OperationMode } from "@/lib/ai/degrade/mode";
import type { AIRequestContext, ChatMessage, TokenUsage } from "@/lib/ai/types/core";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function logEnhanceSkip(args: {
  requestId: string;
  userId: string | null | undefined;
  sessionId: string | null | undefined;
  reason: string;
  score?: number;
}): void {
  pushAiObservability({
    requestId: args.requestId,
    task: "SCENE_ENHANCEMENT",
    phase: `enhance_skip:${args.reason}`,
    cacheHit: false,
    stream: false,
    message: args.score != null ? `score=${args.score}` : undefined,
    userId: args.userId,
  });
}

export type EnhanceAfterMainStreamResult =
  | { kind: "applied"; dm: Record<string, unknown>; wallMs: number; usage: TokenUsage | null }
  | { kind: "skipped"; reason: string; wallMs: number };

/**
 * Post-stream, single-shot enhancement: rewrites only the opening fragment via enhance-role completion (or policy fallback).
 * Gated by code rules + session budget + sampling — never required for a valid turn.
 */
export async function tryEnhanceDmAfterMainStream(args: {
  accumulatedJsonText: string;
  control: PlayerControlPlane | null;
  rule: PlayerRuleSnapshot;
  mode: OperationMode;
  baseCtx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path">;
  signal?: AbortSignal;
  isFirstAction: boolean;
  playerContext: string;
  latestUserInput: string;
  /** Wall-clock cap for enhance-role completion; 0 = task timeout only. */
  enhanceBudgetMs?: number;
}): Promise<EnhanceAfterMainStreamResult> {
  const t0 = Date.now();
  const wallMs = () => Math.max(0, Date.now() - t0);

  if (args.mode !== "full") {
    logEnhanceSkip({
      requestId: args.baseCtx.requestId,
      userId: args.baseCtx.userId,
      sessionId: args.baseCtx.sessionId,
      reason: "mode_not_full",
    });
    return { kind: "skipped", reason: "mode_not_full", wallMs: wallMs() };
  }

  const dm = extractJsonObject(args.accumulatedJsonText);
  if (!dm || typeof dm.narrative !== "string") {
    return { kind: "skipped", reason: "no_valid_dm_json", wallMs: wallMs() };
  }

  const narrative = dm.narrative.trim();
  if (narrative.length < 96) {
    return { kind: "skipped", reason: "narrative_too_short", wallMs: wallMs() };
  }

  const gate = evaluateNarrativeEnhancementGate({
    control: args.control,
    rule: args.rule,
    playerContext: args.playerContext,
    latestUserInput: args.latestUserInput,
    isFirstAction: args.isFirstAction,
    accumulatedDmJson: args.accumulatedJsonText,
    gateMinScore: aiGovernanceEnv.enhanceGateMinScore,
  });

  if (!gate.allowed) {
    logEnhanceSkip({
      requestId: args.baseCtx.requestId,
      userId: args.baseCtx.userId,
      sessionId: args.baseCtx.sessionId,
      reason: gate.reasons.join(","),
      score: gate.score,
    });
    return { kind: "skipped", reason: `gate:${gate.reasons.join(",")}`, wallMs: wallMs() };
  }

  if (!isNarrativeEnhancementBudgetAvailable(args.baseCtx.sessionId)) {
    logEnhanceSkip({
      requestId: args.baseCtx.requestId,
      userId: args.baseCtx.userId,
      sessionId: args.baseCtx.sessionId,
      reason: "session_budget",
      score: gate.score,
    });
    return { kind: "skipped", reason: "session_budget", wallMs: wallMs() };
  }

  if (!sampleEnhancementAttempt(gate.forceAttempt, gate.score)) {
    logEnhanceSkip({
      requestId: args.baseCtx.requestId,
      userId: args.baseCtx.userId,
      sessionId: args.baseCtx.sessionId,
      reason: "sampled_out",
      score: gate.score,
    });
    return { kind: "skipped", reason: "sampled_out", wallMs: wallMs() };
  }

  const task =
    Boolean(args.control?.enhance_scene) && args.rule.high_value_scene
      ? "SCENE_ENHANCEMENT"
      : "NPC_EMOTION_POLISH";

  const prefixLen = Math.min(260, narrative.length);
  const prefix = narrative.slice(0, prefixLen);
  const suffix = narrative.slice(prefixLen);

  const system =
    task === "SCENE_ENHANCEMENT"
      ? [
          "You refine ONLY the opening atmosphere of a Chinese horror text adventure excerpt.",
          "Return plain Simplified Chinese prose only: no JSON, no markdown, no quotes wrapping the whole answer.",
          "Do not add new plot facts, NPC lines in quotation marks, or player choices.",
          "Keep length within 120% of the input prefix character count.",
        ].join(" ")
      : [
          "You sharpen emotional beats in NPC-related Chinese prose for a horror adventure.",
          "Return plain Simplified Chinese only: no JSON, no markdown.",
          "Do not change plot outcomes or add new events.",
          "Keep length within 120% of the input prefix character count.",
        ].join(" ");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: prefix },
  ];

  const enhanceAc = new AbortController();
  const parentSig = args.signal;
  const onParentAbort = (): void => enhanceAc.abort();
  if (parentSig) {
    if (parentSig.aborted) enhanceAc.abort();
    else parentSig.addEventListener("abort", onParentAbort, { once: true });
  }

  const completionP = executeChatCompletion({
    task,
    messages,
    ctx: {
      requestId: args.baseCtx.requestId,
      task,
      userId: args.baseCtx.userId,
      sessionId: args.baseCtx.sessionId,
      path: args.baseCtx.path ?? "/api/chat",
    },
    signal: enhanceAc.signal,
    requestTimeoutMs: 12_000,
  });

  const budgetMs = args.enhanceBudgetMs ?? 0;
  let res: Awaited<typeof completionP>;
  if (budgetMs > 0) {
    let budgetTid: ReturnType<typeof setTimeout> | undefined;
    const budgetPromise = new Promise<"timeout">((resolve) => {
      budgetTid = setTimeout(() => resolve("timeout"), budgetMs);
    });
    const winner = await Promise.race([
      completionP.then((r) => ({ tag: "done" as const, r })),
      budgetPromise.then(() => ({ tag: "timeout" as const })),
    ]);
    if (budgetTid !== undefined) clearTimeout(budgetTid);
    if (winner.tag === "timeout") {
      enhanceAc.abort();
      if (parentSig) parentSig.removeEventListener("abort", onParentAbort);
      logEnhanceSkip({
        requestId: args.baseCtx.requestId,
        userId: args.baseCtx.userId,
        sessionId: args.baseCtx.sessionId,
        reason: "enhance_budget_timeout",
        score: gate.score,
      });
      return { kind: "skipped", reason: "enhance_budget_timeout", wallMs: wallMs() };
    }
    res = winner.r;
  } else {
    res = await completionP;
  }
  if (parentSig) parentSig.removeEventListener("abort", onParentAbort);

  if (!res.ok) {
    return { kind: "skipped", reason: "enhance_api_failed", wallMs: wallMs() };
  }

  commitNarrativeEnhancementBudget(args.baseCtx.sessionId);
  const out = (res.content ?? "").trim();
  if (out.length < 12) {
    return { kind: "skipped", reason: "enhance_output_too_short", wallMs: wallMs() };
  }
  if (out.startsWith("{") || out.includes('"narrative"')) {
    return { kind: "skipped", reason: "enhance_output_json_like", wallMs: wallMs() };
  }
  if (out.length > prefix.length * 1.35 + 8) {
    return { kind: "skipped", reason: "enhance_output_too_long", wallMs: wallMs() };
  }

  const merged = `${out}${suffix}`;
  if (merged.length > narrative.length * 2.2) {
    return { kind: "skipped", reason: "enhance_merged_too_long", wallMs: wallMs() };
  }

  pushAiObservability({
    requestId: args.baseCtx.requestId,
    task,
    logicalRole: res.logicalRole,
    providerId: res.providerId,
    phase: "enhance_applied",
    latencyMs: res.latencyMs,
    totalTokens: res.usage?.totalTokens ?? undefined,
    stream: false,
    cacheHit: Boolean(res.fromCache),
    userId: args.baseCtx.userId,
  });

  return { kind: "applied", dm: { ...dm, narrative: merged }, wallMs: wallMs(), usage: res.usage };
}
