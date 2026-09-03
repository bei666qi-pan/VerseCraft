// src/lib/playRealtime/controlPreflight.ts
import { pushAiObservability } from "@/lib/ai/debug/observabilityRing";
import { readPreflightPlane, writePreflightPlane } from "@/lib/ai/governance/preflightCache";
import { executeChatCompletion } from "@/lib/ai/service";
import type { AIRequestContext, ChatMessage } from "@/lib/ai/types/core";
import { buildControlContextDigest, renderControlDigestForPrompt } from "@/lib/playRealtime/controlContextDigest";
import { runDeterministicControlFastPath } from "@/lib/playRealtime/controlFastPath";
import { parseControlPlaneJson } from "@/lib/playRealtime/controlPlaneParse";
import { buildControlPreflightSystemPrompt } from "@/lib/playRealtime/controlPreflightPrompt";
import { applyControlBoundaryGuard } from "@/lib/playRealtime/controlBoundaryGuard";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

export type { ControlPreflightSource } from "@/lib/playRealtime/controlPreflightEvidence";
export { isLiveModelControlEvidence } from "@/lib/playRealtime/controlPreflightEvidence";

export type ControlPreflightResult =
  | {
      ok: true;
      control: PlayerControlPlane;
      fromCache: boolean;
      latencyMs: number;
      source: "cache" | "fast_path" | "model";
    }
  | {
      ok: false;
      error: string;
      fromCache: boolean;
      latencyMs: number;
      source: "unavailable";
    };

export async function runPlayerControlPreflight(args: {
  latestUserInput: string;
  playerContext: string;
  ruleSnapshot: PlayerRuleSnapshot;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path">;
  signal?: AbortSignal;
  /**
   * Wall-clock budget: when hit, immediately abandon preflight and treat as unavailable.
   * 0/undefined means "no extra budget beyond requestTimeoutMs".
   */
  budgetMs?: number;
  /**
   * The production default remains cache + deterministic fast path. Offline
   * evaluation can explicitly require the same model task/prompt/parser.
   */
  executionStrategy?: "prefer_fast_path" | "require_model";
}): Promise<ControlPreflightResult> {
  const requireModel = args.executionStrategy === "require_model";
  const ruleJson = JSON.stringify(args.ruleSnapshot);
  const digest = buildControlContextDigest({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleSnapshot: args.ruleSnapshot,
  });
  const cached = requireModel
    ? null
    : await readPreflightPlane({
        latestUserInput: args.latestUserInput,
        playerContext: args.playerContext,
        ruleJson,
        digest,
        ruleFlags: args.ruleSnapshot,
        userId: args.ctx.userId,
        sessionId: args.ctx.sessionId,
      });
  if (cached) {
    pushAiObservability({
      requestId: args.ctx.requestId,
      task: "PLAYER_CONTROL_PREFLIGHT",
      phase: "preflight_cache_hit",
      latencyMs: 0,
      cacheHit: true,
      stream: false,
      userId: args.ctx.userId,
    });
    return { ok: true, control: cached, fromCache: true, latencyMs: 0, source: "cache" };
  }

  // Deterministic fast path: only for short, explicit action inputs.
  // Important: must be conservative — ambiguous inputs should fall through to LLM preflight.
  if (!requireModel) {
    try {
      const fast = runDeterministicControlFastPath({
        latestUserInput: args.latestUserInput,
        ruleSnapshot: args.ruleSnapshot,
        locationHint: null,
      });
      if (fast.hit) {
        pushAiObservability({
          requestId: args.ctx.requestId,
          task: "PLAYER_CONTROL_PREFLIGHT",
          phase: "preflight_fastpath_hit",
          latencyMs: 0,
          cacheHit: false,
          stream: false,
          userId: args.ctx.userId,
        });
        void writePreflightPlane({
          latestUserInput: args.latestUserInput,
          playerContext: args.playerContext,
          ruleJson,
          digest,
          ruleFlags: args.ruleSnapshot,
          userId: args.ctx.userId,
          sessionId: args.ctx.sessionId,
          control: fast.control,
        }).catch(() => {});
        return { ok: true, control: fast.control, fromCache: false, latencyMs: 0, source: "fast_path" };
      }
    } catch {
      // Never block or throw from fast path; fall through to LLM.
    }
  }

  const userPayload = renderControlDigestForPrompt(digest);

  const messages: ChatMessage[] = [
    { role: "system", content: buildControlPreflightSystemPrompt(false) },
    { role: "user", content: userPayload },
  ];

  const budgetMsRaw = args.budgetMs ?? 0;
  const budgetMs = Number.isFinite(budgetMsRaw) ? Math.max(0, Math.trunc(budgetMsRaw)) : 0;
  const requestTimeoutMs = budgetMs > 0 ? Math.min(11_000, budgetMs) : 11_000;
  const preflightAc = new AbortController();
  const onParentAbort = () => preflightAc.abort();
  if (args.signal) {
    if (args.signal.aborted) preflightAc.abort();
    else args.signal.addEventListener("abort", onParentAbort, { once: true });
  }
  const localBudgetTid =
    budgetMs > 0 ? setTimeout(() => preflightAc.abort(), budgetMs) : null;

  let res: Awaited<ReturnType<typeof executeChatCompletion>>;
  try {
    res = await executeChatCompletion({
      task: "PLAYER_CONTROL_PREFLIGHT",
      messages,
      ctx: {
        requestId: args.ctx.requestId,
        task: "PLAYER_CONTROL_PREFLIGHT",
        userId: args.ctx.userId,
        sessionId: args.ctx.sessionId,
        path: args.ctx.path ?? "/api/chat",
      },
      signal: preflightAc.signal,
      requestTimeoutMs,
      skipCache: requireModel,
    });
  } catch {
    return {
      ok: false,
      error: "control_preflight_failed",
      fromCache: false,
      latencyMs: budgetMs > 0 ? budgetMs : 0,
      source: "unavailable",
    };
  } finally {
    if (localBudgetTid) clearTimeout(localBudgetTid);
    if (args.signal) {
      try {
        args.signal.removeEventListener("abort", onParentAbort);
      } catch {
        // ignore
      }
    }
  }

  if (!res.ok) {
    const lat = res.latencyMs;
    return {
      ok: false,
      error: res.message ?? "control_preflight_failed",
      fromCache: false,
      latencyMs: lat != null && Number.isFinite(lat) ? Math.max(0, Math.trunc(lat)) : 0,
      source: "unavailable",
    };
  }

  const apiLatency =
    res.latencyMs != null && Number.isFinite(res.latencyMs)
      ? Math.max(0, Math.trunc(res.latencyMs))
      : 0;

  const raw = (res.content ?? "").trim();
  if (!raw) {
    return { ok: false, error: "control_empty", fromCache: false, latencyMs: apiLatency, source: "unavailable" };
  }
  // Parse is conservative: it rejects <think> pollution and prose-wrapped JSON.
  const parsedControl = parseControlPlaneJson(raw);
  if (!parsedControl) {
    return { ok: false, error: "control_parse_failed", fromCache: false, latencyMs: apiLatency, source: "unavailable" };
  }
  const control = applyControlBoundaryGuard({ latestUserInput: args.latestUserInput, control: parsedControl });

  // Enhancement model calls no longer exist; preserve the wire fields as false.
  control.enhance_scene = false;
  control.enhance_npc_emotion = false;

  void writePreflightPlane({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleJson,
    digest,
    ruleFlags: args.ruleSnapshot,
    userId: args.ctx.userId,
    sessionId: args.ctx.sessionId,
    control,
  }).catch(() => {});

  return { ok: true, control, fromCache: false, latencyMs: apiLatency, source: "model" };
}
