// src/app/api/chat/route.ts
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "../../../../auth";
import { db } from "@/db";
import { users, gameSessionMemory } from "@/db/schema";
import { compressMemory } from "@/lib/memoryCompress";
import { checkQuota, incrementQuota, estimateTokensFromInput } from "@/lib/quota";
import { markUserActive } from "@/lib/presence";
import { getUtcDateKey, recordDailyTokenUsage } from "@/lib/adminDailyMetrics";
import { derivePlatformFromUserAgent } from "@/lib/analytics/dateKeys";
import type { AnalyticsPlatform } from "@/lib/analytics/types";
import {
  buildChatRequestFinishedPayload,
  toEnhanceTurnMetrics,
} from "@/lib/analytics/chatRequestFinishedPayload";
import { recordChatActionCompletedAnalytics, recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { DEFAULT_PLAYER_ROLE_CHAIN, resolveAiEnv } from "@/lib/ai/config/env";
import { allowControlPreflightForSession } from "@/lib/ai/governance/sessionBudget";
import { resolveOperationMode } from "@/lib/ai/degrade/mode";
import { pushAiRoutingReport } from "@/lib/ai/debug/routingRing";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { PlayerChatStreamSuccess, PlayerChatStreamResult } from "@/lib/ai/router/execute";
import type { AiRoutingReport } from "@/lib/ai/routing/types";
import { anyAiProviderConfigured, sanitizeMessagesForUpstream } from "@/lib/ai/service";
import {
  enhanceScene,
  generateMainReply,
  parsePlayerIntent,
  type EnhanceAfterMainStreamResult,
} from "@/lib/ai/logicalTasks";
import { buildControlAugmentationBlock } from "@/lib/playRealtime/augmentation";
import {
  buildDynamicPlayerDmSystemSuffix,
  buildMemoryBlock,
  composePlayerChatSystemMessages,
  getStablePlayerDmSystemPrefix,
} from "@/lib/playRealtime/playerChatSystemPrompt";
import { getRuntimeLore } from "@/lib/worldKnowledge/runtime/getRuntimeLore";
import { persistTurnFacts } from "@/lib/worldKnowledge/ingestion/persistTurnFacts";
import {
  normalizePlayerDmJson,
  parseAccumulatedPlayerDmJson,
} from "@/lib/playRealtime/normalizePlayerDmJson";
import { buildRuleSnapshot } from "@/lib/playRealtime/ruleSnapshot";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import {
  loadVerseCraftEnvFilesOnce,
  reloadVerseCraftProcessEnv,
  resolveVerseCraftProjectRoot,
} from "@/lib/config/loadVerseCraftEnv";
import { isKgLayerEnabled } from "@/lib/config/kgEnv";
import { validateChatRequest } from "@/lib/security/chatValidation";
import { createRequestId, getClientIpFromHeaders } from "@/lib/security/helpers";
import { finalOutputModeration, postModelModeration, preInputModeration } from "@/lib/security/contentSafety";
import { safeBlockedDmJson } from "@/lib/security/policy";
import { checkRiskControl, recordHighRisk } from "@/lib/security/riskControl";
import { writeAuditTrail } from "@/lib/security/auditTrail";
import { normalizeUsage } from "@/lib/ai/stream/openaiLike";
import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import type { TokenUsage } from "@/lib/ai/types/core";
import { isGlobalCacheSafe } from "@/lib/kg/cacheGate";
import { embedText } from "@/lib/kg/embed";
import { ingestUserKnowledge } from "@/lib/kg/ingest";
import { normalizeForHash, sha256Hex } from "@/lib/kg/normalize";
import { routeUserInput, type RouteResult } from "@/lib/kg/routing";
import { getWorldRevision, putSemanticCache, touchSemanticCacheHit, tryGetSemanticCache } from "@/lib/kg/semanticCache";
import { detectWorldEngineTriggers } from "@/lib/worldEngine/contracts";
import { enqueueWorldEngineTick } from "@/lib/worldEngine/queue";
import {
  applyB1SafetyGuard,
  buildB1ServiceContextBlock,
  guessPlayerLocationFromContext,
} from "@/lib/playRealtime/b1Safety";
import { applyB1ServiceExecutionGuard } from "@/lib/playRealtime/serviceExecution";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import {
  applyNpcProactiveGrantGuard,
  buildNpcGrantFallbackNarrativeBlock,
  buildNpcProactiveGrantNarrativeBlock,
  normalizeDmTaskPayload,
} from "@/lib/tasks/taskV2";
import { build7FConspiracyNarrativeBlock, ensure7FConspiracyTask } from "@/lib/revive/conspiracy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUNDS_THRESHOLD = 10;
const SHORT_TERM_ROUNDS = 5;

/** 从 one-api / OpenAI 形态 JSON 错误体提取简短说明（不含密钥）。 */
function parseUpstreamErrorFields(lastBodySnippet: string | undefined): {
  upstreamHint?: string;
  upstreamCode?: string;
} {
  if (!lastBodySnippet?.trim()) return {};
  try {
    const j = JSON.parse(lastBodySnippet) as {
      error?: { message?: string; code?: string };
    };
    const message = j.error?.message?.trim();
    const code = j.error?.code?.trim();
    if (message || code) {
      return {
        ...(message ? { upstreamHint: message.slice(0, 500) } : {}),
        ...(code ? { upstreamCode: code.slice(0, 128) } : {}),
      };
    }
  } catch {
    /* 非 JSON 时退回纯文本前缀 */
  }
  return { upstreamHint: lastBodySnippet.slice(0, 280) };
}

/**
 * Encode one SSE event. Payload may contain literal newlines (e.g. streamed JSON); a single `data: ...`
 * line would break framing — use one `data:` line per LF-separated segment (WHATWG SSE).
 */
function encodeSseEventPayload(data: string): string {
  const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const fields = lines.map((line) => `data: ${line}`);
  return `${fields.join("\n")}\n\n`;
}

function sse(data: string): Uint8Array {
  return new TextEncoder().encode(encodeSseEventPayload(data));
}

function sseText(data: string): string {
  return encodeSseEventPayload(data);
}

function isLikelyValidDMJson(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return typeof parsed?.narrative === "string";
  } catch {
    return false;
  }
}

function sanitizeAssistantContent(content: string): string {
  if (isLikelyValidDMJson(content)) return content;
  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: content.slice(0, 500),
    is_death: false,
    consumes_time: true,
  });
}

const ENTITY_CODE_RE = /\b([NA]-\d{3})\b/gi;

function extractRecentEntities(latestUserInput: string): string[] {
  const out = new Set<string>();
  for (const m of latestUserInput.matchAll(ENTITY_CODE_RE)) out.add(m[1].toUpperCase());
  return [...out];
}

type SessionMemoryRow = {
  plot_summary: string;
  player_status: Record<string, unknown>;
  npc_relationships: Record<string, unknown>;
};

async function loadSessionMemoryForUser(userId: string): Promise<SessionMemoryRow | null> {
  try {
    const memRows = await db
      .select({
        plotSummary: gameSessionMemory.plotSummary,
        playerStatus: gameSessionMemory.playerStatus,
        npcRelationships: gameSessionMemory.npcRelationships,
      })
      .from(gameSessionMemory)
      .where(eq(gameSessionMemory.userId, userId))
      .limit(1);
    const mr = memRows[0];
    if (mr?.plotSummary) {
      return {
        plot_summary: String(mr.plotSummary),
        player_status: (mr.playerStatus as Record<string, unknown>) ?? {},
        npc_relationships: (mr.npcRelationships as Record<string, unknown>) ?? {},
      };
    }
    return null;
  } catch (error) {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/chat] failed to load session memory\x1b[0m`,
      { userId, message: err?.message, cause, stack: err?.stack, error }
    );
    return null;
  }
}

const PLAY_TIME_PER_ACTION_SEC = 3600; // 1 game hour per chat action

async function persistTokenUsage(userId: string | null, totalTokens: number) {
  if (!userId || !Number.isFinite(totalTokens) || totalTokens <= 0) return;
  const tokenDelta = Math.trunc(totalTokens);

  try {
    await db
      .update(users)
      .set({
        tokensUsed: sql`COALESCE(${users.tokensUsed}, 0) + ${tokenDelta}`,
        todayTokensUsed: sql`CASE
          WHEN DATE(COALESCE(${users.lastDataReset}, NOW())) = CURRENT_DATE
          THEN COALESCE(${users.todayTokensUsed}, 0) + ${tokenDelta}
          ELSE ${tokenDelta}
        END`,
        playTime: sql`COALESCE(${users.playTime}, 0) + ${PLAY_TIME_PER_ACTION_SEC}`,
        todayPlayTime: sql`CASE
          WHEN DATE(COALESCE(${users.lastDataReset}, NOW())) = CURRENT_DATE
          THEN COALESCE(${users.todayPlayTime}, 0) + ${PLAY_TIME_PER_ACTION_SEC}
          ELSE ${PLAY_TIME_PER_ACTION_SEC}
        END`,
        lastDataReset: sql`CASE
          WHEN DATE(COALESCE(${users.lastDataReset}, NOW())) = CURRENT_DATE
          THEN ${users.lastDataReset}
          ELSE NOW()
        END`,
        lastActive: new Date(),
      })
      .where(eq(users.id, userId));

    // Best-effort telemetry for admin charts.
    // Do not await to avoid impacting /api/chat latency.
    void recordDailyTokenUsage(getUtcDateKey(), tokenDelta, PLAY_TIME_PER_ACTION_SEC).catch(() => {});
  } catch (error) {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/chat] persistTokenUsage failed\x1b[0m`,
      { userId, tokenDelta, message: err?.message, cause, stack: err?.stack, error }
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Merge `.env.local` from the real package root (cwd can differ from app root under some launchers).
  loadVerseCraftEnvFilesOnce();

  const validated = validateChatRequest(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const messages = validated.messages;
  const playerContext = validated.playerContext;
  const latestUserInput = validated.latestUserInput;
  const sessionId = validated.sessionId;
  const clientIp = getClientIpFromHeaders(req.headers);
  const requestId = createRequestId("chat");
  const platform = derivePlatformFromUserAgent(req.headers.get("user-agent"));
  const requestStartedAt = Date.now();

  const isFirstAction = !messages.some((m) => m.role === "assistant");
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const riskControl = checkRiskControl({ ip: clientIp, sessionId, userId });
  if (!riskControl.ok) {
    writeAuditTrail({
      requestId,
      sessionId,
      userId,
      ip: clientIp,
      stage: "risk_control",
      riskLevel: riskControl.level,
      action: "block",
      rateLimited: true,
      triggeredRule: riskControl.reason,
      summary: "blocked_before_model",
    });
    return new Response(
      sseText(
        safeBlockedDmJson("当前请求过于频繁或风险过高，请稍后再试。", {
          action: "block",
          stage: "risk_control",
          riskLevel: riskControl.level,
          requestId,
          reason: riskControl.reason,
        })
      ),
      {
        status: 429,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  }

  const preCheck = await preInputModeration({
    input: `${latestUserInput}\n${playerContext}`,
    userId,
    ip: clientIp,
    path: "/api/chat",
    requestId,
  });
  writeAuditTrail({
    requestId,
    sessionId,
    userId,
    ip: clientIp,
    stage: "pre_input",
    riskLevel: preCheck.result.severity === "high" || preCheck.result.severity === "critical" ? "gray" : "normal",
    action: preCheck.policy.blocked ? "degrade" : preCheck.result.decision === "review" ? "review" : "allow",
    triggeredRule: preCheck.result.reason,
    provider: preCheck.provider,
    summary: preCheck.result.categories.join(","),
  });
  if (preCheck.policy.blocked) {
    recordHighRisk({ ip: clientIp, sessionId, userId }, preCheck.result.reason);
    return new Response(
      sseText(
        safeBlockedDmJson(preCheck.policy.userMessage, {
          action: "degrade",
          stage: "pre_input",
          riskLevel: "gray",
          requestId,
          reason: preCheck.result.reason,
        })
      ),
      {
      status: preCheck.policy.statusCode,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const kgEnabled = isKgLayerEnabled();
  const kgRoute = routeUserInput(latestUserInput);
  if (kgEnabled) {
    void ingestUserKnowledge({ userId, latestUserInput, route: kgRoute });
  }

  // Overlap session-memory DB read with local chat message shaping (stable prefix + raw slice + dice).
  const sessionMemoryPromise: Promise<SessionMemoryRow | null> =
    !isFirstAction && userId ? loadSessionMemoryForUser(userId) : Promise.resolve(null);

  const playerDmStablePrefix = getStablePlayerDmSystemPrefix();

  const rawChatMessages = messages
    .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
    .map((m) => {
      const content =
        m.role === "assistant" ? sanitizeAssistantContent(m.content) : m.content;
      return { role: m.role, content } as { role: string; content: string };
    });

  const lastUserIdx = rawChatMessages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx >= 0) {
    const rawAction = String(rawChatMessages[lastUserIdx]!.content ?? "").trim();
    const dice = randomInt(1, 101);
    rawChatMessages[lastUserIdx] = {
      role: "user",
      content: `【系统暗骰：本次行动检定值为 ${dice}/100 (1为大成功，100为大失败)】\n玩家行动：${rawAction}`,
    };
  }

  const chatMsgs = rawChatMessages;
  const totalRounds = Math.floor((chatMsgs.length - 1) / 2);
  let messagesToSend = rawChatMessages;

  if (totalRounds > ROUNDS_THRESHOLD && userId) {
    const keepCount = SHORT_TERM_ROUNDS * 2 + 1;
    messagesToSend = chatMsgs.slice(-keepCount);
  }

  const sessionMemory: SessionMemoryRow | null = await sessionMemoryPromise;
  const memoryBlock = buildMemoryBlock(sessionMemory);
  const dynamicCoreForQuota = buildDynamicPlayerDmSystemSuffix({
    memoryBlock,
    playerContext,
    isFirstAction,
    runtimePackets: "",
    controlAugmentation: "",
  });
  const systemPromptForQuota = `${playerDmStablePrefix}\n\n${dynamicCoreForQuota}`;

  if (userId) {
    try {
      const estimated = estimateTokensFromInput(systemPromptForQuota, messages);
      const quotaResult = await checkQuota(userId, estimated);
      if (!quotaResult.ok) {
        const msg =
          quotaResult.reason === "banned"
            ? "账号已被封禁，无法继续使用本平台。"
            : quotaResult.reason === "token_limit"
              ? "今日 Token 配额已用尽，请明天再试。"
              : "今日动作次数已达上限，请明天再试。";
        return new Response(
          sseText(
            JSON.stringify({
              is_action_legal: false,
              sanity_damage: 0,
              narrative: msg,
              is_death: false,
              consumes_time: true,
            })
          ),
          {
            status: quotaResult.reason === "banned" ? 403 : 429,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            },
          }
        );
      }
    } catch (quotaErr) {
      console.error("[api/chat] quota check failed, proceeding without quota", quotaErr);
    }
  }

  if (totalRounds > ROUNDS_THRESHOLD && userId) {
    const keepCount = SHORT_TERM_ROUNDS * 2 + 1;
    const toCompressCount = 5 * 2;
    const shortTerm = chatMsgs.slice(-keepCount);
    const toCompress = chatMsgs.slice(-keepCount - toCompressCount, -keepCount);

    void (async () => {
      try {
        const newMem = await compressMemory(sessionMemory, toCompress);
        if (newMem && userId) {
          await db
            .insert(gameSessionMemory)
            .values({
              userId,
              plotSummary: newMem.plot_summary,
              playerStatus: newMem.player_status,
              npcRelationships: newMem.npc_relationships,
            })
            .onConflictDoUpdate({
              target: gameSessionMemory.userId,
              set: {
                plotSummary: newMem.plot_summary,
                playerStatus: newMem.player_status,
                npcRelationships: newMem.npc_relationships,
              },
            });
        }
      } catch (e) {
        console.error("[api/chat] async memory compress failed", e);
      }
    })();
  }

  // Update lastActive and presence so admin can see online users
  if (userId) {
    void db.update(users).set({ lastActive: new Date() }).where(eq(users.id, userId)).catch(() => {});
    void markUserActive(userId).catch(() => {});
  }

  const pipelineRule = buildRuleSnapshot(playerContext, latestUserInput);
  let pipelineControl: PlayerControlPlane | null = null;
  let pipelinePreflightFailed = true;
  let controlPreflightBudgetHit = false;

  let preflightTurnMetrics: {
    ran: boolean;
    skippedReason: string | null;
    cacheHit: boolean | null;
    latencyMs: number | null;
    ok: boolean;
    budgetHit: boolean;
  } = {
    ran: false,
    skippedReason: null,
    cacheHit: null,
    latencyMs: null,
    ok: false,
    budgetHit: false,
  };

  const deleteSessionMemoryP =
    isFirstAction && userId
      ? db.delete(gameSessionMemory).where(eq(gameSessionMemory.userId, userId)).catch(() => {})
      : Promise.resolve();

  const preflightEnv = resolveAiEnv();
  const runControlPreflightP = (async (): Promise<void> => {
    if (resolveOperationMode() === "emergency") {
      preflightTurnMetrics = {
        ran: false,
        skippedReason: "emergency",
        cacheHit: null,
        latencyMs: null,
        ok: false,
        budgetHit: false,
      };
      return;
    }
    if (!allowControlPreflightForSession(sessionId)) {
      preflightTurnMetrics = {
        ran: false,
        skippedReason: "session_budget",
        cacheHit: null,
        latencyMs: null,
        ok: false,
        budgetHit: false,
      };
      return;
    }

    const hardAc = new AbortController();
    const hardTimer = setTimeout(() => hardAc.abort(), 11_000);
    const budgetMs = preflightEnv.controlPreflightBudgetMs;
    const pfWallStart = Date.now();

    try {
      preflightTurnMetrics = {
        ran: true,
        skippedReason: null,
        cacheHit: null,
        latencyMs: null,
        ok: false,
        budgetHit: false,
      };

      const pfPromise = parsePlayerIntent({
        latestUserInput,
        playerContext,
        ruleSnapshot: pipelineRule,
        ctx: { requestId, userId, sessionId, path: "/api/chat" },
        signal: hardAc.signal,
      });

      if (budgetMs > 0) {
        let budgetTid: ReturnType<typeof setTimeout> | undefined;
        const budgetPromise = new Promise<"budget">((resolve) => {
          budgetTid = setTimeout(() => resolve("budget"), budgetMs);
        });
        const winner = await Promise.race([
          pfPromise.then((r) => ({ tag: "pf" as const, r })),
          budgetPromise.then(() => ({ tag: "budget" as const })),
        ]);
        if (budgetTid !== undefined) clearTimeout(budgetTid);

        if (winner.tag === "budget") {
          hardAc.abort();
          controlPreflightBudgetHit = true;
          preflightTurnMetrics = {
            ran: true,
            skippedReason: null,
            cacheHit: false,
            latencyMs: Math.max(0, Date.now() - pfWallStart),
            ok: false,
            budgetHit: true,
          };
          logAiTelemetry({
            requestId,
            task: "PLAYER_CONTROL_PREFLIGHT",
            providerId: "oneapi",
            logicalRole: "control",
            phase: "preflight_budget",
            message: `budget_ms=${budgetMs}`,
            userId,
          });
        } else if (winner.r.ok) {
          pipelineControl = winner.r.control;
          pipelinePreflightFailed = false;
          preflightTurnMetrics = {
            ran: true,
            skippedReason: null,
            cacheHit: winner.r.fromCache,
            latencyMs: winner.r.latencyMs,
            ok: true,
            budgetHit: false,
          };
        } else {
          preflightTurnMetrics = {
            ran: true,
            skippedReason: null,
            cacheHit: winner.r.fromCache,
            latencyMs: winner.r.latencyMs,
            ok: false,
            budgetHit: false,
          };
        }
      } else {
        const pf = await pfPromise;
        if (pf.ok) {
          pipelineControl = pf.control;
          pipelinePreflightFailed = false;
          preflightTurnMetrics = {
            ran: true,
            skippedReason: null,
            cacheHit: pf.fromCache,
            latencyMs: pf.latencyMs,
            ok: true,
            budgetHit: false,
          };
        } else {
          preflightTurnMetrics = {
            ran: true,
            skippedReason: null,
            cacheHit: pf.fromCache,
            latencyMs: pf.latencyMs,
            ok: false,
            budgetHit: false,
          };
        }
      }
    } catch (e) {
      console.warn("[api/chat] control preflight failed", e);
      preflightTurnMetrics = {
        ran: true,
        skippedReason: null,
        cacheHit: false,
        latencyMs: Math.max(0, Date.now() - pfWallStart),
        ok: false,
        budgetHit: false,
      };
    } finally {
      clearTimeout(hardTimer);
    }
  })();

  let runtimeLoreCompact = "";
  let loreRetrievalLatencyMs = 0;
  let loreCacheHit = false;
  let loreSourceCount = 0;
  let loreTokenEstimate = 0;
  let loreFallbackPath: "none" | "db_partial" | "registry" = "none";
  let loreBudgetHit = false;
  let lorePacketChars = 0;
  let runtimePacketChars = 0;
  let runtimePacketTokenEstimate = 0;
  let retrievalSourceCounts: Record<string, number> = {};
  let retrievalScopeCounts: Record<string, number> = {};
  let privateFactHitCount = 0;

  const loreRetrievalP = (async (): Promise<void> => {
    try {
      const loreT0 = Date.now();
      const loreBudgetMs = preflightEnv.loreRetrievalBudgetMs;
      const lorePromise = getRuntimeLore({
        latestUserInput,
        userId,
        sessionId: sessionId ?? null,
        worldRevision: BigInt(0),
        playerLocation: guessPlayerLocationFromContext(playerContext),
        recentlyEncounteredEntities: extractRecentEntities(latestUserInput),
        taskType: "PLAYER_CHAT",
        tokenBudget: 420,
        worldScope: ["core", "shared", "user", "session"],
      });
      const runtimeLore =
        loreBudgetMs > 0
          ? await Promise.race([
              lorePromise,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), loreBudgetMs)),
            ])
          : await lorePromise;
      loreRetrievalLatencyMs = Math.max(0, Date.now() - loreT0);
      if (!runtimeLore) {
        loreBudgetHit = true;
        loreFallbackPath = "registry";
        logAiTelemetry({
          requestId,
          task: "PLAYER_CHAT",
          providerId: "oneapi",
          logicalRole: "control",
          phase: "preflight_budget",
          latencyMs: loreRetrievalLatencyMs,
          message: `lore_budget_hit budget_ms=${loreBudgetMs}`,
          userId,
          retrievalLatencyMs: loreRetrievalLatencyMs,
          retrievalCacheHit: false,
          fallbackRegistryUsed: true,
        });
        return;
      }
      runtimeLoreCompact = runtimeLore.compactPromptText;
      lorePacketChars = runtimeLoreCompact.length;
      loreCacheHit = runtimeLore.debugMeta.cache.level0MemoHit || runtimeLore.debugMeta.cache.redisHit;
      loreSourceCount = runtimeLore.retrievedFacts.length;
      loreTokenEstimate = Math.ceil(runtimeLoreCompact.length / 4);
      retrievalSourceCounts = runtimeLore.debugMeta.hitSources.reduce<Record<string, number>>((acc, src) => {
        acc[src] = (acc[src] ?? 0) + 1;
        return acc;
      }, {});
      retrievalScopeCounts = runtimeLore.retrievedFacts.reduce<Record<string, number>>((acc, fact) => {
        const key = fact.layer;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      privateFactHitCount = runtimeLore.retrievedFacts.filter((f) => f.layer === "user_private_lore").length;
      if ((runtimeLore.debugMeta.trimReason ?? "").startsWith("registry_fallback")) {
        loreFallbackPath = "registry";
      } else if (runtimeLore.debugMeta.trimmedByBudget) {
        loreFallbackPath = "db_partial";
      }
      logAiTelemetry({
        requestId,
        task: "PLAYER_CHAT",
        providerId: "oneapi",
        logicalRole: "control",
        phase: "preflight_budget",
        latencyMs: loreRetrievalLatencyMs,
        cacheHit: loreCacheHit,
        message: `lore_retrieval sources=${loreSourceCount} fallback=${loreFallbackPath}`,
        userId,
        retrievalLatencyMs: loreRetrievalLatencyMs,
        retrievalCacheHit: loreCacheHit,
        retrievalSourceCounts,
        retrievalScopeCounts,
        lorePacketChars,
        lorePacketTokenEstimate: loreTokenEstimate,
        fallbackRegistryUsed: loreFallbackPath === "registry",
        privateFactHitCount,
      });
    } catch (e) {
      console.warn("[api/chat] world knowledge runtime lore skipped", e);
      loreFallbackPath = "registry";
    }
  })();

  await Promise.all([deleteSessionMemoryP, runControlPreflightP, loreRetrievalP]);

  const controlAugmentation = buildControlAugmentationBlock({
    control: pipelineControl,
    rule: pipelineRule,
    preflightFailed: pipelinePreflightFailed,
  });

  const serviceContextBlock = buildB1ServiceContextBlock({
    playerLocation: guessPlayerLocationFromContext(playerContext),
    playerContext,
    serviceState: {
      shopUnlocked: true,
      forgeUnlocked: true,
      anchorUnlocked: true,
      unlockFlags: {},
    },
  });
  const npcTaskNarrativeBlock = buildNpcProactiveGrantNarrativeBlock({
    playerContext,
    latestUserInput,
  });
  const conspiracyNarrativeBlock = build7FConspiracyNarrativeBlock({
    playerContext,
    latestUserInput,
  });
  const controlAndLoreAugmentation = [
    controlAugmentation,
    runtimeLoreCompact,
    serviceContextBlock,
    npcTaskNarrativeBlock,
    conspiracyNarrativeBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  const runtimePackets = buildRuntimeContextPackets({
    playerContext,
    latestUserInput,
    playerLocation: guessPlayerLocationFromContext(playerContext),
    serviceState: {
      shopUnlocked: true,
      forgeUnlocked: true,
      anchorUnlocked: true,
      unlockFlags: {},
    },
    runtimeLoreCompact,
    maxChars: 2400,
  });
  runtimePacketChars = runtimePackets.length;
  runtimePacketTokenEstimate = Math.ceil(runtimePacketChars / 4);
  const dynamicSuffixFull = buildDynamicPlayerDmSystemSuffix({
    memoryBlock,
    playerContext,
    isFirstAction,
    runtimePackets,
    controlAugmentation: controlAndLoreAugmentation,
  });
  const aiEnvForSystem = resolveAiEnv();
  const systemChatMessages = composePlayerChatSystemMessages(
    playerDmStablePrefix,
    dynamicSuffixFull,
    aiEnvForSystem.splitPlayerChatDualSystem
  );
  const stableCharLen = playerDmStablePrefix.length;
  const dynamicCharLen = dynamicSuffixFull.length;

  const safeMessages = sanitizeMessagesForUpstream([...systemChatMessages, ...messagesToSend]);

  const telemetryPreferredModel = DEFAULT_PLAYER_ROLE_CHAIN[0];
  void recordGenericAnalyticsEvent({
    eventId: `${requestId}:chat_request_started`,
    idempotencyKey: `${requestId}:chat_request_started`,
    userId,
    sessionId: sessionId ?? "unknown_session",
    eventName: "chat_request_started",
    eventTime: new Date(requestStartedAt),
    page: "/play",
    source: "chat",
    platform,
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {
      requestId,
      model: telemetryPreferredModel,
      isFirstAction,
      controlPreflightBudgetHit,
      preflightRan: preflightTurnMetrics.ran,
      preflightSkippedReason: preflightTurnMetrics.skippedReason,
      preflightCacheHit: preflightTurnMetrics.cacheHit,
      preflightLatencyMs: preflightTurnMetrics.latencyMs,
      preflightOk: preflightTurnMetrics.ok,
      loreRetrievalLatencyMs,
      loreCacheHit,
      loreSourceCount,
      loreTokenEstimate,
      loreFallbackPath,
      loreBudgetHit,
      runtimePacketChars,
      runtimePacketTokenEstimate,
    },
  }).catch(() => {});

  /** 供终帧写入 global cache 时对齐 world_revision（方案 B：preflight 后读取）。Pool max=10，仅短查询。 */
  const kgCacheWorldRevision: { current: bigint | null } = { current: null };
  const codexCacheEarly = kgEnabled
    ? await tryServeCodexFromGlobalCache({
        kgRoute,
        latestUserInput,
        requestId,
        userId,
        sessionId,
        platform,
        onWorldRevision: (rev) => {
          kgCacheWorldRevision.current = rev;
        },
      })
    : null;
  if (codexCacheEarly) return codexCacheEarly;

  if (!anyAiProviderConfigured()) {
    reloadVerseCraftProcessEnv();
  }
  if (!anyAiProviderConfigured()) {
    if (process.env.NODE_ENV === "development") {
      const ai = resolveAiEnv();
      console.warn("[api/chat] AI gateway still missing after env reload", {
        cwd: process.cwd(),
        projectRoot: resolveVerseCraftProjectRoot(),
        gatewayConfigured: Boolean(ai.gatewayBaseUrl && ai.gatewayApiKey),
        gatewayKeyLen: ai.gatewayApiKey.length,
        mainModelConfigured: ai.modelsByRole.main.length > 0,
      });
    }
    console.warn(
      `[api/chat] No AI gateway configured (AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY / AI_MODEL_MAIN). See .env.example. Returning degraded SSE with 200.`
    );
    return new Response(
      sseText(
        JSON.stringify({
          is_action_legal: false,
          sanity_damage: 0,
          narrative: "系统异常：未配置大模型 API Key，无法连接深渊 DM。",
          is_death: false,
          consumes_time: true,
        })
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-VerseCraft-Ai-Status": "keys_missing",
        },
      }
    );
  }

  const FALLBACK_NARRATIVE =
    "游戏主脑暂时离线，请稍后再试。";
  const SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  } as const;

  const fallbackPayload = JSON.stringify({
    is_action_legal: false,
    sanity_damage: 0,
    narrative: FALLBACK_NARRATIVE,
    is_death: false,
    consumes_time: true,
  });

  // Prevent "hang for minutes" UX when upstream is slow or rate-limiting.
  const TIMEOUT_MS = 60000;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let streamResult: PlayerChatStreamResult;
  try {
    streamResult = await generateMainReply({
      messages: safeMessages,
      ctx: {
        requestId,
        userId,
        sessionId,
        path: "/api/chat",
      },
      signal: ac.signal,
      timeoutMs: TIMEOUT_MS,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!streamResult.ok) {
    const isTimeout = streamResult.code === "ABORTED";
    console.error(`\x1b[31m[api/chat] AI router failed\x1b[0m`, {
      code: streamResult.code,
      message: streamResult.message,
      lastHttpStatus: streamResult.lastHttpStatus,
    });
    void recordGenericAnalyticsEvent({
      eventId: `${requestId}:chat_request_finished_error`,
      idempotencyKey: `${requestId}:chat_request_finished_error`,
      userId,
      sessionId: sessionId ?? "unknown_session",
      eventName: "chat_request_finished",
      eventTime: new Date(),
      page: "/play",
      source: "chat",
      platform,
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        requestId,
        model: telemetryPreferredModel,
        success: false,
        stage: "ai_router",
        isTimeout,
        routerCode: streamResult.code,
        totalLatencyMs: Date.now() - requestStartedAt,
        preflightRan: preflightTurnMetrics.ran,
        preflightSkippedReason: preflightTurnMetrics.skippedReason,
        preflightCacheHit: preflightTurnMetrics.cacheHit,
        preflightLatencyMs: preflightTurnMetrics.latencyMs,
        preflightOk: preflightTurnMetrics.ok,
        preflightBudgetHit: controlPreflightBudgetHit,
      },
    }).catch(() => {});

    const upstreamStatus = streamResult.lastHttpStatus ?? 0;
    const attemptsForHint = streamResult.httpAttempts ?? [];
    const lastWithBody = [...attemptsForHint]
      .reverse()
      .find((a) => typeof a.httpStatus === "number" && a.message);
    const hintFields = parseUpstreamErrorFields(lastWithBody?.message);
    const degraded = {
      is_action_legal: false,
      sanity_damage: 0,
      narrative: isTimeout
        ? "深渊回声超时，请稍后重试。"
        : "深渊主脑暂时离线，请稍后重试。",
      is_death: false,
      consumes_time: true,
      security_meta: {
        action: "degrade",
        stage: "ai_router",
        reason: streamResult.code,
        upstream_status: upstreamStatus || undefined,
        ...(hintFields.upstreamCode ? { upstream_code: hintFields.upstreamCode } : {}),
      },
    };
    return new Response(sseText(JSON.stringify(degraded)), {
      status: 200,
      headers: {
        ...SSE_HEADERS,
        "X-VerseCraft-Ai-Status": "degraded",
      },
    });
  }

  const srOk = streamResult as PlayerChatStreamSuccess;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const writeToStream = async (data: string) => writer.write(sse(data));
  const closeWithFallback = async () => {
    try {
      await writeToStream(fallbackPayload);
    } finally {
      await writer.close();
    }
  };

  const MIN_STREAM_OUTPUT_CHARS = 24;
  const MAX_STREAM_SOURCE_ROUNDS = 3;
  const routingReport: AiRoutingReport = {
    requestId,
    task: "PLAYER_CHAT",
    operationMode: srOk.operationMode,
    intendedRole: srOk.intendedLogicalRole,
    actualLogicalRole: srOk.logicalRole,
    fallbackCount: srOk.httpAttempts.filter((a) => a.failureKind !== undefined).length,
    attempts: [...srOk.httpAttempts],
    finalStatus: "success",
  };
  const skippedStreamRoles: AiLogicalRole[] = [];
  let streamSource: PlayerChatStreamSuccess = srOk;
  let streamRound = 0;
  let streamReconnectCount = 0;
  let streamInterruptedCount = 0;
  let streamEmptyCount = 0;
  let tokenUsageFlushedGlobal = false;
  let lastEnhanceAnalytics: EnhanceAfterMainStreamResult | null = null;
  let enhancePathDmParsed = false;
  let finalJsonParseSuccess = false;

  (async () => {
    const scheduleStreamReconnect = async (
      failedRole: AiLogicalRole,
      kind: "STREAM_INTERRUPTED" | "EMPTY_CONTENT"
    ): Promise<boolean> => {
      if (streamRound >= MAX_STREAM_SOURCE_ROUNDS) return false;
      streamReconnectCount += 1;
      if (kind === "STREAM_INTERRUPTED") streamInterruptedCount += 1;
      if (kind === "EMPTY_CONTENT") streamEmptyCount += 1;
      const envSnap = resolveAiEnv();
      routingReport.attempts.push({
        logicalRole: failedRole,
        providerId: "oneapi",
        gatewayModel: envSnap.modelsByRole[failedRole],
        phase: "stream_body",
        failureKind: kind,
        severity: "soft",
        message: kind,
      });
      routingReport.fallbackCount = routingReport.attempts.filter((a) => a.failureKind !== undefined).length;
      skippedStreamRoles.push(failedRole);
      const next = await generateMainReply({
        messages: safeMessages,
        ctx: {
          requestId,
          userId,
          sessionId,
          path: "/api/chat",
        },
        signal: ac.signal,
        timeoutMs: TIMEOUT_MS,
        skipRoles: skippedStreamRoles,
      });
      if (!next.ok) return false;
      streamSource = next;
      return true;
    };

    const flushTokenUsage = async (args: {
      streamRole: AiLogicalRole;
      gatewayModel: string;
      accumulated: string;
      streamBlocked: boolean;
      firstChunkAt: number;
      latestTotalTokens: number;
      latestUsage: TokenUsage | null;
    }) => {
      if (tokenUsageFlushedGlobal) return;
      tokenUsageFlushedGlobal = true;
      const { latestTotalTokens, accumulated } = args;
      const toPersist =
        latestTotalTokens > 0
          ? latestTotalTokens
          : accumulated.length > 0
            ? Math.max(100, Math.ceil(accumulated.length / 2.5))
            : 0;
      await persistTokenUsage(userId, toPersist);
      if (userId && toPersist > 0) {
        await incrementQuota(userId, toPersist).catch((error) => {
          const err = error as Error;
          const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
          console.error(
            `\x1b[31m[api/chat] failed to increment quota\x1b[0m`,
            { userId, toPersist, message: err?.message, cause, stack: err?.stack, error }
          );
        });
      }

      // Event-driven analytics rollups: best-effort and idempotent.
      void recordChatActionCompletedAnalytics({
        eventId: `${requestId}:chat_action_completed`,
        idempotencyKey: `${requestId}:chat_action_completed`,

        userId,
        sessionId: sessionId ?? "unknown_session",
        page: "/play",
        source: "chat",
        platform,

        tokenCost: toPersist,
        playDurationDeltaSec: toPersist > 0 ? PLAY_TIME_PER_ACTION_SEC : 0,

        payload: {
          requestId,
          upstreamLogicalRole: routingReport.actualLogicalRole ?? args.streamRole,
        },
      }).catch(() => {});

      const finishedAt = Date.now();
      void recordGenericAnalyticsEvent({
        eventId: `${requestId}:chat_request_finished`,
        idempotencyKey: `${requestId}:chat_request_finished`,
        userId,
        sessionId: sessionId ?? "unknown_session",
        eventName: "chat_request_finished",
        eventTime: new Date(),
        page: "/play",
        source: "chat",
        platform,
        tokenCost: toPersist,
        playDurationDeltaSec: toPersist > 0 ? PLAY_TIME_PER_ACTION_SEC : 0,
        payload: buildChatRequestFinishedPayload({
          requestId,
          model: routingReport.actualLogicalRole ?? args.streamRole,
          gatewayModel: args.gatewayModel,
          success: !args.streamBlocked,
          firstChunkAt: args.firstChunkAt,
          requestStartedAt,
          finishedAt,
          isFirstAction,
          routing: {
            operationMode: routingReport.operationMode,
            intendedRole: routingReport.intendedRole,
            fallbackCount: routingReport.fallbackCount,
            actualLogicalRole: routingReport.actualLogicalRole ?? undefined,
          },
          stableCharLen,
          dynamicCharLen,
          runtimePacketChars,
          runtimePacketTokenEstimate,
          latestUsage: args.latestUsage,
          preflight: {
            ran: preflightTurnMetrics.ran,
            skippedReason: preflightTurnMetrics.skippedReason,
            cacheHit: preflightTurnMetrics.cacheHit,
            latencyMs: preflightTurnMetrics.latencyMs,
            ok: preflightTurnMetrics.ok,
            budgetHit: preflightTurnMetrics.budgetHit,
          },
          enhance: toEnhanceTurnMetrics(enhancePathDmParsed, lastEnhanceAnalytics),
          streamReconnectCount,
          streamInterruptedCount,
          streamEmptyCount,
          finalJsonParseSuccess,
        }),
      }).catch(() => {});

      logAiTelemetry({
        requestId,
        task: "PLAYER_CHAT",
        providerId: "oneapi",
        logicalRole: args.streamRole,
        gatewayModel: args.gatewayModel,
        phase: "stream_complete",
        latencyMs: finishedAt - requestStartedAt,
        usage: args.latestUsage,
        ttftMs: args.firstChunkAt > 0 ? args.firstChunkAt - requestStartedAt : undefined,
        stableCharLen,
        dynamicCharLen,
        runtimePacketChars,
        runtimePacketTokenEstimate,
        cachedPromptTokens: args.latestUsage?.cachedPromptTokens,
        stream: true,
        userId,
      });
    };

    const runStreamFinalHooks = async (
      accumulatedText: string,
      blockedAuditSummary: string
    ): Promise<boolean> => {
      const parsedRoot = parseAccumulatedPlayerDmJson(accumulatedText);
      let dmRecord =
        parsedRoot !== null ? normalizePlayerDmJson(parsedRoot) : null;
      finalJsonParseSuccess = dmRecord !== null;

      let moderationBody = accumulatedText;
      let finalizePayload: string | null = null;

      if (dmRecord) {
        dmRecord = applyB1ServiceExecutionGuard({
          dmRecord,
          latestUserInput,
          playerContext,
        });
        dmRecord = applyB1SafetyGuard({
          dmRecord,
          fallbackLocation: guessPlayerLocationFromContext(playerContext),
        });
        dmRecord = normalizeDmTaskPayload(dmRecord);
        dmRecord = ensure7FConspiracyTask(dmRecord, {
          playerContext,
          latestUserInput,
        });
        dmRecord = applyNpcProactiveGrantGuard({
          dmRecord,
          playerContext,
        });
        const npcGrantFallbackBlock = buildNpcGrantFallbackNarrativeBlock(dmRecord);
        if (npcGrantFallbackBlock && typeof dmRecord.narrative === "string") {
          const existing = String(dmRecord.narrative ?? "");
          if (!existing.includes("系统发放任务")) {
            dmRecord.narrative = `${existing}\n\n${npcGrantFallbackBlock}`;
          }
        }
        enhancePathDmParsed = true;
        const enhanceWallStart = Date.now();
        try {
          lastEnhanceAnalytics = await enhanceScene({
            accumulatedJsonText: accumulatedText,
            control: pipelineControl,
            rule: pipelineRule,
            mode: routingReport.operationMode,
            baseCtx: { requestId, userId, sessionId, path: "/api/chat" },
            signal: ac.signal,
            isFirstAction,
            playerContext,
            latestUserInput,
            enhanceBudgetMs: preflightEnv.narrativeEnhanceBudgetMs,
          });
          if (lastEnhanceAnalytics.kind === "applied") {
            const next = normalizePlayerDmJson(lastEnhanceAnalytics.dm);
            if (next) dmRecord = next;
          }
        } catch (e) {
          console.warn("[api/chat] optional narrative enhancement skipped", e);
          lastEnhanceAnalytics = {
            kind: "skipped",
            reason: "exception",
            wallMs: Math.max(0, Date.now() - enhanceWallStart),
          };
        }
        finalizePayload = JSON.stringify(dmRecord);
        moderationBody = finalizePayload;
      } else {
        // 当上游返回非严格 JSON 或重复拼接对象时，强制回落到标准 DM JSON 形状，保证 SSE 契约稳定。
        finalizePayload = sanitizeAssistantContent(accumulatedText);
        moderationBody = finalizePayload;
      }

      const finalModeration = await finalOutputModeration({
        input: moderationBody,
        userId,
        ip: clientIp,
        path: "/api/chat",
        requestId,
      });
      if (finalModeration.policy.blocked) {
        recordHighRisk({ ip: clientIp, sessionId, userId }, finalModeration.result.reason);
        writeAuditTrail({
          requestId,
          sessionId,
          userId,
          ip: clientIp,
          stage: "final_output",
          riskLevel: "black",
          action: "degrade",
          triggeredRule: finalModeration.result.reason,
          provider: finalModeration.provider,
          summary: blockedAuditSummary,
        });
        await writer.write(
          sse(
            safeBlockedDmJson(finalModeration.policy.userMessage, {
              action: "degrade",
              stage: "final_output",
              riskLevel: "black",
              requestId,
              reason: finalModeration.result.reason,
            })
          )
        );
        await writer.close();
        return true;
      }
      if (finalizePayload) {
        await writer.write(sse(`__VERSECRAFT_FINAL__:${finalizePayload}`));
        if (dmRecord && userId && sessionId) {
          void persistTurnFacts({
            requestId,
            latestUserInput,
            dmRecord,
            sessionMemorySummary: sessionMemory?.plot_summary ?? null,
            ruleHits: preflightTurnMetrics.ran
              ? [`preflight:${preflightTurnMetrics.ok ? "ok" : "not_ok"}`]
              : ["preflight:skipped"],
            userId,
            sessionId,
            maxFacts: 10,
          })
            .then((writeback) => {
              logAiTelemetry({
                requestId,
                task: "PLAYER_CHAT",
                providerId: "oneapi",
                logicalRole: "control",
                phase: "success",
                userId,
                factIngestionCount: writeback.extractedCount,
                factConflictCount: writeback.rejectedCount,
              });
            })
            .catch((error) => {
            const err = error as Error;
            console.warn("[api/chat] world writeback skipped", {
              requestId,
              userId,
              sessionId,
              message: err?.message,
            });
          });
        }
        if (dmRecord && sessionId) {
          const triggers = detectWorldEngineTriggers({
            turnIndex: totalRounds,
            latestUserInput,
            playerLocation:
              typeof dmRecord.player_location === "string" ? dmRecord.player_location : null,
            npcLocationUpdateCount: Array.isArray(dmRecord.npc_location_updates)
              ? dmRecord.npc_location_updates.length
              : 0,
            dmRecord,
            preflightRiskTags: pipelineControl?.risk_tags ?? [],
          });
          if (triggers.length > 0) {
            void enqueueWorldEngineTick({
              requestId,
              userId,
              sessionId,
              latestUserInput,
              triggerSignals: triggers,
              controlRiskTags: pipelineControl?.risk_tags ?? [],
              dmNarrativePreview: String(dmRecord.narrative ?? "").slice(0, 1200),
              playerLocation:
                typeof dmRecord.player_location === "string" ? dmRecord.player_location : null,
              npcLocationUpdateCount: Array.isArray(dmRecord.npc_location_updates)
                ? dmRecord.npc_location_updates.length
                : 0,
              turnIndex: totalRounds,
            })
              .then((r) => {
                if (!r.enqueued) return;
                void recordGenericAnalyticsEvent({
                  eventId: `${requestId}:world_engine_enqueued`,
                  idempotencyKey: `${requestId}:world_engine_enqueued`,
                  userId,
                  sessionId: sessionId ?? "unknown_session",
                  eventName: "world_engine_enqueued",
                  eventTime: new Date(),
                  page: "/play",
                  source: "chat",
                  platform,
                  tokenCost: 0,
                  playDurationDeltaSec: 0,
                  payload: {
                    requestId,
                    dedupKey: r.dedupKey,
                    triggers,
                  },
                }).catch(() => {});
              })
              .catch(() => {});
          }
        }
        if (
          kgEnabled &&
          dmRecord &&
          typeof dmRecord.narrative === "string" &&
          kgRoute.kind === "CODEX_QUERY" &&
          isGlobalCacheSafe(latestUserInput, kgRoute)
        ) {
          const norm = normalizeForHash(latestUserInput);
          const reqHash = `g:codex:${sha256Hex(norm)}`;
          const wr = kgCacheWorldRevision.current ?? (await getWorldRevision());
          void putSemanticCache({
            scope: "global",
            userId: null,
            task: "codex",
            worldRevision: wr,
            requestText: latestUserInput,
            requestNorm: norm,
            requestHash: reqHash,
            requestEmbedding: embedText(latestUserInput),
            responseText: String(dmRecord.narrative),
            ttlSec: 86_400,
          })
            .then(() => {
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:kg_cache_write`,
                idempotencyKey: `${requestId}:kg_cache_write`,
                userId,
                sessionId: sessionId ?? "unknown_session",
                eventName: "kg_cache_write",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId,
                  scope: "global",
                  worldRevision: wr.toString(),
                },
              }).catch(() => {});
            })
            .catch(() => {});
        }
      }
      return false;
    };

    let streamTtftTelemetrySent = false;
    let latestStreamUsage: TokenUsage | null = null;

    stream_pass: while (streamRound < MAX_STREAM_SOURCE_ROUNDS) {
      streamRound += 1;
      const logicalRole = streamSource.logicalRole;
      routingReport.actualLogicalRole = logicalRole;
      const reader = streamSource.response.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";
      let streamBlocked = false;
      let latestTotalTokens = 0;
      let firstChunkAt = 0;
      let lastStreamDeltaModAt = 0;
      const streamModThrottleMs = preflightEnv.streamModerationThrottleMs;

      const flushThisRound = () =>
        flushTokenUsage({
          streamRole: logicalRole,
          gatewayModel: streamSource.gatewayModel,
          accumulated,
          streamBlocked,
          firstChunkAt,
          latestTotalTokens,
          latestUsage: latestStreamUsage,
        });

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (
            !streamBlocked &&
            accumulated.trim().length < MIN_STREAM_OUTPUT_CHARS &&
            streamRound < MAX_STREAM_SOURCE_ROUNDS
          ) {
            await reader.cancel().catch(() => {});
            const reconnected = await scheduleStreamReconnect(logicalRole, "EMPTY_CONTENT");
            if (reconnected) {
              continue stream_pass;
            }
            routingReport.finalStatus = "fallback_sse_payload";
            routingReport.lastFailureSummary = "stream_empty_exhausted";
            pushAiRoutingReport(routingReport);
            await flushThisRound();
            await closeWithFallback();
            return;
          }
          let closedByFinalHooks = false;
          if (!streamBlocked) {
            closedByFinalHooks = await runStreamFinalHooks(accumulated, "blocked_after_stream_done");
          }
          pushAiRoutingReport(routingReport);
          await flushThisRound();
          if (!closedByFinalHooks) {
            await writer.close();
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buffer.indexOf("\n");
          if (idx === -1) break;
          const line = buffer.slice(0, idx).trimEnd();
          buffer = buffer.slice(idx + 1);

          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();

          if (!data) continue;
          if (firstChunkAt === 0) {
            firstChunkAt = Date.now();
            if (!streamTtftTelemetrySent) {
              streamTtftTelemetrySent = true;
              logAiTelemetry({
                requestId,
                task: "PLAYER_CHAT",
                providerId: "oneapi",
                logicalRole: streamSource.logicalRole,
                gatewayModel: streamSource.gatewayModel,
                phase: "stream_first_token",
                ttftMs: firstChunkAt - requestStartedAt,
                stableCharLen,
                dynamicCharLen,
                stream: true,
                userId,
              });
            }
          }
          if (data === "[DONE]") {
            if (
              !streamBlocked &&
              accumulated.trim().length < MIN_STREAM_OUTPUT_CHARS &&
              streamRound < MAX_STREAM_SOURCE_ROUNDS
            ) {
              await reader.cancel().catch(() => {});
              const reconnected = await scheduleStreamReconnect(logicalRole, "EMPTY_CONTENT");
              if (reconnected) {
                continue stream_pass;
              }
              routingReport.finalStatus = "fallback_sse_payload";
              routingReport.lastFailureSummary = "stream_done_empty_exhausted";
              pushAiRoutingReport(routingReport);
              await flushThisRound();
              await closeWithFallback();
              return;
            }
            let closedByFinalHooksDone = false;
            if (!streamBlocked) {
              closedByFinalHooksDone = await runStreamFinalHooks(accumulated, "blocked_on_done_event");
            }
            pushAiRoutingReport(routingReport);
            await flushThisRound();
            if (!closedByFinalHooksDone) {
              await writer.close();
            }
            return;
          }

          let json: {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
            usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number };
          } | null = null;

          try {
            json = JSON.parse(data);
          } catch {
            const postChunkModeration = await postModelModeration({
              input: data,
              userId,
              ip: clientIp,
              path: "/api/chat",
              requestId,
            });
            if (postChunkModeration.policy.blocked) {
              streamBlocked = true;
              recordHighRisk({ ip: clientIp, sessionId, userId }, postChunkModeration.result.reason);
              writeAuditTrail({
                requestId,
                sessionId,
                userId,
                ip: clientIp,
                stage: "post_model",
                riskLevel: "black",
                action: "terminate",
                triggeredRule: postChunkModeration.result.reason,
                provider: postChunkModeration.provider,
                summary: "chunk_blocked_non_json",
              });
              await writer.write(
                sse(
                  safeBlockedDmJson(postChunkModeration.policy.userMessage, {
                    action: "terminate",
                    stage: "post_model",
                    riskLevel: "black",
                    requestId,
                    reason: postChunkModeration.result.reason,
                  })
                )
              );
              pushAiRoutingReport(routingReport);
              await flushThisRound();
              await reader.cancel().catch(() => {});
              await writer.close();
              return;
            }
            accumulated += data;
            await writeToStream(data);
            continue;
          }

          const deltaContent =
            json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? "";

          if (typeof deltaContent === "string" && deltaContent.length > 0) {
            const nowMod = Date.now();
            const shouldRunDeltaMod =
              streamModThrottleMs <= 0 || nowMod - lastStreamDeltaModAt >= streamModThrottleMs;
            if (shouldRunDeltaMod) {
              const postChunkModeration = await postModelModeration({
                input: deltaContent,
                userId,
                ip: clientIp,
                path: "/api/chat",
                requestId,
              });
              lastStreamDeltaModAt = Date.now();
              if (postChunkModeration.policy.blocked) {
                streamBlocked = true;
                recordHighRisk({ ip: clientIp, sessionId, userId }, postChunkModeration.result.reason);
                writeAuditTrail({
                  requestId,
                  sessionId,
                  userId,
                  ip: clientIp,
                  stage: "post_model",
                  riskLevel: "black",
                  action: "terminate",
                  triggeredRule: postChunkModeration.result.reason,
                  provider: postChunkModeration.provider,
                  summary: "chunk_blocked_json_delta",
                });
                await writer.write(
                  sse(
                    safeBlockedDmJson(postChunkModeration.policy.userMessage, {
                      action: "terminate",
                      stage: "post_model",
                      riskLevel: "black",
                      requestId,
                      reason: postChunkModeration.result.reason,
                    })
                  )
                );
                pushAiRoutingReport(routingReport);
                await flushThisRound();
                await reader.cancel().catch(() => {});
                await writer.close();
                return;
              }
            }
            accumulated += deltaContent;
            await writeToStream(deltaContent);
          }

          const nu = normalizeUsage(json?.usage as unknown);
          if (nu) {
            latestStreamUsage = nu;
            const t = Number(nu.totalTokens ?? 0);
            const merged =
              Number.isFinite(t) && t > 0
                ? t
                : Number(nu.promptTokens ?? 0) + Number(nu.completionTokens ?? 0);
            if (Number.isFinite(merged) && merged > 0) {
              latestTotalTokens = Math.max(latestTotalTokens, Math.trunc(merged));
            }
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
      console.error(
        `\x1b[31m[api/chat] stream pipe failed\x1b[0m`,
        { logicalRole, message: err?.message, cause, stack: err?.stack, error }
      );
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      if (
        accumulated.trim().length < MIN_STREAM_OUTPUT_CHARS &&
        streamRound < MAX_STREAM_SOURCE_ROUNDS
      ) {
        const reconnected = await scheduleStreamReconnect(logicalRole, "STREAM_INTERRUPTED");
        if (reconnected) {
          continue stream_pass;
        }
      }
      routingReport.finalStatus = "fallback_sse_payload";
      routingReport.lastFailureSummary = `stream_catch:${err?.message?.slice(0, 120) ?? "unknown"}`;
      pushAiRoutingReport(routingReport);
      await flushThisRound();
      await closeWithFallback();
      return;
    }
    }
  })().catch(async (error) => {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/chat] background task crashed\x1b[0m`,
      {
        logicalRole: routingReport.actualLogicalRole,
        message: err?.message,
        cause,
        stack: err?.stack,
        error,
      }
    );
    try {
      await writer.write(sse(fallbackPayload));
    } catch {
      /* stream may already be closed or errored */
    }
    try {
      await writer.close();
    } catch {
      try {
        await writer.abort(err);
      } catch {
        /* ignore */
      }
    }
  });

  const sseHeadersOut: Record<string, string> = { ...SSE_HEADERS, "X-Accel-Buffering": "no" };
  if (resolveAiEnv().exposeAiRoutingHeader) {
    const snap = {
      intendedRole: routingReport.intendedRole,
      firstConnectedRole: srOk.logicalRole,
      operationMode: routingReport.operationMode,
      httpFallbackCount: srOk.httpAttempts.filter((a) => a.failureKind !== undefined).length,
    };
    sseHeadersOut["X-AI-Routing-Http-Snapshot"] = Buffer.from(JSON.stringify(snap), "utf8").toString("base64url");
  }

  return new Response(readable, {
    status: 200,
    headers: sseHeadersOut,
  });
}

/** IVFFlat 默认 probes=5；向量维 256。勿提高 @/db pool max（当前 10），缓存路径仅短事务。 */
const KG_SEMANTIC_DEFAULT_PROBES = 5;
const KG_SEMANTIC_DEFAULT_K = 5;
const KG_SEMANTIC_MIN_SIMILARITY = 0.78;

async function tryServeCodexFromGlobalCache(args: {
  kgRoute: RouteResult;
  latestUserInput: string;
  requestId: string;
  userId: string | null;
  sessionId: string | null;
  platform: AnalyticsPlatform;
  onWorldRevision: (rev: bigint) => void;
}): Promise<Response | null> {
  if (args.kgRoute.kind !== "CODEX_QUERY") return null;

  const queryEmbedding = embedText(args.latestUserInput);
  const worldRevision = await getWorldRevision();
  args.onWorldRevision(worldRevision);

  const got = await tryGetSemanticCache({
    scope: "global",
    userId: null,
    task: "codex",
    queryEmbedding,
    worldRevision,
    probes: KG_SEMANTIC_DEFAULT_PROBES,
    k: KG_SEMANTIC_DEFAULT_K,
    minSimilarity: KG_SEMANTIC_MIN_SIMILARITY,
  });

  if (!got.hit || !got.responseText) {
    void recordGenericAnalyticsEvent({
      eventId: `${args.requestId}:kg_cache_miss`,
      idempotencyKey: `${args.requestId}:kg_cache_miss`,
      userId: args.userId,
      sessionId: args.sessionId ?? "unknown_session",
      eventName: "kg_cache_miss",
      eventTime: new Date(),
      page: "/play",
      source: "chat",
      platform: args.platform,
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        requestId: args.requestId,
        scope: "global",
        worldRevision: worldRevision.toString(),
      },
    }).catch(() => {});
    return null;
  }

  if (got.cacheId && Number.isFinite(got.cacheId) && got.cacheId > 0) {
    void touchSemanticCacheHit(got.cacheId);
  }

  void recordGenericAnalyticsEvent({
    eventId: `${args.requestId}:kg_cache_hit`,
    idempotencyKey: `${args.requestId}:kg_cache_hit`,
    userId: args.userId,
    sessionId: args.sessionId ?? "unknown_session",
    eventName: "kg_cache_hit",
    eventTime: new Date(),
    page: "/play",
    source: "chat",
    platform: args.platform,
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {
      requestId: args.requestId,
      scope: "global",
      worldRevision: worldRevision.toString(),
      similarity: got.similarity,
    },
  }).catch(() => {});

  const dmNorm = normalizePlayerDmJson({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: got.responseText,
    is_death: false,
    consumes_time: false,
  });
  if (!dmNorm) return null;

  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  } as const;

  return new Response(sseText(`__VERSECRAFT_FINAL__:${JSON.stringify(dmNorm)}`), {
    status: 200,
    headers,
  });
}

