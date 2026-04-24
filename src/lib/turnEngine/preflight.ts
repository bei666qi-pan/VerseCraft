import { parsePlayerIntent } from "@/lib/ai/logicalTasks";
import type { OperationMode } from "@/lib/ai/degrade/modeCore";
import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import { classifyChatRiskLane } from "@/lib/security/chatRiskLane";
import type { PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import type { ChatPerfFlags, ControlPreflightStageResult, RiskLane, TurnPreflightMetrics } from "@/lib/turnEngine/types";

export function createDefaultPreflightMetrics(): TurnPreflightMetrics {
  return {
    ran: false,
    skippedReason: null,
    cacheHit: null,
    latencyMs: null,
    ok: false,
    budgetHit: false,
  };
}

export function resolveRiskLane(args: {
  perfFlags: ChatPerfFlags;
  latestUserInput: string;
  classifyChatRiskLaneImpl?: typeof classifyChatRiskLane;
}): { lane: RiskLane; reasons: readonly string[] } {
  if (!args.perfFlags.enableRiskLaneSplit) {
    return { lane: "slow", reasons: ["multi_clause_complex_action"] };
  }
  return args.classifyChatRiskLaneImpl?.(args.latestUserInput) ?? classifyChatRiskLane(args.latestUserInput);
}

export async function runControlPreflightStage(args: {
  perfFlags: ChatPerfFlags;
  riskLane: RiskLane;
  sessionId: string;
  latestUserInput: string;
  playerContext: string;
  pipelineRule: PlayerRuleSnapshot;
  requestId: string;
  userId: string | null;
  controlPreflightBudgetMs: number;
  parsePlayerIntentImpl?: typeof parsePlayerIntent;
  allowControlPreflightForSessionImpl: (sessionId: string | null | undefined) => boolean;
  resolveOperationModeImpl: () => OperationMode;
  logAiTelemetryImpl?: typeof logAiTelemetry;
}): Promise<ControlPreflightStageResult> {
  const parsePlayerIntentFn = args.parsePlayerIntentImpl ?? parsePlayerIntent;
  const logAiTelemetryFn = args.logAiTelemetryImpl ?? logAiTelemetry;

  if (args.perfFlags.enableLightweightFastPath && args.riskLane === "fast") {
    return {
      pipelineControl: null,
      pipelinePreflightFailed: true,
      controlPreflightBudgetHit: false,
      preflightTurnMetrics: {
        ran: false,
        skippedReason: "fast_lane",
        cacheHit: null,
        latencyMs: 0,
        ok: false,
        budgetHit: false,
      },
    };
  }

  if (args.resolveOperationModeImpl() === "emergency") {
    return {
      pipelineControl: null,
      pipelinePreflightFailed: true,
      controlPreflightBudgetHit: false,
      preflightTurnMetrics: {
        ran: false,
        skippedReason: "emergency",
        cacheHit: null,
        latencyMs: null,
        ok: false,
        budgetHit: false,
      },
    };
  }

  if (!args.allowControlPreflightForSessionImpl(args.sessionId)) {
    return {
      pipelineControl: null,
      pipelinePreflightFailed: true,
      controlPreflightBudgetHit: false,
      preflightTurnMetrics: {
        ran: false,
        skippedReason: "session_budget",
        cacheHit: null,
        latencyMs: null,
        ok: false,
        budgetHit: false,
      },
    };
  }

  const hardAc = new AbortController();
  const hardTimer = setTimeout(() => hardAc.abort(), 11_000);
  const wallStart = Date.now();
  let controlPreflightBudgetHit = false;

  try {
    const pfPromise = parsePlayerIntentFn({
      latestUserInput: args.latestUserInput,
      playerContext: args.playerContext,
      ruleSnapshot: args.pipelineRule,
      ctx: { requestId: args.requestId, userId: args.userId, sessionId: args.sessionId, path: "/api/chat" },
      signal: hardAc.signal,
      budgetMs: args.controlPreflightBudgetMs > 0 ? Math.min(args.controlPreflightBudgetMs, 10_000) : 0,
    });

    if (args.controlPreflightBudgetMs > 0) {
      let budgetTid: ReturnType<typeof setTimeout> | undefined;
      const budgetPromise = new Promise<"budget">((resolve) => {
        budgetTid = setTimeout(() => resolve("budget"), args.controlPreflightBudgetMs);
      });
      const winner = await Promise.race([
        pfPromise.then((result) => ({ tag: "pf" as const, result })),
        budgetPromise.then(() => ({ tag: "budget" as const })),
      ]);
      if (budgetTid !== undefined) clearTimeout(budgetTid);

      if (winner.tag === "budget") {
        hardAc.abort();
        controlPreflightBudgetHit = true;
        logAiTelemetryFn({
          requestId: args.requestId,
          task: "PLAYER_CONTROL_PREFLIGHT",
          providerId: "oneapi",
          logicalRole: "control",
          phase: "preflight_budget",
          message: `budget_ms=${args.controlPreflightBudgetMs}`,
          userId: args.userId ?? undefined,
        });
        return {
          pipelineControl: null,
          pipelinePreflightFailed: true,
          controlPreflightBudgetHit,
          preflightTurnMetrics: {
            ran: true,
            skippedReason: null,
            cacheHit: false,
            latencyMs: Math.max(0, Date.now() - wallStart),
            ok: false,
            budgetHit: true,
          },
        };
      }

      return {
        pipelineControl: winner.result.ok ? winner.result.control : null,
        pipelinePreflightFailed: !winner.result.ok,
        controlPreflightBudgetHit,
        preflightTurnMetrics: {
          ran: true,
          skippedReason: null,
          cacheHit: winner.result.fromCache,
          latencyMs: winner.result.latencyMs,
          ok: winner.result.ok,
          budgetHit: false,
        },
      };
    }

    const result = await pfPromise;
    return {
      pipelineControl: result.ok ? result.control : null,
      pipelinePreflightFailed: !result.ok,
      controlPreflightBudgetHit,
      preflightTurnMetrics: {
        ran: true,
        skippedReason: null,
        cacheHit: result.fromCache,
        latencyMs: result.latencyMs,
        ok: result.ok,
        budgetHit: false,
      },
    };
  } catch (error) {
    console.warn("[api/chat] control preflight failed", error);
    return {
      pipelineControl: null,
      pipelinePreflightFailed: true,
      controlPreflightBudgetHit,
      preflightTurnMetrics: {
        ran: true,
        skippedReason: null,
        cacheHit: false,
        latencyMs: Math.max(0, Date.now() - wallStart),
        ok: false,
        budgetHit: false,
      },
    };
  } finally {
    clearTimeout(hardTimer);
  }
}
