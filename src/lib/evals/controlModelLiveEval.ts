// Offline eval entrypoint: intentionally bypasses production cache/fast path while
// preserving the PLAYER_CONTROL_PREFLIGHT task, prompt, digest, parser and gateway.
// eslint-disable-next-line no-restricted-imports
import { executeChatCompletion } from "@/lib/ai/router/execute";
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import { buildControlContextDigest, renderControlDigestForPrompt } from "@/lib/playRealtime/controlContextDigest";
import { parseControlPlaneJson } from "@/lib/playRealtime/controlPlaneParse";
import { buildControlPreflightSystemPrompt } from "@/lib/playRealtime/controlPreflightPrompt";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

export type LiveControlModelEvalResult =
  | { ok: true; source: "model"; control: PlayerControlPlane; latencyMs: number; model?: string }
  | { ok: false; source: "unavailable"; error: "gateway_error" | "empty" | "parse_failed"; detail?: string; latencyMs: number };

export async function evaluateControlWithLiveModel(args: {
  latestUserInput: string;
  playerContext: string;
  ruleSnapshot: PlayerRuleSnapshot;
  requestId: string;
  sessionId: string;
  timeoutMs: number;
}): Promise<LiveControlModelEvalResult> {
  const digest = buildControlContextDigest({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleSnapshot: args.ruleSnapshot,
  });
  const response = await executeChatCompletion({
    task: "PLAYER_CONTROL_PREFLIGHT",
    messages: [
      { role: "system", content: buildControlPreflightSystemPrompt(resolveAiEnv().enableNarrativeEnhancement) },
      { role: "user", content: renderControlDigestForPrompt(digest) },
    ],
    ctx: { requestId: args.requestId, task: "PLAYER_CONTROL_PREFLIGHT", sessionId: args.sessionId, path: "/eval/intent-grounded" },
    requestTimeoutMs: args.timeoutMs,
    skipCache: true,
  });
  const latencyMs = response.latencyMs != null && Number.isFinite(response.latencyMs) ? Math.max(0, Math.trunc(response.latencyMs)) : 0;
  if (!response.ok) {
    const lastFailure = response.routing?.lastFailureSummary ?? "unknown";
    return {
      ok: false,
      source: "unavailable",
      error: "gateway_error",
      detail: `${response.code}:${response.message ?? "unknown"}:${lastFailure}`.slice(0, 300),
      latencyMs,
    };
  }
  if (!response.content.trim()) return { ok: false, source: "unavailable", error: "empty", latencyMs };
  const control = parseControlPlaneJson(response.content);
  if (!control) return { ok: false, source: "unavailable", error: "parse_failed", latencyMs };
  if (!resolveAiEnv().enableNarrativeEnhancement) {
    control.enhance_scene = false;
    control.enhance_npc_emotion = false;
  }
  return {
    ok: true,
    source: "model",
    control,
    latencyMs,
    model: response.routing?.attempts.findLast((attempt) => Boolean(attempt.gatewayModel))?.gatewayModel,
  };
}
