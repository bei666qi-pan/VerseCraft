// src/app/api/chat/route.ts
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "../../../../auth";
import { db } from "@/db";
import { users, gameSessionMemory } from "@/db/schema";
import {
  compressMemory,
  coerceRowToMemoryForDm,
  mergeEpistemicResidueUseIntoSessionDbRow,
  sessionMemoryToDbRow,
  sessionMemoryRowLooksPresent,
  type SessionMemoryRow,
} from "@/lib/memoryCompress";
import { checkQuota, incrementQuota, estimateTokensFromInput } from "@/lib/quota";
import { markUserActive } from "@/lib/presence";
import { getUtcDateKey, recordDailyTokenUsage } from "@/lib/adminDailyMetrics";
import {
  buildChatRequestFinishedPayload,
  toEnhanceTurnMetrics,
} from "@/lib/analytics/chatRequestFinishedPayload";
import { getGuestIdFromClientState } from "@/lib/chat/clientStateGuest";
import { recordChatActionCompletedAnalytics, recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { buildPlayerContextDigest, inferWeaponizationAttempted } from "@/lib/analytics/playerContextDigest";
import { DEFAULT_PLAYER_ROLE_CHAIN, resolveAiEnv } from "@/lib/ai/config/env";
import { resolveOperationMode } from "@/lib/ai/degrade/mode";
import { allowControlPreflightForSession } from "@/lib/ai/governance/sessionBudget";
import { pushAiRoutingReport } from "@/lib/ai/debug/routingRing";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { PlayerChatStreamSuccess } from "@/lib/ai/router/execute";
import type { AiRoutingReport } from "@/lib/ai/routing/types";
import { anyAiProviderConfigured } from "@/lib/ai/service";
import {
  enhanceScene,
  generateMainReply,
  generateDecisionOptionsOnlyFallback,
  generateOptionsOnlyFallback,
  type EnhanceAfterMainStreamResult,
} from "@/lib/ai/logicalTasks";
import { buildControlAugmentationBlock } from "@/lib/playRealtime/augmentation";
import {
  buildDynamicPlayerDmSystemSuffix,
  buildStyleGuidePacketBlock,
  getStablePlayerDmSystemPrefix,
} from "@/lib/playRealtime/playerChatSystemPrompt";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import {
  incrEmptyOptionsTurnCount,
  incrOptionsOnlyRegenPathHitCount,
  incrTurnModeCount,
  incrDecisionRequiredHitCount,
  recordNarrativeChars,
  recordDecisionOptionsFixOutcome,
  recordLanguageAntiCheatOutcome,
  recordOptionsAutoRegenOutcome,
  recordOptionsManualRegenOutcome,
  recordPromptCharDelta,
} from "@/lib/observability/versecraftRolloutMetrics";
import { persistTurnFacts } from "@/lib/worldKnowledge/ingestion/persistTurnFacts";
import {
  normalizePlayerDmJson,
  parseAccumulatedPlayerDmJson,
} from "@/lib/playRealtime/normalizePlayerDmJson";
import { resolveDmTurn, type ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";
import {
  applyItemGameplayOptionInjection,
  shouldSkipItemOptionInjection,
} from "@/lib/play/itemGameplay";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import { hasStrongAcquireSemantics } from "@/features/play/turnCommit/semanticGuards";
import {
  sanitizeNarrativeLeakageForFinal,
} from "@/lib/playRealtime/protocolGuard";
import { buildRuleSnapshot } from "@/lib/playRealtime/ruleSnapshot";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import {
  loadVerseCraftEnvFilesOnce,
  reloadVerseCraftProcessEnv,
  resolveVerseCraftProjectRoot,
} from "@/lib/config/loadVerseCraftEnv";
import { envBoolean } from "@/lib/config/envRaw";
import { isKgLayerEnabled } from "@/lib/config/kgEnv";
import { moderationTextForPrivateStoryChat, validateChatRequest } from "@/lib/security/chatValidation";
import { finalOutputModeration, postModelModeration, preInputModeration } from "@/lib/security/contentSafety";
import { safeBlockedDmJson } from "@/lib/security/policy";
import { checkRiskControl, recordHighRisk } from "@/lib/security/riskControl";
import { writeAuditTrail } from "@/lib/security/auditTrail";
import { moderateInputOnServer } from "@/lib/safety/input/pipeline";
import { auditDmOutputCandidateOnServer } from "@/lib/safety/output/pipeline";
import { normalizeUsage } from "@/lib/ai/stream/openaiLike";
import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import type { TokenUsage } from "@/lib/ai/types/core";
import { isGlobalCacheSafe } from "@/lib/kg/cacheGate";
import { embedText } from "@/lib/kg/embed";
import { ingestUserKnowledge } from "@/lib/kg/ingest";
import { normalizeForHash, sha256Hex } from "@/lib/kg/normalize";
import { routeUserInput, type RouteResult } from "@/lib/kg/routing";
import { getWorldRevision, putSemanticCache, touchSemanticCacheHit, tryGetSemanticCache } from "@/lib/kg/semanticCache";
import { enqueueWorldEngineTick } from "@/lib/worldEngine/queue";
import {
  applyB1SafetyGuard,
  buildB1ServiceContextBlock,
  extractPresentNpcIds,
  guessPlayerLocationFromContext,
} from "@/lib/playRealtime/b1Safety";
import { applyB1ServiceExecutionGuard } from "@/lib/playRealtime/serviceExecution";
import { applyEquipmentExecutionGuard } from "@/lib/playRealtime/equipmentExecution";
import { applyMainThreatUpdateGuard } from "@/lib/playRealtime/mainThreatGuard";
import { applyWeaponTacticalAdjudication } from "@/lib/playRealtime/weaponAdjudication";
import { applyStage2SettlementGuard } from "@/lib/playRealtime/settlementGuard";
import { buildNpcConsistencyBoundaryCompactBlock } from "@/lib/playRealtime/npcConsistencyBoundaryPackets";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import {
  applyNpcProactiveGrantGuard,
  buildNpcGrantFallbackNarrativeBlock,
  buildNpcProactiveGrantNarrativeBlock,
  normalizeDmTaskPayload,
} from "@/lib/tasks/taskV2";
import { applyDmChangeSetToDmRecord } from "@/lib/dmChangeSet/applyChangeSet";
import { build7FConspiracyNarrativeBlock, ensure7FConspiracyTask } from "@/lib/revive/conspiracy";
import { buildServerDirectorHintBlock } from "@/lib/storyDirector/serverHint";
import { buildActorScopedEpistemicMemoryBlock } from "@/lib/epistemic/actorScopedMemoryBlock";
import { buildNpcEpistemicProfile } from "@/lib/epistemic/builders";
import { detectCognitiveAnomaly } from "@/lib/epistemic/detector";
import { epistemicDebugLog, getEpistemicRolloutFlags } from "@/lib/epistemic/featureFlags";
import { loreFactsToKnowledgeFacts, mergeLorePacketSlices } from "@/lib/epistemic/loreFactBridge";
import { buildNpcEpistemicAlertAugmentationBlock } from "@/lib/epistemic/reaction";
import { sessionMemoryRowToKnowledgeFacts } from "@/lib/epistemic/sessionFactBridge";
import { resolveEpistemicTargetNpcId } from "@/lib/epistemic/targetNpc";
import type { EpistemicValidatorTelemetry } from "@/lib/epistemic/validator";
import { applyNpcConsistencyPostGeneration } from "@/lib/npcConsistency/validator";
import type { EpistemicAnomalyResult, EpistemicSceneContext, KnowledgeFact, NpcEpistemicProfile } from "@/lib/epistemic/types";
import { PLAYER_ACTOR_ID } from "@/lib/epistemic/types";
import { buildEpistemicResiduePerformancePlan } from "@/lib/epistemic/residuePerformance";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import type { LorePacket } from "@/lib/worldKnowledge/types";
import { getNpcCanonicalIdentity, isRegisteredCanonicalNpcId } from "@/lib/registry/npcCanon";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { computeMaxRevealRankFromSignals } from "@/lib/registry/revealRegistry";
import { buildNarrativeContinuityPacketBlock } from "@/lib/playRealtime/narrativeStylePackets";
import { shapeUserActionForModelV2 } from "@/lib/playRealtime/actionIntent";
import { buildPovPacketBlock } from "@/lib/playRealtime/povPackets";
import { buildNpcGenderPronounPacketBlock } from "@/lib/playRealtime/npcGenderPackets";
import { buildOptionsOnlySystemPrompt, buildOptionsOnlyUserPacket } from "@/lib/playRealtime/optionsOnlyPackets";
import { buildProtagonistAnchorPacketBlock } from "@/lib/playRealtime/protagonistAnchorPackets";
import { buildTurnModePolicyPacketBlock } from "@/lib/playRealtime/turnModePackets";
import { buildRealityConstraintPacketBlock } from "@/lib/playRealtime/realityConstraintPackets";
import { assessAndRewriteAntiCheatInput } from "@/lib/playRealtime/antiCheatInput";
import { buildOptionsRegenResponse } from "./optionsRegenPayload";
import { getPostResolveOptionsRegenSkipReason, shouldSkipPostResolveOptionsRegen } from "./postResolveOptionsRegenSkip";
import {
  createChatTtftProfile,
  elapsedMs,
  nowMs,
  pushAndSummarizeTtft,
  resolveChatPerfFlags,
} from "@/lib/turnEngine/chatPerf";
import { isLikelyValidDMJson, sanitizeAssistantContent } from "@/lib/turnEngine/fallback";
import { assemblePlayerChatPrompt } from "@/lib/turnEngine/promptAssembly";
import {
  buildMinimalPlayerContextSnapshot,
  buildTurnRequestMetadata,
  clampText,
  dedupeDecisionOptions,
  extractLastAssistantNarrativeTail,
  inferPlannedTurnMode,
  parseUpstreamErrorFields,
} from "@/lib/turnEngine/requestMetadata";
import {
  createDefaultPreflightMetrics,
  resolveRiskLane,
  runControlPreflightStage,
} from "@/lib/turnEngine/preflight";
import { loadRuntimeLoreStage } from "@/lib/turnEngine/runtimeLore";
import { buildSseHeaders, buildStatusFramePayload, createSseResponse, sse, sseText } from "@/lib/turnEngine/sse";
import type {
  ChatTtftProfile,
  NormalizedPlayerIntent,
  StateDelta,
  TurnExecutionContext,
  TurnLaneDecision,
} from "@/lib/turnEngine/types";
import { normalizePlayerInput } from "@/lib/turnEngine/normalizePlayerInput";
import { routeTurnLane } from "@/lib/turnEngine/routeTurnLane";
import {
  computePostNarrativeDelta,
  computePreNarrativeDelta,
} from "@/lib/turnEngine/computeStateDelta";
import { renderNarrativeFromDelta } from "@/lib/turnEngine/renderNarrative";
import { validateNarrative } from "@/lib/turnEngine/validateNarrative";
import { commitTurn, type TurnCommitSummary } from "@/lib/turnEngine/commitTurn";
import { scheduleBackgroundWorldTick } from "@/lib/turnEngine/enqueueBackgroundTick";
import {
  buildEpistemicInput,
  type EpistemicFilterResult,
} from "@/lib/turnEngine/epistemic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUNDS_THRESHOLD = 10;
const SHORT_TERM_ROUNDS = 5;
const TTFT_HARD_CAP_SESSION_MEMORY_MS = 140;



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
    if (!mr) return null;
    const row: SessionMemoryRow = {
      plot_summary: String(mr.plotSummary ?? ""),
      player_status: (mr.playerStatus as Record<string, unknown>) ?? {},
      npc_relationships: (mr.npcRelationships as Record<string, unknown>) ?? {},
    };
    if (sessionMemoryRowLooksPresent(row)) {
      return row;
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

/** Play time is accumulated from `/api/presence/heartbeat` (see docs/design/presence-and-playtime.md), not from chat. */
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
        lastDataReset: sql`CASE
          WHEN DATE(COALESCE(${users.lastDataReset}, NOW())) = CURRENT_DATE
          THEN ${users.lastDataReset}
          ELSE NOW()
        END`,
        lastActive: new Date(),
      })
      .where(eq(users.id, userId));

    // Best-effort telemetry for admin charts: tokens only; play duration comes from presence heartbeat.
    void recordDailyTokenUsage(getUtcDateKey(), tokenDelta, 0).catch(() => {});
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
  const requestReceivedAt = nowMs();
  let body: unknown;
  const jsonParseStartAt = nowMs();
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const jsonParseMs = elapsedMs(jsonParseStartAt);

  // Merge `.env.local` from the real package root (cwd can differ from app root under some launchers).
  loadVerseCraftEnvFilesOnce();

  const ttftProfile: ChatTtftProfile = createChatTtftProfile({ requestReceivedAt, jsonParseMs });
  // 鎬ц兘鍒嗗眰锛堥瀛楀墠鐪熷疄闃诲锛夛細
  // - validate/auth/safety/quota/db/preflight/lore/prompt_build 鍧囧睘浜庘€滈瀛楀墠闃诲閾捐矾鈥?  // - writeToStream() 绗竴娆″啓鍏ユ墠鏄湇鍔＄瑙嗚鐨勨€滈涓彲鎰熺煡鍝嶅簲鈥濓紙涓嶇瓑浜庢鏂囬瀛楀彲瑙侊級
  const validateStartAt = nowMs();
  const validated = validateChatRequest(body);
  ttftProfile.validateChatRequestMs = elapsedMs(validateStartAt);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const messages = validated.messages;
  const playerContext = validated.playerContext;
  const clientState = validated.clientState;
  const chatGuestId = getGuestIdFromClientState(clientState);
  let latestUserInput = validated.latestUserInput;
  const sessionId = validated.sessionId;
  const clientPurpose = validated.clientPurpose;
  const perfFlags = resolveChatPerfFlags();
  const {
    clientIp,
    requestId,
    platform,
    requestStartedAt,
    isFirstAction,
    shouldApplyFirstActionConstraint,
  } = buildTurnRequestMetadata({
    headers: req.headers,
    messages,
    requestStartedAt: requestReceivedAt,
  });
  const authStartAt = nowMs();
  const session = await auth();
  ttftProfile.authSessionMs = elapsedMs(authStartAt);
  const userId = session?.user?.id ?? null;

  // --- Options-only fast path (never mutates world state) ---
  // This helper request is triggered by the UI button that asks the DM to refresh choices.
  // It must not share the main story action risk-control / repeat-input moderation path,
  // otherwise repeated clicks on the fixed helper text can escalate into 403 -> 429 blocks.
  if (clientPurpose === "options_regen_only") {
    const rollout = getVerseCraftRolloutFlags();
    incrOptionsOnlyRegenPathHitCount(1);
    const snapshot = buildMinimalPlayerContextSnapshot(playerContext);
    const lastAssistant =
      validated.messages
        .slice()
        .reverse()
        .find((m) => m.role === "assistant")?.content ?? "";
    const clientReason = validated.clientReason;
    const clientTurnModeHint = validated.clientTurnModeHint;
    const lastUserReason =
      validated.messages
        .slice()
        .reverse()
        .find((m) => m.role === "user")?.content ?? "";
    const reason = (clientReason.trim() || lastUserReason.trim() || "鐢ㄦ埛璇锋眰閲嶆柊鏁寸悊閫夐」").trim();

    const packet = rollout.enableOptionsOnlyRegenPathV2
      ? buildOptionsOnlyUserPacket({
          reason,
          optionsRegenContext: validated.optionsRegenContext,
          playerContextSnapshot: snapshot,
          clientState: validated.clientState,
        })
      : reason;
    // Let the client-side AbortController (9 s deadline) handle overall timeout.
    // Server-side budgetMs is set to 0 (unlimited) so the single AI attempt gets the full
    // time window. Reasoning models (e.g. MiniMax) may need 8鈥?0 s for a complete response.
    const regen = await generateOptionsOnlyFallback({
      narrative: lastAssistant,
      latestUserInput: packet,
      playerContext: snapshot,
      ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { clientPurpose: "options_regen_only" } },
      systemExtra: rollout.enableOptionsOnlyRegenPathV2 ? buildOptionsOnlySystemPrompt() : "",
      budgetMs: 0,
      signal: req.signal,
    });
    const shaped = buildOptionsRegenResponse({
      clientTurnModeHint,
      options: regen.ok ? regen.options : [],
      generatorOk: regen.ok,
      debugReasonCodes: regen.ok ? [] : ["parse_failed"],
    });
    const ok = shaped.ok;
    const payload = JSON.stringify(shaped);
    const isAuto =
      /涓诲洖鍚坾options\s*缂哄け|auto_missing_main/i.test(reason) ||
      /auto/i.test(clientReason);
    if (isAuto) recordOptionsAutoRegenOutcome(ok);
    else recordOptionsManualRegenOutcome(ok);
    return createSseResponse({ requestId, payload, status: 200 });
  }

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
    return createSseResponse({
      requestId,
      status: 429,
      payload: safeBlockedDmJson("当前请求过于频繁或风险过高，请稍后再试。", {
        action: "block",
        stage: "risk_control",
        riskLevel: riskControl.level,
        requestId,
        reason: riskControl.reason,
      }),
    });
  }

  // Phase3: input moderation for private story action.
  // Important: do not feed unsafe raw input to control/main model.
  const dmLatestUserInput = latestUserInput;
  const inputSafetyStartAt = nowMs();
  const inputSafety = await moderateInputOnServer({
    scene: "private_story_action",
    text: moderationTextForPrivateStoryChat(clientPurpose, dmLatestUserInput),
    userId: userId ?? undefined,
    sessionId: sessionId ?? undefined,
    ip: clientIp ? String(clientIp) : undefined,
    traceId: requestId,
  });
  ttftProfile.moderateInputOnServerMs = elapsedMs(inputSafetyStartAt);
  if (inputSafety.decision === "reject") {
    recordHighRisk({ ip: clientIp, sessionId, userId }, `input_reject:${inputSafety.traceId}`);
    return createSseResponse({
      requestId,
      status: 403,
      payload: safeBlockedDmJson(inputSafety.narrativeFallback ?? inputSafety.userMessage, {
        action: "degrade",
        stage: "pre_input",
        riskLevel: "gray",
        requestId,
        reason: "input_reject",
      }),
    });
  }
  if (clientPurpose === "options_regen_only") {
    // 瀹℃牳鍏ュ弬涓哄浐瀹氱煭鍙ワ紱绂佹鐢?rewrite/fallback 瑕嗙洊鐪熷疄 options 鍒锋柊 prompt銆?    latestUserInput = dmLatestUserInput;
  } else if (inputSafety.decision === "fallback") {
    // Use fallback text to keep session progressing without exposing unsafe details.
    latestUserInput = inputSafety.text;
  } else if (inputSafety.decision === "rewrite") {
    latestUserInput = inputSafety.text;
  }

  // Phase-5: language-based anti-cheat (lightweight, non-generative).
  // Trust priority:
  // 1) clientState (structured) for inventory/location/time snapshots
  // 2) server-known session memory / save (handled by existing guards and writeback)
  // 3) playerContext is display-only
  // 4) user natural language expresses intent only, never facts
  const verseRollout = getVerseCraftRolloutFlags();
  const antiCheat = assessAndRewriteAntiCheatInput({
    latestUserInput,
    clientState,
    clientPurpose,
  });
  if (antiCheat.decision !== "allow") {
    if (verseRollout.enableLanguageAntiCheat) {
      latestUserInput = antiCheat.text;
      recordLanguageAntiCheatOutcome({
        rewritten: antiCheat.decision === "rewrite",
        fallback: antiCheat.decision === "fallback",
      });
    }
    // Minimal audit: only log when we actually rewrote/fell back.
    writeAuditTrail({
      requestId,
      sessionId,
      userId,
      ip: clientIp,
      path: "/api/chat",
      stage: "anti_cheat_input",
      riskLevel: antiCheat.risk === "high" ? "gray" : "normal",
      action: antiCheat.decision === "fallback" ? "degrade" : "review",
      triggeredRule: antiCheat.reasons.slice(0, 4).join(",") || "anti_cheat_rewrite",
      summary: `risk=${antiCheat.risk} len=${antiCheat.text.length}`,
    });
  }

  /**
   * 蹇參杞﹂亾鍒ゅ畾锛堜粎宸ョ▼瑙勫垯锛岄浂棰濆妯″瀷寮€閿€锛夛細
   * - fast锛氭櫘閫氬彊浜嬪姩浣滐紝淇濈暀鍩虹瀹夊叏鍏ュ彛鍚庡敖蹇繘涓绘ā鍨嬶紱
   * - slow锛氱伆鍖?楂橀闄?澶嶆潅绯荤粺鎸囦护锛岃蛋瀹屾暣閲嶉摼璺€?   */
  const laneDecision = resolveRiskLane({
    perfFlags,
    latestUserInput,
  });
  const riskLane = laneDecision.lane;
  ttftProfile.lane = riskLane;
  const shouldRunHeavyPreInput = riskLane === "slow";

  if (shouldRunHeavyPreInput) {
    const preInputStartAt = nowMs();
    const preCheck = await preInputModeration({
      input: `${latestUserInput}\n${playerContext}`,
      userId,
      ip: clientIp,
      path: "/api/chat",
      requestId,
    });
    ttftProfile.preInputModerationMs = elapsedMs(preInputStartAt);
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
      return createSseResponse({
        requestId,
        status: preCheck.policy.statusCode,
        payload: safeBlockedDmJson(preCheck.policy.userMessage, {
          action: "degrade",
          stage: "pre_input",
          riskLevel: "gray",
          requestId,
          reason: preCheck.result.reason,
        }),
      });
    }
  } else {
    ttftProfile.preInputModerationMs = 0;
    writeAuditTrail({
      requestId,
      sessionId,
      userId,
      ip: clientIp,
      stage: "pre_input",
      riskLevel: "normal",
      action: "allow",
      triggeredRule: "fast_lane",
      summary: `pre_input_skipped:${laneDecision.reasons.join("|")}`,
    });
  }

  const kgEnabled = isKgLayerEnabled();
  const kgRoute = routeUserInput(latestUserInput);
  if (kgEnabled) {
    void ingestUserKnowledge({ userId, latestUserInput, route: kgRoute });
  }

  // Overlap session-memory DB read with local chat message shaping (stable prefix + raw slice + dice).
  const sessionMemoryStartAt = nowMs();
  const sessionMemoryPromise: Promise<SessionMemoryRow | null> =
    !isFirstAction && userId
      ? loadSessionMemoryForUser(userId).finally(() => {
          ttftProfile.sessionMemoryReadMs = elapsedMs(sessionMemoryStartAt);
        })
      : Promise.resolve(null).finally(() => {
          ttftProfile.sessionMemoryReadMs = 0;
        });

  const playerDmStablePrefix = getStablePlayerDmSystemPrefix();

  const rawChatMessages = messages
    .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
    .map((m) => {
      const content =
        m.role === "assistant" ? sanitizeAssistantContent(m.content) : m.content;
      return { role: m.role, content } as { role: string; content: string };
    });

  let turnDice: number | null = null;
  let turnRawAction: string | null = null;

  const lastUserIdx = rawChatMessages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx >= 0) {
    // Replace last user message with moderated input (avoid feeding unsafe raw text downstream).
    const rawAction = String(latestUserInput ?? "").trim();
    const dice = randomInt(1, 101);
    rawChatMessages[lastUserIdx] = {
      role: "user",
      content: shapeUserActionForModelV2(rawAction),
    };
    /**
     * 灏嗏€滄殫楠?鎵挎帴瑙勫垯鈥濅粠 user message 鎸嚭锛?     * - user锛氫粎淇濈暀鐜╁鏈洖鍚堣嚜鐒惰瑷€杈撳叆锛堜綆鍙鍐欙級
     * - system锛氱敱 continuity packet + augmentation 寮曞 DM 鍋氣€滃悗鏋滃厛琛屸€濈殑灏忚缁啓锛堥伩鍏嶈В閲婅厰锛?     *
     * 娉ㄦ剰锛歞ice 鏁板€间粛鍙緵妯″瀷鍐冲畾鎴愯触鍊惧悜锛屼絾蹇呴』鍙綔涓?system-side 闅愭€ф彁绀猴紝
     * 绂佹鍦?narrative 鏆撮湶鈥滈瀛?roll/鏁板€?妫€瀹氣€濈瓑鍏冩満鍒惰瘝銆?     */
    turnDice = dice;
    turnRawAction = clampText(rawAction, 360);
  }

  const chatMsgs = rawChatMessages;
  const totalRounds = Math.floor((chatMsgs.length - 1) / 2);
  let messagesToSend = rawChatMessages;

  if (totalRounds > ROUNDS_THRESHOLD && userId) {
    const keepCount = SHORT_TERM_ROUNDS * 2 + 1;
    messagesToSend = chatMsgs.slice(-keepCount);
  }

  const sessionMemoryBudgetMs = TTFT_HARD_CAP_SESSION_MEMORY_MS;
  const sessionMemory: SessionMemoryRow | null = await Promise.race([
    sessionMemoryPromise,
    new Promise<SessionMemoryRow | null>((resolve) => setTimeout(() => resolve(null), sessionMemoryBudgetMs)),
  ]);
  if (ttftProfile.sessionMemoryReadMs === null) {
    ttftProfile.sessionMemoryReadMs = elapsedMs(sessionMemoryStartAt);
  }
  const contextMode =
    perfFlags.enablePromptSlimming && perfFlags.enableLightweightFastPath && riskLane === "fast"
      ? "minimal"
      : "full";
  const playerLocEarly = guessPlayerLocationFromContext(playerContext);
  const presentNpcIdsEarly = extractPresentNpcIds(playerContext, playerLocEarly);
  const focusNpcEarly =
    !shouldApplyFirstActionConstraint
      ? resolveEpistemicTargetNpcId({
          latestUserInput,
          playerContext,
          playerLocation: playerLocEarly,
          controlTarget: null,
        })
      : null;
  const memoryCapsEarly =
    contextMode === "minimal"
      ? {
          summaryMaxChars: 420,
          playerStatusMaxChars: 220,
          npcRelationsMaxChars: 140,
          layerMaxChars: 220,
          npcSnapshotsMaxChars: 180,
          compact: true as const,
        }
      : { compact: false as const };
  const earlyScoped = buildActorScopedEpistemicMemoryBlock({
    mem: coerceRowToMemoryForDm(sessionMemory),
    actorNpcId: focusNpcEarly,
    presentNpcIds: presentNpcIdsEarly,
    allKnowledgeFacts: [],
    profile: focusNpcEarly ? buildNpcEpistemicProfile(focusNpcEarly) : null,
    anomalyResult: null,
    detectorRan: false,
    options: memoryCapsEarly,
  });
  let memoryBlock = earlyScoped.block;
  const earlyRevealRank = computeMaxRevealRankFromSignals(
    parsePlayerWorldSignals(playerContext, playerLocEarly)
  );
  const npcConsistencyBoundaryEarly = buildNpcConsistencyBoundaryCompactBlock({
    playerContext,
    latestUserInput,
    playerLocation: playerLocEarly,
    focusNpcId: focusNpcEarly,
    maxRevealRank: earlyRevealRank,
    epistemic: {
      actorKnownFactCount: earlyScoped.metrics.actorKnownFactCount,
      publicFactCount: earlyScoped.metrics.publicFactCount,
      forbiddenFactCount: earlyScoped.metrics.forbiddenFactCount,
    },
    maxChars: contextMode === "minimal" ? 900 : 1600,
  });
  const playerContextForPrompt =
    contextMode === "minimal"
      ? buildMinimalPlayerContextSnapshot(playerContext)
      : playerContext;
  const narrativeContinuityBlockEarly = buildNarrativeContinuityPacketBlock({
    previousTail: extractLastAssistantNarrativeTail(rawChatMessages),
    rawAction: turnRawAction ?? latestUserInput,
    dice: turnDice,
    maxChars: contextMode === "minimal" ? 520 : 900,
  });
  const povBlockEarly = buildPovPacketBlock({ maxChars: contextMode === "minimal" ? 280 : 420 });
  const npcGenderPronounBlockEarly = buildNpcGenderPronounPacketBlock({
    focusNpcId: focusNpcEarly,
    presentNpcIds: presentNpcIdsEarly,
    maxChars: contextMode === "minimal" ? 520 : 760,
  });
  const dynamicCoreForQuota = buildDynamicPlayerDmSystemSuffix({
    memoryBlock,
    playerContext: playerContextForPrompt,
    isFirstAction: shouldApplyFirstActionConstraint,
    runtimePackets: "",
    controlAugmentation: "",
    npcConsistencyBoundaryBlock: npcConsistencyBoundaryEarly.text,
    narrativeContinuityBlock: narrativeContinuityBlockEarly,
    povBlock: povBlockEarly,
    npcGenderPronounBlock: npcGenderPronounBlockEarly,
  });
  const systemPromptForQuota = `${playerDmStablePrefix}\n\n${dynamicCoreForQuota}`;

  const shouldRunStrictQuotaBeforeFirstToken = !(perfFlags.enableLightweightFastPath && riskLane === "fast");
  if (userId && shouldRunStrictQuotaBeforeFirstToken) {
    try {
      const estimated = estimateTokensFromInput(systemPromptForQuota, messages);
      const quotaCheckStartAt = nowMs();
      const quotaResult = await checkQuota(userId, estimated);
      ttftProfile.quotaCheckMs = elapsedMs(quotaCheckStartAt);
      if (!quotaResult.ok) {
        const msg =
          quotaResult.reason === "banned"
            ? "账号已被封禁，无法继续使用本平台。"
            : quotaResult.reason === "token_limit"
              ? "今日 Token 配额已用尽，请明天再试。"
              : "今日动作次数已达上限，请明天再试。";
        return createSseResponse({
          requestId,
          status: quotaResult.reason === "banned" ? 403 : 429,
          payload: JSON.stringify({
            is_action_legal: false,
            sanity_damage: 0,
            narrative: msg,
            is_death: false,
            consumes_time: true,
          }),
        });
      }
    } catch (quotaErr) {
      console.error("[api/chat] quota check failed, proceeding without quota", quotaErr);
      if (ttftProfile.quotaCheckMs === null) ttftProfile.quotaCheckMs = 0;
    }
  } else if (userId) {
    /**
     * 鍗曟満鍙欎簨杩囩▼鍒嗗眰绛栫暐锛?     * - 蹇溅閬撲笉鍋氣€滈噸鍨嬮厤棰?DB 鏍￠獙鈥濋瀛楀墠闃诲锛岄伩鍏嶆妸鏅€氬洖鍚堝綋鎴愰珮浠峰€煎澶栨彁浜ゅ鐞嗭紱
     * - 鍩虹闄愭祦锛坮iskControl锛変笌鍐呭瀹夊叏锛坢oderateInputOnServer锛変粛鐒朵繚鐣欙紱
     * - 瀹為檯 token 璁拌处涓庨搴︽秷鑰椾粛鍦ㄩ瀛楀悗 flush 闃舵鎵ц锛?     * - 浼佷笟鍖栧己鏍￠獙搴旇仛鐒﹀湪浜戝悓姝?鎺掕姒?鎴愬氨涓婁紶绛夆€滃閮ㄥ彲瑙佺粨鏋溾€濊妭鐐广€?     */
    ttftProfile.quotaCheckMs = 0;
  }

  if (totalRounds > ROUNDS_THRESHOLD && userId) {
    const keepCount = SHORT_TERM_ROUNDS * 2 + 1;
    const toCompressCount = 5 * 2;
    const toCompress = chatMsgs.slice(-keepCount - toCompressCount, -keepCount);

    void (async () => {
      try {
        const newMem = await compressMemory(sessionMemory, toCompress);
        if (newMem && userId) {
          const dbRow = sessionMemoryToDbRow(newMem);
          await db
            .insert(gameSessionMemory)
            .values({
              userId,
              plotSummary: dbRow.plotSummary,
              playerStatus: dbRow.playerStatus,
              npcRelationships: dbRow.npcRelationships,
            })
            .onConflictDoUpdate({
              target: gameSessionMemory.userId,
              set: {
                plotSummary: dbRow.plotSummary,
                playerStatus: dbRow.playerStatus,
                npcRelationships: dbRow.npcRelationships,
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
  let preflightTurnMetrics = createDefaultPreflightMetrics();

  if (isFirstAction && userId) {
    void db.delete(gameSessionMemory).where(eq(gameSessionMemory.userId, userId)).catch(() => {});
  }

  const preflightEnv = resolveAiEnv();
  const runControlPreflightP = runControlPreflightStage({
    perfFlags,
    riskLane,
    sessionId,
    latestUserInput,
    playerContext,
    pipelineRule,
    requestId,
    userId,
    controlPreflightBudgetMs: Math.max(
      0,
      Math.min(preflightEnv.controlPreflightBudgetMs, perfFlags.controlPreflightBudgetMsCap)
    ),
    allowControlPreflightForSessionImpl: allowControlPreflightForSession,
    resolveOperationModeImpl: resolveOperationMode,
  }).then((result) => {
    pipelineControl = result.pipelineControl;
    pipelinePreflightFailed = result.pipelinePreflightFailed;
    controlPreflightBudgetHit = result.controlPreflightBudgetHit;
    preflightTurnMetrics = result.preflightTurnMetrics;
  });

  let runtimeLoreCompact = "";
  let loreRetrievalLatencyMs = 0;
  let loreCacheHit = false;
  let loreSourceCount = 0;
  let loreTokenEstimate = 0;
  let loreFallbackPath: "none" | "db_partial" | "registry" = "none";
  let loreBudgetHit = false;
  let runtimePacketChars = 0;
  let runtimePacketTokenEstimate = 0;
  let runtimeLorePacket: LorePacket | null = null;

  const loreRetrievalP = loadRuntimeLoreStage({
    perfFlags,
    riskLane,
    loreRetrievalBudgetMs: Math.max(
      0,
      Math.min(preflightEnv.loreRetrievalBudgetMs, perfFlags.loreRetrievalBudgetMsCap)
    ),
    requestId,
    userId,
    sessionId,
    latestUserInput,
    playerContext,
  }).then((result) => {
    runtimeLoreCompact = result.runtimeLoreCompact;
    loreRetrievalLatencyMs = result.loreRetrievalLatencyMs;
    loreCacheHit = result.loreCacheHit;
    loreSourceCount = result.loreSourceCount;
    loreTokenEstimate = result.loreTokenEstimate;
    loreFallbackPath = result.loreFallbackPath;
    loreBudgetHit = result.loreBudgetHit;
    runtimeLorePacket = result.runtimeLorePacket;
  });

  const promptBuildStartAt = nowMs();

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
  const npcTaskNarrativeBlock =
    riskLane === "slow"
      ? buildNpcProactiveGrantNarrativeBlock({
          playerContext,
          latestUserInput,
        })
      : "";
  const conspiracyNarrativeBlock =
    riskLane === "slow"
      ? build7FConspiracyNarrativeBlock({
          playerContext,
          latestUserInput,
        })
      : "";
  const directorHintBlock = (() => {
    try {
      const d =
        clientState && typeof clientState === "object" && !Array.isArray(clientState)
          ? ((clientState as any).directorDigest ?? null)
          : null;
      return buildServerDirectorHintBlock(d);
    } catch {
      return "";
    }
  })();

  const serviceState = {
    shopUnlocked: true,
    forgeUnlocked: true,
    anchorUnlocked: true,
    unlockFlags: {},
  };

  await Promise.all([runControlPreflightP, loreRetrievalP]);
  ttftProfile.controlPreflightMs =
    typeof preflightTurnMetrics.latencyMs === "number" ? Math.max(0, preflightTurnMetrics.latencyMs) : 0;
  ttftProfile.loreRetrievalMs = Math.max(0, loreRetrievalLatencyMs);

  const nowIsoForEpistemic = new Date().toISOString();
  const playerLocForEpistemic = guessPlayerLocationFromContext(playerContext);
  const presentNpcIdsForEpistemic = extractPresentNpcIds(playerContext, playerLocForEpistemic);
  const signalsForEpistemicReveal = parsePlayerWorldSignals(playerContext, playerLocForEpistemic);
  const maxRevealRankForMemory = computeMaxRevealRankFromSignals(signalsForEpistemicReveal);
  const epistemicRolloutFlags = getEpistemicRolloutFlags();

  let focusNpcForPrompt: string | null = null;
  let epistemicAnomalyResult: EpistemicAnomalyResult | null = null;
  let epistemicProfileForPrompt: NpcEpistemicProfile | null = null;
  let allEpistemicFactsForPrompt: KnowledgeFact[] = [];
  let epistemicAlertAugmentation = "";

  /**
   * Epistemic 浣撶郴灞炰簬鈥滆川閲忓寮哄眰鈥濊€岄潪鈥滈瀛楁纭€у簳绾库€濓細
   * - fast lane 棣栧瓧浼樺厛锛氱姝㈣繘鍏ヨ閲嶈绠楀垎鏀紝閬垮厤鎶婃櫘閫氬洖鍚堟嫋鎱㈠埌鎱㈣溅閬?TTFT
   * - slow lane 鍙惎鐢細鐢ㄤ簬 NPC 璁板繂/璁ょ煡寮傚父绛変竴鑷存€у寮?   *
   * 涓轰粈涔堜笉浼氱牬鍧忓畨鍏?鐜╂硶锛?   * - 杈撳叆瀹夊叏銆佸崗璁畧鍗€乶pcConsistencyBoundary锛坈ompact锛変粛鍦?core prompt 閲?   * - 璇ュ垎鏀富瑕佸奖鍝嶁€滃彊浜嬩竴鑷存€?璁板繂绮惧害鈥濓紝涓嶈礋璐ｅ唴瀹瑰畨鍏ㄤ笌纭鍐?   */
  if (riskLane === "slow" && !shouldApplyFirstActionConstraint && epistemicRolloutFlags.enableEpistemicGuard) {
    const loreSlice = runtimeLorePacket ? mergeLorePacketSlices(runtimeLorePacket) : [];
    const fromLore = loreFactsToKnowledgeFacts(loreSlice.slice(0, 96), nowIsoForEpistemic);
    const fromSession = sessionMemoryRowToKnowledgeFacts(sessionMemory, nowIsoForEpistemic);
    const mergedFacts = new Map<string, KnowledgeFact>();
    for (const f of [...fromLore, ...fromSession]) mergedFacts.set(f.id, f);
    allEpistemicFactsForPrompt = [...mergedFacts.values()];

    const focusNpcId = resolveEpistemicTargetNpcId({
      latestUserInput,
      playerContext,
      playerLocation: playerLocForEpistemic,
      controlTarget: pipelineControl?.extracted_slots?.target ?? null,
    });
    focusNpcForPrompt = focusNpcId;
    if (focusNpcId) {
      const epistemicScene: EpistemicSceneContext = {
        presentNpcIds: [...new Set([...presentNpcIdsForEpistemic, focusNpcId])],
      };
      epistemicProfileForPrompt = buildNpcEpistemicProfile(focusNpcId, {
        overrides:
          pipelineRule.in_dialogue_hint && focusNpcId !== XINLAN_NPC_ID
            ? { remembersPlayerIdentity: "vague" }
            : undefined,
      });
      epistemicAnomalyResult = detectCognitiveAnomaly({
        npcId: focusNpcId,
        playerInput: latestUserInput,
        allFacts: allEpistemicFactsForPrompt,
        scene: epistemicScene,
        profile: epistemicProfileForPrompt,
        nowIso: nowIsoForEpistemic,
        maxRevealRank: maxRevealRankForMemory,
        canonical: getNpcCanonicalIdentity(focusNpcId),
      });
      epistemicAlertAugmentation = buildNpcEpistemicAlertAugmentationBlock(epistemicAnomalyResult);
      if (epistemicRolloutFlags.epistemicDebugLog && epistemicAnomalyResult.anomaly) {
        epistemicDebugLog("anomaly_detected", {
          npcId: focusNpcId,
          severity: epistemicAnomalyResult.severity,
          reactionStyle: epistemicAnomalyResult.reactionStyle,
        });
      }
    }
  } else if (riskLane === "slow" && !shouldApplyFirstActionConstraint) {
    const focusNpcId = resolveEpistemicTargetNpcId({
      latestUserInput,
      playerContext,
      playerLocation: playerLocForEpistemic,
      controlTarget: pipelineControl?.extracted_slots?.target ?? null,
    });
    focusNpcForPrompt = focusNpcId;
    if (focusNpcId) {
      epistemicProfileForPrompt = buildNpcEpistemicProfile(focusNpcId, {
        overrides:
          pipelineRule.in_dialogue_hint && focusNpcId !== XINLAN_NPC_ID
            ? { remembersPlayerIdentity: "vague" }
            : undefined,
      });
      epistemicAnomalyResult = null;
      epistemicAlertAugmentation = "";
    }
  }

  const dmMemForEpistemic = coerceRowToMemoryForDm(sessionMemory);

  /**
   * Phase-3: structured epistemic filter.
   *
   * This is the explicit, code-reviewable cognitive partition that downstream
   * narrative rendering / post-generation validators consume. The legacy
   * string-layer prompt context (`buildActorScopedEpistemicContext` below) is
   * still computed for compatibility with the current DM prompt — this
   * structured view is *additive* and does not replace it.
   *
   * Two views are computed per turn:
   *   - `actorEpistemicFilter`: scoped to the focus NPC actor (or player-only
   *     scene when no focus). Narrative rendering for this actor MUST NOT see
   *     `dmOnlyFacts`.
   *   - `dmEpistemicFilter`: DM-authoring view; used by validators / analytics
   *     to detect leak candidates.
   */
  const actorEpistemicFilter: EpistemicFilterResult = buildEpistemicInput({
    lorePacket: runtimeLorePacket,
    sessionMemory,
    presentNpcIds: presentNpcIdsForEpistemic,
    focusNpcId: focusNpcForPrompt,
    actorId: focusNpcForPrompt ?? PLAYER_ACTOR_ID,
    maxRevealRank: maxRevealRankForMemory,
    profile: epistemicProfileForPrompt,
    nowIso: nowIsoForEpistemic,
  });
  const dmEpistemicFilter: EpistemicFilterResult = buildEpistemicInput({
    lorePacket: runtimeLorePacket,
    sessionMemory,
    presentNpcIds: presentNpcIdsForEpistemic,
    focusNpcId: focusNpcForPrompt,
    actorId: null,
    profile: null,
    nowIso: nowIsoForEpistemic,
  });
  if (epistemicRolloutFlags.epistemicDebugLog) {
    epistemicDebugLog("filter_result_built", {
      requestId,
      actorId: actorEpistemicFilter.telemetry.actorId,
      bucket_counts: actorEpistemicFilter.telemetry.bucketCounts,
      reveal_gated: actorEpistemicFilter.telemetry.revealGatedCount,
      actor_is_xinlan: actorEpistemicFilter.telemetry.actorIsXinlanException,
      dm_bucket_counts: dmEpistemicFilter.telemetry.bucketCounts,
    });
  }

  const epistemicRuntimeCrossRef =
    "同条 system 中的 npc_player_baseline_packet、npc_scene_authority_packet、key_npc_lore_packet、worldLorePacketsCompact（reveal_tier）";
  const actorCanonOneLinerForMemory = focusNpcForPrompt?.trim()
    ? getNpcCanonicalIdentity(focusNpcForPrompt).canonicalPublicRole.trim().slice(0, 120)
    : undefined;
  const epistemicResiduePlan = buildEpistemicResiduePerformancePlan({
    focusNpcId: focusNpcForPrompt,
    profile: epistemicProfileForPrompt,
    anomalyResult: epistemicAnomalyResult,
    mem: dmMemForEpistemic,
    latestUserInput,
    playerContext,
    presentNpcIds: presentNpcIdsForEpistemic,
    requestId,
    nowIso: nowIsoForEpistemic,
  });

  const memoryCapsFinal =
    contextMode === "minimal"
      ? {
          summaryMaxChars: 420,
          playerStatusMaxChars: 220,
          npcRelationsMaxChars: 140,
          layerMaxChars: 220,
          npcSnapshotsMaxChars: 180,
          compact: true as const,
        }
      : { compact: false as const };

  const scopedFinal = buildActorScopedEpistemicMemoryBlock({
    mem: dmMemForEpistemic,
    actorNpcId: focusNpcForPrompt,
    presentNpcIds: presentNpcIdsForEpistemic,
    allKnowledgeFacts: allEpistemicFactsForPrompt,
    profile: epistemicProfileForPrompt,
    anomalyResult: epistemicAnomalyResult,
    residuePacket: epistemicResiduePlan.packet,
    detectorRan: Boolean(
      focusNpcForPrompt && !shouldApplyFirstActionConstraint && epistemicRolloutFlags.enableEpistemicGuard
    ),
    options: memoryCapsFinal,
    nowIso: nowIsoForEpistemic,
    maxRevealRank: maxRevealRankForMemory,
    runtimeCrossRefNote: epistemicRuntimeCrossRef,
    actorCanonOneLiner: actorCanonOneLinerForMemory,
    actorScopedEpistemicEnabled: epistemicRolloutFlags.enableActorScopedEpistemic,
  });
  memoryBlock = scopedFinal.block;
  const epistemicPromptMetrics = scopedFinal.metrics;

  const controlAugmentation = buildControlAugmentationBlock({
    control: pipelineControl,
    rule: pipelineRule,
    preflightFailed: pipelinePreflightFailed,
  });

  const controlAndLoreAugmentation = [
    contextMode === "minimal" ? "" : controlAugmentation,
    contextMode === "minimal" ? "" : runtimeLoreCompact,
    contextMode === "minimal" ? "" : serviceContextBlock,
    contextMode === "minimal" ? "" : directorHintBlock,
    npcTaskNarrativeBlock,
    conspiracyNarrativeBlock,
    epistemicAlertAugmentation,
    epistemicResiduePlan.augmentationBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const shouldSkipRuntimePacketsForFastLane =
    perfFlags.enableLightweightFastPath &&
    perfFlags.fastLaneSkipRuntimePackets &&
    riskLane === "fast";

  const runtimePackets = shouldSkipRuntimePacketsForFastLane
    ? ""
    : buildRuntimeContextPackets({
        playerContext,
        latestUserInput,
        playerLocation: guessPlayerLocationFromContext(playerContext),
        serviceState,
        runtimeLoreCompact: contextMode === "minimal" ? "" : runtimeLoreCompact,
        contextMode,
        maxChars: contextMode === "minimal" ? 1400 : 4000,
        focusNpcId: focusNpcForPrompt,
      });
  runtimePacketChars = runtimePackets.length;
  runtimePacketTokenEstimate = Math.ceil(runtimePacketChars / 4);
  const npcConsistencyBoundaryFinal = buildNpcConsistencyBoundaryCompactBlock({
    playerContext,
    latestUserInput,
    playerLocation: playerLocForEpistemic,
    focusNpcId: focusNpcForPrompt,
    maxRevealRank: maxRevealRankForMemory,
    epistemic: {
      actorKnownFactCount: epistemicPromptMetrics.actorKnownFactCount,
      publicFactCount: epistemicPromptMetrics.publicFactCount,
      forbiddenFactCount: epistemicPromptMetrics.forbiddenFactCount,
    },
    maxChars: contextMode === "minimal" ? 900 : 1600,
    rollout: {
      enableNpcCanonGuard: epistemicRolloutFlags.enableNpcCanonGuard,
      enableNpcBaselineAttitude: epistemicRolloutFlags.enableNpcBaselineAttitude,
      enableNpcSceneAuthority: epistemicRolloutFlags.enableNpcSceneAuthority,
    },
  });
  const styleGuideBlock = verseRollout.enableStyleGuidePacket ? buildStyleGuidePacketBlock() : "";
  const narrativeContinuityBlock = buildNarrativeContinuityPacketBlock({
    previousTail: extractLastAssistantNarrativeTail(rawChatMessages),
    rawAction: turnRawAction ?? latestUserInput,
    dice: turnDice,
    maxChars: contextMode === "minimal" ? 520 : 900,
  });
  const povBlock = buildPovPacketBlock({ maxChars: contextMode === "minimal" ? 280 : 420 });
  const npcGenderPronounBlock = buildNpcGenderPronounPacketBlock({
    focusNpcId: focusNpcForPrompt,
    presentNpcIds: presentNpcIdsForEpistemic,
    maxChars: contextMode === "minimal" ? 520 : 760,
  });
  const plannedTurnMode = inferPlannedTurnMode({
    latestUserInput,
    shouldApplyFirstActionConstraint,
    clientState,
    pipelineControl,
  });

  /**
   * Phase-2: structured execution backbone.
   *
   * These three layers sit between "input is moderated/safe" and "prompt is
   * assembled". They do NOT replace the legacy post-generation collapse path
   * (resolveDmTurn + guards) — they are the explicit seam that downstream
   * phases will eventually consume end-to-end.
   *
   * Today we treat `preStateDelta` as an *observer* input for runStreamFinalHooks;
   * the authoritative state change still flows through applyDmChangeSetToDmRecord
   * and resolveDmTurn. See `renderNarrativeFromDelta` for the hole-filling seam.
   */
  const normalizedIntent: NormalizedPlayerIntent = normalizePlayerInput({
    latestUserInput,
    control: pipelineControl,
    riskTags: pipelineControl?.risk_tags ?? [],
    isFirstAction: Boolean(isFirstAction),
    shouldApplyFirstActionConstraint: Boolean(shouldApplyFirstActionConstraint),
    clientPurpose,
  });
  const directorDigest =
    clientState && typeof clientState === "object" && !Array.isArray(clientState)
      ? ((clientState as unknown as { directorDigest?: { beatModeHint?: unknown; tension?: unknown } }).directorDigest ?? null)
      : null;
  const turnLaneDecision: TurnLaneDecision = routeTurnLane({
    intent: normalizedIntent,
    riskLane,
    focusNpcId: focusNpcForPrompt,
    directorBeat: typeof directorDigest?.beatModeHint === "string" ? directorDigest.beatModeHint : null,
    directorTension: typeof directorDigest?.tension === "number" ? directorDigest.tension : null,
    epistemicEnabled: epistemicRolloutFlags.enableEpistemicGuard,
  });
  const preStateDelta: StateDelta = computePreNarrativeDelta({
    intent: normalizedIntent,
    control: pipelineControl,
    rule: pipelineRule,
    inputFellBack: inputSafety.decision === "fallback",
    antiCheatFallback: antiCheat.decision === "fallback",
  });
  const turnExecutionContext: TurnExecutionContext = {
    requestId,
    sessionId,
    userId,
    isFirstAction: Boolean(isFirstAction),
    shouldApplyFirstActionConstraint: Boolean(shouldApplyFirstActionConstraint),
    clientPurpose,
    clientState,
    playerContext,
    riskLane,
    pipelineRule,
    pipelineControl,
    plannedTurnMode: plannedTurnMode.mode,
    intent: normalizedIntent,
    lane: turnLaneDecision,
  };
  void turnExecutionContext; // TODO(phase-3): pass through runStreamFinalHooks as single arg.

  // Phase-5: emit lane decision as a formal analytics event so that rollout /
  // rollback tooling can observe lane distribution even though the lane does
  // not yet cause side effects on the hot path. Non-blocking.
  if (sessionId) {
    const capturedSessionIdLane = sessionId;
    void recordGenericAnalyticsEvent({
      eventId: `${requestId}:turn_lane_decided`,
      idempotencyKey: `${requestId}:turn_lane_decided`,
      userId,
      guestId: userId ? null : chatGuestId,
      sessionId: capturedSessionIdLane,
      eventName: "turn_lane_decided",
      eventTime: new Date(),
      page: "/play",
      source: "chat",
      platform,
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        requestId,
        lane: turnLaneDecision.lane,
        reasons: [...turnLaneDecision.reasons],
        confidence: turnLaneDecision.confidence,
        intentKind: normalizedIntent.kind,
        isFirstAction: normalizedIntent.isFirstAction,
        isSystemTransition: normalizedIntent.isSystemTransition,
        riskLane,
      },
    }).catch(() => {});
  }

  const turnModePolicyBlock =
    (verseRollout.enableLongNarrativeMode || verseRollout.enableDecisionTurnMode)
      ? buildTurnModePolicyPacketBlock({
          plannedMode: plannedTurnMode.mode,
          reason: plannedTurnMode.reason,
          maxChars: contextMode === "minimal" ? 680 : 860,
        })
      : "";
  const protagonistAnchorBlock = verseRollout.enableProtagonistAnchorPacket
    ? buildProtagonistAnchorPacketBlock({
        playerContext: playerContextForPrompt,
        clientState,
        maxChars: contextMode === "minimal" ? 760 : 980,
      })
    : "";
  const realityConstraintBlock = verseRollout.enableRealityConstraintPacket
    ? buildRealityConstraintPacketBlock({
        playerContext: playerContextForPrompt,
        latestUserInput,
        playerLocationFallback: guessPlayerLocationFromContext(playerContext),
        clientState,
        maxChars: contextMode === "minimal" ? 980 : 1400,
      })
    : "";
  const dynamicSuffixFull = buildDynamicPlayerDmSystemSuffix({
    memoryBlock,
    playerContext: playerContextForPrompt,
    isFirstAction: shouldApplyFirstActionConstraint,
    runtimePackets,
    controlAugmentation: controlAndLoreAugmentation,
    protagonistAnchorBlock,
    turnModePolicyBlock,
    realityConstraintBlock,
    npcConsistencyBoundaryBlock: npcConsistencyBoundaryFinal.text,
    narrativeContinuityBlock,
    povBlock,
    npcGenderPronounBlock,
    styleGuideBlock,
  });
  const aiEnvForSystem = resolveAiEnv();
  const { safeMessages, stableCharLen, dynamicCharLen } = assemblePlayerChatPrompt({
    stablePrefix: playerDmStablePrefix,
    dynamicSuffix: dynamicSuffixFull,
    splitDualSystem: aiEnvForSystem.splitPlayerChatDualSystem,
    messagesToSend,
  });
  recordPromptCharDelta(dynamicCharLen);

  ttftProfile.promptBuildMs = elapsedMs(promptBuildStartAt);

  const telemetryPreferredModel = DEFAULT_PLAYER_ROLE_CHAIN[0];
  void recordGenericAnalyticsEvent({
    eventId: `${requestId}:chat_request_started`,
    idempotencyKey: `${requestId}:chat_request_started`,
    userId,
    guestId: userId ? null : chatGuestId,
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
      epistemicFactCount: epistemicPromptMetrics.epistemicFactCount,
      actorKnownFactCount: epistemicPromptMetrics.actorKnownFactCount,
      publicFactCount: epistemicPromptMetrics.publicFactCount,
      forbiddenFactCount: epistemicPromptMetrics.forbiddenFactCount,
      anomalySeverity: epistemicPromptMetrics.anomalySeverity,
      validatorTriggered: epistemicPromptMetrics.validatorTriggered,
      promptCharsDelta: epistemicPromptMetrics.promptCharsDelta,
      promptCharDelta: epistemicPromptMetrics.promptCharsDelta,
      actorScopedMemoryBlockChars: epistemicPromptMetrics.blockChars,
      npcConsistencyBoundaryEnabled: npcConsistencyBoundaryFinal.npcConsistencyBoundaryEnabled,
      npcConsistencyBoundaryChars: npcConsistencyBoundaryFinal.charCount,
      epistemicRollout: epistemicRolloutFlags,
    },
  }).catch(() => {});

  /** 渚涚粓甯у啓鍏?global cache 鏃跺榻?world_revision锛堟柟妗?B锛歱reflight 鍚庤鍙栵級銆侾ool max=10锛屼粎鐭煡璇€?*/
  const kgCacheWorldRevision: { current: bigint | null } = { current: null };
  /**
   * KG 鍏ㄥ眬璇箟缂撳瓨鍛戒腑鏃跺彲浠ョ洿鎺ヨ繑鍥烇紙鐪熷疄寤惰繜浼樺寲锛夈€?   * 浣?miss/鎱㈡煡璇笉搴旀垚涓?TTFT 鐨勯瀛楀墠闃诲椤癸紙棣栧瓧浼樺厛锛夈€?   */
  const KG_CACHE_EARLY_BUDGET_MS = 42;
  const enableKgCacheEarlyBudget = envBoolean("AI_CHAT_ENABLE_KG_CACHE_EARLY_BUDGET", true);
  let kgCacheEarlyBudgetHit = false;
  const codexCacheEarly = kgEnabled
    ? enableKgCacheEarlyBudget
      ? await Promise.race([
          tryServeCodexFromGlobalCache({
            kgRoute,
            latestUserInput,
            requestId,
            userId,
            guestId: userId ? null : chatGuestId,
            sessionId,
            platform,
            onWorldRevision: (rev) => {
              kgCacheWorldRevision.current = rev;
            },
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => {
              kgCacheEarlyBudgetHit = true;
              resolve(null);
            }, KG_CACHE_EARLY_BUDGET_MS)
          ),
        ])
      : await tryServeCodexFromGlobalCache({
          kgRoute,
          latestUserInput,
          requestId,
          userId,
          guestId: userId ? null : chatGuestId,
          sessionId,
          platform,
          onWorldRevision: (rev) => {
            kgCacheWorldRevision.current = rev;
          },
        })
    : null;
  if (codexCacheEarly) return codexCacheEarly;
  if (kgEnabled && kgCacheEarlyBudgetHit) {
    logAiTelemetry({
      requestId,
      task: "PLAYER_CHAT",
      providerId: "oneapi",
      logicalRole: "control",
      phase: "preflight_budget",
      message: `kg_cache_early_budget_hit budget_ms=${KG_CACHE_EARLY_BUDGET_MS}`,
      userId,
    });
  }

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
      // #region agent log
      fetch("http://127.0.0.1:7873/ingest/0434b5a7-7f9a-46e8-9419-36678c4433f6", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5f6062" },
        body: JSON.stringify({
          sessionId: "5f6062",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "src/app/api/chat/route.ts:anyAiProviderConfigured",
          message: "provider configuration missing after reload",
          data: {
            requestId,
            gatewayConfigured: Boolean(ai.gatewayBaseUrl && ai.gatewayApiKey),
            gatewayKeyLen: ai.gatewayApiKey.length,
            mainModelConfigured: ai.modelsByRole.main.length > 0,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }
    console.warn(
      `[api/chat] No AI gateway configured (AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY / AI_MODEL_MAIN). See .env.example. Returning degraded SSE with 200.`
    );
    return createSseResponse({
      requestId,
      status: 200,
      extras: { "X-VerseCraft-Ai-Status": "keys_missing" },
      payload: JSON.stringify({
        is_action_legal: false,
        sanity_damage: 0,
        narrative: "系统异常：未配置大模型 API Key，无法连接深渊 DM。",
        is_death: false,
        consumes_time: true,
      }),
    });
  }

  const FALLBACK_NARRATIVE =
    "游戏主脑暂时离线，请稍后再试。";
  const enableStatusFrames = envBoolean("AI_CHAT_ENABLE_STATUS_FRAMES", true);
  const SSE_HEADERS = buildSseHeaders(requestId);

  const fallbackPayload = JSON.stringify({
    is_action_legal: false,
    sanity_damage: 0,
    narrative: FALLBACK_NARRATIVE,
    is_death: false,
    consumes_time: true,
  });

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const emitTtftProfileSummary = (phase: "first_sse_write" | "stream_end", finishedAt?: number): void => {
    if (process.env.NODE_ENV === "production") return;
    const firstWriteAt = ttftProfile.firstSseWriteAt;
    const firstChunkAt = ttftProfile.firstValidStreamChunkAt;
    const connectStart = ttftProfile.generateMainReplyStartedAt;
    const totalTTFT = firstWriteAt !== null ? Math.max(0, firstWriteAt - ttftProfile.requestReceivedAt) : null;
    const upstreamConnectMs =
      connectStart !== null && firstChunkAt !== null ? Math.max(0, firstChunkAt - connectStart) : null;
    const blockingBeforeFirstTokenMs = totalTTFT;
    const postFirstTokenMs =
      finishedAt !== undefined && firstWriteAt !== null ? Math.max(0, finishedAt - firstWriteAt) : null;
    const stagePairs: Array<[string, number]> = [
      ["validate", ttftProfile.validateChatRequestMs ?? 0],
      ["input_safety", ttftProfile.moderateInputOnServerMs ?? 0],
      ["pre_input", ttftProfile.preInputModerationMs ?? 0],
      ["quota", ttftProfile.quotaCheckMs ?? 0],
      ["session_memory", ttftProfile.sessionMemoryReadMs ?? 0],
      ["preflight", ttftProfile.controlPreflightMs ?? 0],
      ["lore", ttftProfile.loreRetrievalMs ?? 0],
      ["prompt_build", ttftProfile.promptBuildMs ?? 0],
      ["upstream_connect", upstreamConnectMs ?? 0],
    ];
    const slowest = stagePairs.sort((a, b) => b[1] - a[1])[0] ?? ["unknown", 0];
    console.info("[api/chat][ttft_profile]", {
      phase,
      requestId,
      totalTTFT,
      blockingBeforeFirstTokenMs,
      postFirstTokenMs,
      validateMs: ttftProfile.validateChatRequestMs,
      inputSafetyMs: ttftProfile.moderateInputOnServerMs,
      preInputModerationMs: ttftProfile.preInputModerationMs,
      lane: ttftProfile.lane,
      laneReasons: laneDecision.reasons,
      quotaCheckMs: ttftProfile.quotaCheckMs,
      sessionMemoryMs: ttftProfile.sessionMemoryReadMs,
      preflightMs: ttftProfile.controlPreflightMs,
      loreMs: ttftProfile.loreRetrievalMs,
      promptBuildMs: ttftProfile.promptBuildMs,
      generateMainReplyStartDeltaMs:
        connectStart !== null ? Math.max(0, connectStart - ttftProfile.requestReceivedAt) : null,
      upstreamConnectMs,
      firstChunkDeltaMs:
        firstChunkAt !== null ? Math.max(0, firstChunkAt - ttftProfile.requestReceivedAt) : null,
      firstSseWriteDeltaMs:
        firstWriteAt !== null ? Math.max(0, firstWriteAt - ttftProfile.requestReceivedAt) : null,
      perfFlags,
    });
    if (phase === "first_sse_write" && totalTTFT !== null) {
      const agg = pushAndSummarizeTtft({
        t: nowMs(),
        totalTTFT,
        slowestStage: slowest[0],
        slowestMs: slowest[1],
      });
      console.info("[api/chat][ttft_aggregate]", {
        sampleCount: agg.sampleCount,
        avgTTFT: Math.round(agg.avg),
        p95TTFT: Math.round(agg.p95),
        slowestStage: agg.slowestStageTop,
        latestSlowestStage: slowest[0],
        latestSlowestMs: Math.round(slowest[1]),
      });
    }
  };
  const writeToStream = async (data: string) => {
    if (ttftProfile.firstSseWriteAt === null) {
      // 棣栧瓧鍐欏叆 SSE锛氳繖鏄帺瀹跺疄闄呮劅鐭ュ埌鈥滃紑濮嬪搷搴斺€濈殑鏃跺埢銆?      ttftProfile.firstSseWriteAt = nowMs();
      emitTtftProfileSummary("first_sse_write");
    }
    return writer.write(sse(data));
  };
  const writeControlToStream = async (data: string) => writer.write(sse(data));
  const writeStatusFrame = async (
    stage:
      | "request_sent"
      | "routing"
      | "context_building"
      | "generating"
      | "streaming"
      | "finalizing",
    message: string
  ) => {
    if (!enableStatusFrames) return;
    statusFrameCount += 1;
    return writeControlToStream(buildStatusFramePayload({ stage, message, requestId }));
  };
  const closeWithFallback = async () => {
    try {
      await writeToStream(fallbackPayload);
    } finally {
      await writer.close();
    }
  };

  const MIN_STREAM_OUTPUT_CHARS = 24;
  const enableStreamReconnectLimits = envBoolean("AI_CHAT_ENABLE_STREAM_RECONNECT_LIMITS", true);
  const MAX_STREAM_SOURCE_ROUNDS = enableStreamReconnectLimits ? 2 : 3;
  /**
   * Pipeline-level abort signal for non-upstream steps (enhance / options fix / post hooks).
   *
   * Phase-2 note:
   * - Upstream `generateMainReply()` uses per-attempt AbortControllers with strict TIMEOUT_MS.
   * - Everything else shares this signal so we can still cancel best-effort steps if needed later.
   */
  const pipelineAbort = new AbortController();
  const routingReport: AiRoutingReport = {
    requestId,
    task: "PLAYER_CHAT",
    operationMode: resolveOperationMode(),
    intendedRole: DEFAULT_PLAYER_ROLE_CHAIN[0] as AiLogicalRole,
    actualLogicalRole: null,
    fallbackCount: 0,
    attempts: [],
    finalStatus: "upstream_exhausted",
  };
  const skippedStreamRoles: AiLogicalRole[] = [];
  let streamSource: PlayerChatStreamSuccess | null = null;
  let streamRound = 0;
  let streamReconnectCount = 0;
  let streamInterruptedCount = 0;
  let streamEmptyCount = 0;
  let statusFrameCount = 0;
  let tokenUsageFlushedGlobal = false;
  let lastEnhanceAnalytics: EnhanceAfterMainStreamResult | null = null;
  let enhancePathDmParsed = false;
  let finalJsonParseSuccess = false;
  let settlementGuardApplied = false;
  let settlementAwardPruned = 0;
  let epistemicPostValidatorTelemetry: EpistemicValidatorTelemetry | null = null;

  (async () => {
    await writeStatusFrame("request_sent", "行动已送出");
    await writeStatusFrame("routing", "姝ｅ湪杩炴帴娣辨笂");

    const TIMEOUT_MS = 60000;
    const callUpstreamOnce = async (args: { skipRoles?: readonly AiLogicalRole[]; markStart?: boolean }) => {
      const ac = new AbortController();
      const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        if (args.markStart) {
          // 涓婃父涓绘ā鍨嬭皟鐢ㄨ捣鐐癸細鐢ㄤ簬璁＄畻 upstream connect 鍒伴鍖呯殑绾綉缁?涓婃父绛夊緟鑰楁椂銆?          ttftProfile.generateMainReplyStartedAt = nowMs();
        }
        return await generateMainReply({
          messages: safeMessages,
          ctx: {
            requestId,
            userId,
            sessionId,
            path: "/api/chat",
            tags: { clientPurpose, riskLane },
          },
          signal: ac.signal,
          timeoutMs: TIMEOUT_MS,
          skipRoles: args.skipRoles,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const first = await callUpstreamOnce({ markStart: true });
    if (!first.ok) {
      const isTimeout = first.code === "ABORTED";
      console.error(`\x1b[31m[api/chat] AI router failed\x1b[0m`, {
        code: first.code,
        message: first.message,
        lastHttpStatus: first.lastHttpStatus,
      });
      void recordGenericAnalyticsEvent({
        eventId: `${requestId}:chat_request_finished_error`,
        idempotencyKey: `${requestId}:chat_request_finished_error`,
        userId,
        guestId: userId ? null : chatGuestId,
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
          routerCode: first.code,
          totalLatencyMs: Date.now() - requestStartedAt,
          preflightRan: preflightTurnMetrics.ran,
          preflightSkippedReason: preflightTurnMetrics.skippedReason,
          preflightCacheHit: preflightTurnMetrics.cacheHit,
          preflightLatencyMs: preflightTurnMetrics.latencyMs,
          preflightOk: preflightTurnMetrics.ok,
          preflightBudgetHit: controlPreflightBudgetHit,
        },
      }).catch(() => {});

      const upstreamStatus = first.lastHttpStatus ?? 0;
      const attemptsForHint = first.httpAttempts ?? [];
      const lastWithBody = [...attemptsForHint].reverse().find((a) => typeof a.httpStatus === "number" && a.message);
      const hintFields = parseUpstreamErrorFields(lastWithBody?.message);
      const degraded = {
        is_action_legal: false,
        sanity_damage: 0,
        narrative: isTimeout ? "深渊回声超时，请稍后重试。" : "深渊主脑暂时离线，请稍后重试。",
        is_death: false,
        consumes_time: true,
        security_meta: {
          action: "degrade",
          stage: "ai_router",
          reason: first.code,
          upstream_status: upstreamStatus || undefined,
          ...(hintFields.upstreamCode ? { upstream_code: hintFields.upstreamCode } : {}),
        },
      };
      try {
        await writeStatusFrame("finalizing", "连接失败，正在降级");
        await writeToStream(JSON.stringify(degraded));
      } finally {
        await writer.close();
      }
      return;
    }

    const srOk = first as PlayerChatStreamSuccess;
    streamSource = srOk;
    routingReport.operationMode = srOk.operationMode;
    routingReport.intendedRole = srOk.intendedLogicalRole;
    routingReport.actualLogicalRole = srOk.logicalRole;
    routingReport.attempts = [...srOk.httpAttempts];
    routingReport.fallbackCount = srOk.httpAttempts.filter((a) => a.failureKind !== undefined).length;
    routingReport.finalStatus = "success";

    const scheduleStreamReconnect = async (
      failedRole: AiLogicalRole,
      kind: "STREAM_INTERRUPTED" | "EMPTY_CONTENT"
    ): Promise<boolean> => {
      if (streamRound >= MAX_STREAM_SOURCE_ROUNDS) return false;
      if (enableStreamReconnectLimits) {
        // Avoid repeated same-kind reconnects in one turn.
        if (kind === "STREAM_INTERRUPTED" && streamInterruptedCount >= 1) return false;
        if (kind === "EMPTY_CONTENT" && streamEmptyCount >= 1) return false;
        // Do not reconnect after long wall time; prefer fallback to avoid dragging minutes.
        if (Date.now() - requestStartedAt > 40_000) return false;
      }
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
      const next = await callUpstreamOnce({ skipRoles: skippedStreamRoles });
      if (!next.ok) return false;
      streamSource = next as PlayerChatStreamSuccess;
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
      const digest = buildPlayerContextDigest(playerContext ?? "");
      const lastUserText = safeMessages.slice().reverse().find((m) => m.role === "user")?.content ?? "";
      void recordChatActionCompletedAnalytics({
        eventId: `${requestId}:chat_action_completed`,
        idempotencyKey: `${requestId}:chat_action_completed`,

        userId,
        sessionId: sessionId ?? "unknown_session",
        guestId: userId ? null : chatGuestId,
        page: "/play",
        source: "chat",
        platform,

        tokenCost: toPersist,
        playDurationDeltaSec: 0,

        payload: {
          requestId,
          upstreamLogicalRole: routingReport.actualLogicalRole ?? args.streamRole,
          actor: {
            actorType: userId ? "user" : "guest",
            professionCurrent: digest.professionCurrent,
            professionCertified: digest.professionCertified ? 1 : 0,
            professionTrialOffered: digest.professionTrialOffered ? 1 : 0,
            professionTrialAccepted: digest.professionTrialAccepted ? 1 : 0,
          },
          weapon: {
            weaponId: digest.weaponId,
            contamination: digest.weaponContamination,
            repairable: digest.weaponRepairable,
            needsMaintenance: digest.weaponNeedsMaintenance ? 1 : 0,
            pollutionHigh: digest.weaponPollutionHigh ? 1 : 0,
            weaponizationAttempted: inferWeaponizationAttempted(lastUserText) ? 1 : 0,
          },
          guide: {
            liuSeen: digest.guideHitLiu ? 1 : 0,
            linzSeen: digest.guideHitLinz ? 1 : 0,
          },
        },
      }).catch(() => {});

      const finishedAt = Date.now();
      // 缁堝抚闃舵锛堥瀛楀悗锛夎€楁椂鐢诲儚锛氱敤浜庝笌棣栧瓧鍓嶉樆濉炴媶鍒嗭紝閬垮厤璇妸鍚庡鐞嗗綋 TTFT 闂銆?      emitTtftProfileSummary("stream_end", finishedAt);
      void recordGenericAnalyticsEvent({
        eventId: `${requestId}:chat_request_finished`,
        idempotencyKey: `${requestId}:chat_request_finished`,
        userId,
        guestId: userId ? null : chatGuestId,
        sessionId: sessionId ?? "unknown_session",
        eventName: "chat_request_finished",
        eventTime: new Date(),
        page: "/play",
        source: "chat",
        platform,
        tokenCost: toPersist,
        playDurationDeltaSec: 0,
        payload: (() => {
          const base = buildChatRequestFinishedPayload({
          requestId,
          model: routingReport.actualLogicalRole ?? args.streamRole,
          gatewayModel: args.gatewayModel,
          success: !args.streamBlocked,
          firstChunkAt: args.firstChunkAt,
          requestStartedAt,
          finishedAt,
          isFirstAction,
          riskLane: riskLane === "fast" ? "fast" : "slow",
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
          upstreamConnectMs:
            ttftProfile.generateMainReplyStartedAt !== null && args.firstChunkAt > 0
              ? Math.max(0, args.firstChunkAt - ttftProfile.generateMainReplyStartedAt)
              : null,
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
          statusFrameCount,
          finalJsonParseSuccess,
          settlementGuardApplied,
          settlementAwardPruned,
          });

          const vTypes = epistemicPostValidatorTelemetry?.violationTypes ?? [];
          const epistemicRollupPayload = {
            rolloutFlags: epistemicRolloutFlags,
            actorNpcId: focusNpcForPrompt,
            actorKnownFactCount: epistemicPromptMetrics.actorKnownFactCount,
            publicFactCount: epistemicPromptMetrics.publicFactCount,
            forbiddenFactCount: epistemicPromptMetrics.forbiddenFactCount,
            epistemicFactCount: epistemicPromptMetrics.epistemicFactCount,
            anomalyDetected: Boolean(epistemicAnomalyResult?.anomaly),
            anomalySeverity: epistemicAnomalyResult?.anomaly ? epistemicAnomalyResult.severity : "none",
            validatorTriggered: epistemicPostValidatorTelemetry?.validatorTriggered ?? false,
            rewriteTriggered: epistemicPostValidatorTelemetry?.rewriteTriggered ?? false,
            responseSafe: epistemicPostValidatorTelemetry?.finalResponseSafe ?? true,
            promptCharsDelta: epistemicPromptMetrics.promptCharsDelta,
            promptCharDelta: epistemicPromptMetrics.promptCharsDelta,
            firstChunkLatencyMs: typeof base.firstChunkLatencyMs === "number" ? base.firstChunkLatencyMs : null,
            dynamicCharLen,
            actorScopedMemoryBlockChars: epistemicPromptMetrics.blockChars,
            npcConsistencyBoundaryEnabled: npcConsistencyBoundaryFinal.npcConsistencyBoundaryEnabled,
            npcConsistencyBoundaryChars: npcConsistencyBoundaryFinal.charCount,
            npcConsistencyValidatorTriggered: epistemicPostValidatorTelemetry?.npcConsistencyValidatorTriggered ?? false,
            npcConsistencyViolationTypes: vTypes,
            npcCanonFallbackCount:
              focusNpcForPrompt && !isRegisteredCanonicalNpcId(focusNpcForPrompt) ? 1 : 0,
            npcLocationMismatchCount: vTypes.includes("offscreen_npc_dialogue") ? 1 : 0,
            npcGenderMismatchCount: vTypes.includes("gender_pronoun_mismatch") ? 1 : 0,
            npcAttitudeViolationCount:
              vTypes.includes("normal_npc_old_friend_tone") || vTypes.includes("no_reaction_to_boundary_crossing")
                ? 1
                : 0,
            npcPrivilegeViolationCount:
              vTypes.includes("loop_truth_premature") ||
              vTypes.includes("familiarity_overreach") ||
              vTypes.includes("world_truth_premature") ||
              vTypes.includes("private_fact_leak")
                ? 1
                : 0,
            npcConsistencyRewriteCount: epistemicPostValidatorTelemetry?.rewriteTriggered ? 1 : 0,
            personalityDriftCount: epistemicPostValidatorTelemetry?.personalityDriftCount ?? 0,
            foreshadowLeakCount: epistemicPostValidatorTelemetry?.foreshadowLeakCount ?? 0,
            taskModeMismatchCount: epistemicPostValidatorTelemetry?.taskModeMismatchCount ?? 0,
            timeFeelMismatchCount: epistemicPostValidatorTelemetry?.timeFeelMismatchCount ?? 0,
            narrativeRhythmRewriteTriggered: epistemicPostValidatorTelemetry?.narrativeRhythmRewriteTriggered ?? false,
            narrativeRhythmFinalSafe: epistemicPostValidatorTelemetry?.narrativeRhythmFinalSafe ?? true,
            npcPersonalityPacketChars: epistemicPostValidatorTelemetry?.npcPersonalityPacketChars ?? 0,
            majorNpcDifferentiationScore: epistemicPostValidatorTelemetry?.majorNpcDifferentiationScore ?? null,
            taskModeDistribution: epistemicPostValidatorTelemetry?.taskModeDistribution,
            fineTimeCostUsage: epistemicPostValidatorTelemetry?.fineTimeCostUsage ?? 0,
            personalityRewriteCount: epistemicPostValidatorTelemetry?.personalityRewriteCount ?? 0,
            avgFormalTaskDelayFromFirstContact:
              epistemicPostValidatorTelemetry?.avgFormalTaskDelayFromFirstContact ?? null,
            residueTriggeredCount: Boolean(epistemicResiduePlan.packet) ? 1 : 0,
          };
          const withEpistemicCore = { ...base, epistemicRollup: epistemicRollupPayload };
          const withEpistemicPost =
            epistemicPostValidatorTelemetry != null
              ? { ...withEpistemicCore, epistemicPostValidator: epistemicPostValidatorTelemetry }
              : withEpistemicCore;

          const diagEnabled = envBoolean(
            "AI_CHAT_ENABLE_DIAGNOSTICS",
            process.env.NODE_ENV === "development"
          );
          if (!diagEnabled) return withEpistemicPost;

          const firstWriteAt = ttftProfile.firstSseWriteAt;
          const firstChunkAt = ttftProfile.firstValidStreamChunkAt;
          const connectStart = ttftProfile.generateMainReplyStartedAt;
          const upstreamConnectMs =
            connectStart !== null && firstChunkAt !== null ? Math.max(0, firstChunkAt - connectStart) : null;
          const totalTtftMs =
            firstWriteAt !== null ? Math.max(0, firstWriteAt - ttftProfile.requestReceivedAt) : null;

          return {
            ...withEpistemicPost,
            serverPerf: {
              requestReceivedAt: ttftProfile.requestReceivedAt,
              jsonParseMs: ttftProfile.jsonParseMs,
              authSessionMs: ttftProfile.authSessionMs,
              validateChatRequestMs: ttftProfile.validateChatRequestMs,
              moderateInputOnServerMs: ttftProfile.moderateInputOnServerMs,
              preInputModerationMs: ttftProfile.preInputModerationMs,
              quotaCheckMs: ttftProfile.quotaCheckMs,
              sessionMemoryReadMs: ttftProfile.sessionMemoryReadMs,
              controlPreflightMs: ttftProfile.controlPreflightMs,
              loreRetrievalMs: ttftProfile.loreRetrievalMs,
              promptBuildMs: ttftProfile.promptBuildMs,
              upstreamConnectMs,
              firstSseWriteDeltaMs:
                firstWriteAt !== null ? Math.max(0, firstWriteAt - ttftProfile.requestReceivedAt) : null,
              totalTtftMs,
              lane: ttftProfile.lane,
            },
          };
        })(),
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
      await writeStatusFrame("finalizing", "正在收束本回合");

      let commitSummaryForAnalytics: TurnCommitSummary | null = null;

      /**
       * Turn-compiler phases (Phase-2 of the structural refactor).
       *
       * Execution order is preserved:
       *   parse/normalize -> guards -> validator -> resolveDmTurn -> commit side effects.
       *
       * Each phase is a local closure that reads the outer request state
       * (requestId, playerContext, pipelineControl, ...) and returns the next
       * `dmRecord`. Analytics side-state (`finalJsonParseSuccess`,
       * `enhancePathDmParsed`, `lastEnhanceAnalytics`, `settlementGuardApplied`,
       * `settlementAwardPruned`, `epistemicPostValidatorTelemetry`) is still
       * mutated on the outer closure for backward-compatibility with the
       * existing analytics pipeline.
       *
       * TODO(phase-3): pass `turnExecutionContext` + `postStateDelta` as
       * explicit arguments instead of capturing the outer closure, and move
       * the remaining inline sections (protocol guard, options regen, turn
       * mode correction, resolve, commit) into their own exported modules.
       */

      // --- Phase 1: parse / normalize candidate DM record ---
      const phaseParseAndNormalizeCandidate = (): Record<string, unknown> | null => {
        const parsedRoot = parseAccumulatedPlayerDmJson(accumulatedText);
        const rec = parsedRoot !== null ? normalizePlayerDmJson(parsedRoot) : null;
        finalJsonParseSuccess = rec !== null;
        if (!rec) return null;
        return applyDmChangeSetToDmRecord(rec, { clientState, requestId });
      };

      // --- Phase 2: structural guards (pre-enhance) ---
      const phaseApplyStructuralGuards = (
        dm: Record<string, unknown>
      ): Record<string, unknown> => {
        let rec = dm;
        rec = applyB1ServiceExecutionGuard({
          dmRecord: rec,
          latestUserInput,
          playerContext,
          clientState,
        });
        rec = applyEquipmentExecutionGuard({
          dmRecord: rec,
          latestUserInput,
          playerContext,
          clientState,
        });
        rec = applyB1SafetyGuard({
          dmRecord: rec,
          fallbackLocation: guessPlayerLocationFromContext(playerContext),
        });
        rec = applyMainThreatUpdateGuard({ dmRecord: rec, playerContext });
        rec = applyWeaponTacticalAdjudication({
          dmRecord: rec,
          playerContext,
          latestUserInput,
          requestId,
        });
        rec = normalizeDmTaskPayload(rec);
        rec = ensure7FConspiracyTask(rec, { playerContext, latestUserInput });
        rec = applyNpcProactiveGrantGuard({ dmRecord: rec, playerContext });
        const npcGrantFallbackBlock = buildNpcGrantFallbackNarrativeBlock(rec);
        if (npcGrantFallbackBlock && typeof rec.narrative === "string") {
          const existing = String(rec.narrative ?? "");
          if (!existing.includes("绯荤粺鍙戞斁浠诲姟")) {
            rec.narrative = `${existing}\n\n${npcGrantFallbackBlock}`;
          }
        }
        return rec;
      };

      // --- Phase 3: enhance scene (optional) + stage-2 settlement ---
      const phaseEnhanceAndSettle = async (
        dm: Record<string, unknown>
      ): Promise<Record<string, unknown>> => {
        let rec = dm;
        enhancePathDmParsed = true;
        const enhanceWallStart = Date.now();
        try {
          lastEnhanceAnalytics = await enhanceScene({
            accumulatedJsonText: accumulatedText,
            control: pipelineControl,
            rule: pipelineRule,
            mode: routingReport.operationMode,
            baseCtx: { requestId, userId, sessionId, path: "/api/chat" },
            signal: pipelineAbort.signal,
            isFirstAction,
            playerContext,
            latestUserInput,
            enhanceBudgetMs: preflightEnv.narrativeEnhanceBudgetMs,
          });
          if (lastEnhanceAnalytics.kind === "applied") {
            const next = normalizePlayerDmJson(lastEnhanceAnalytics.dm);
            if (next) rec = next;
          }
        } catch (e) {
          console.warn("[api/chat] optional narrative enhancement skipped", e);
          lastEnhanceAnalytics = {
            kind: "skipped",
            reason: "exception",
            wallMs: Math.max(0, Date.now() - enhanceWallStart),
          };
        }
        return applyStage2SettlementGuard(rec);
      };

      let dmRecord = phaseParseAndNormalizeCandidate();

      let moderationBody = accumulatedText;
      let finalizePayload: string | null = null;

      if (dmRecord) {
        dmRecord = phaseApplyStructuralGuards(dmRecord);
        dmRecord = await phaseEnhanceAndSettle(dmRecord);

        // --- Phase 4: protocol validator (narrative contamination) ---
        /**
         * 鏈€缁堣緭鍑哄己瑁佸喅灞傦紙鏈嶅姟绔級锛?         * - 浠讳綍鍙戦€佸埌鍓嶇鐨?narrative 蹇呴』鍏堣繃鍑€鍖栵紱
         * - 缁撴瀯瀛楁锛坕nventory/task/location 绛夛級鍙俊 JSON 缁撴瀯锛屼笉淇?narrative 鏂囨湰锛?         * - 鍛戒腑娉勬紡骞舵棤娉曞噣鍖栨椂鐩存帴闄嶇骇锛屼笉鎶婂崗璁墖娈甸€忎紶缁欑帺瀹躲€?         */
        try {
          const narrative = String(dmRecord.narrative ?? "");
          const sanitized = sanitizeNarrativeLeakageForFinal(narrative);
          if (sanitized.degraded) {
            const prevMeta =
              dmRecord.security_meta && typeof dmRecord.security_meta === "object" && !Array.isArray(dmRecord.security_meta)
                ? (dmRecord.security_meta as Record<string, unknown>)
                : {};
            dmRecord.narrative = sanitized.narrative;
            dmRecord.is_action_legal = false;
            dmRecord.consumes_time = false;
            dmRecord.security_meta = {
              ...prevMeta,
              action: "degrade",
              stage: "final_output",
              protocol_guard: "narrative_contaminated",
              protocol_guard_flags: sanitized.flags,
            };
            console.warn("[api/chat] narrative protocol leakage degraded", {
              requestId,
              sessionId,
              userId,
              flags: sanitized.flags,
              role: routingReport.actualLogicalRole ?? streamSource.logicalRole,
            });
            void recordGenericAnalyticsEvent({
              eventId: `${requestId}:narrative_protocol_leak`,
              idempotencyKey: `${requestId}:narrative_protocol_leak`,
              userId,
              guestId: userId ? null : chatGuestId,
              sessionId: sessionId ?? "unknown_session",
              eventName: "narrative_protocol_leak",
              eventTime: new Date(),
              page: "/play",
              source: "chat",
              platform,
              tokenCost: 0,
              playDurationDeltaSec: 0,
              payload: {
                requestId,
                flags: sanitized.flags,
                role: routingReport.actualLogicalRole ?? streamSource.logicalRole,
              },
            }).catch(() => {});
          } else {
            dmRecord.narrative = sanitized.narrative;
          }
        } catch (e) {
          console.warn("[api/chat] protocol guard skipped", e);
        }

        // --- Phase 5: pre-resolve options regen (guard-level) ---
        try {
          const rawOpts = Array.isArray((dmRecord as { options?: unknown }).options)
            ? ((dmRecord as { options?: unknown }).options as unknown[])
                .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : [];
          // Filter out non-narrative options (e.g. "查看灵感手记", "检查背包") before counting,
          // so the regen triggers when the model only generated UI/menu-type options.
          const opts = filterNarrativeActionOptions(rawOpts, 4);
          const preResolveGuard =
            dmRecord.security_meta && typeof dmRecord.security_meta === "object" && !Array.isArray(dmRecord.security_meta)
              ? (dmRecord.security_meta as Record<string, unknown>)
              : null;
          const preResolveFreeze = preResolveGuard?.settlement_guard === "stage2_freeze_on_illegal_or_death";
          if (opts.length < 2 && !preResolveFreeze) {
            const regen = await generateOptionsOnlyFallback({
              narrative: String(dmRecord.narrative ?? ""),
              latestUserInput,
              playerContext,
              ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { phase: "final_hooks" } },
              signal: pipelineAbort.signal,
              budgetMs: 4500,
            });
            if (regen.ok) {
              (dmRecord as Record<string, unknown>).options = regen.options;
            }
          }
        } catch (e) {
          console.warn("[api/chat] options regen skipped", e);
        }

        // --- Phase 6: epistemic post-generation validator ---
        // Phase-1 涓€鑷存€ф敹鍙ｅ湪鏈€缁?envelope 涓粺涓€瑁佸喅锛堝惈 acquire 璇箟闄嶇骇锛夛紝姝ゅ涓嶅啀浠呮墦 warning銆?
        const guardMeta =
          dmRecord.security_meta && typeof dmRecord.security_meta === "object" && !Array.isArray(dmRecord.security_meta)
            ? (dmRecord.security_meta as Record<string, unknown>)
            : null;
        settlementGuardApplied = typeof guardMeta?.settlement_guard === "string";
        const prunedRaw = Number(guardMeta?.settlement_award_pruned ?? 0);
        settlementAwardPruned = Number.isFinite(prunedRaw) ? Math.max(0, Math.trunc(prunedRaw)) : 0;

        const runEpistemicPostGuard = (rec: Record<string, unknown>): Record<string, unknown> => {
          const { dmRecord: next, telemetry } = applyNpcConsistencyPostGeneration({
            dmRecord: rec,
            actorNpcId: focusNpcForPrompt,
            presentNpcIds: presentNpcIdsForEpistemic,
            allFacts: allEpistemicFactsForPrompt,
            profile: epistemicProfileForPrompt,
            anomalyResult: epistemicAnomalyResult,
            nowIso: nowIsoForEpistemic,
            maxRevealRank: maxRevealRankForMemory,
            canonical: focusNpcForPrompt ? getNpcCanonicalIdentity(focusNpcForPrompt) : null,
            playerContext,
            latestUserInput,
          });
          epistemicPostValidatorTelemetry = telemetry;
          return next;
        };
        dmRecord = runEpistemicPostGuard(dmRecord);

        // --- Phase 7: turn mode correction (narrative_only / decision_required) ---
        try {
          const rollout = getVerseCraftRolloutFlags();
          if (!rollout.enableLongNarrativeMode && !rollout.enableDecisionTurnMode) {
            throw new Error("turn_mode_rollout_disabled");
          }
          const dm = dmRecord as Record<string, unknown>;
          const rawPhase2Opts = Array.isArray(dm.options) ? dm.options : [];
          // Filter out non-narrative options (e.g. "查看灵感手记") so they don't prevent regen.
          const optCount = filterNarrativeActionOptions(
            rawPhase2Opts.filter((x): x is string => typeof x === "string" && x.trim().length > 0),
            4
          ).length;
          if (plannedTurnMode.mode === "narrative_only") {
            if (optCount > 0) {
              dm.turn_mode = "narrative_only";
              dm.options = [];
              dm.decision_options = [];
              dm.decision_required = false;
              dm.auto_continue_hint = typeof dm.auto_continue_hint === "string" && dm.auto_continue_hint.trim()
                ? dm.auto_continue_hint
                : "锛堢户缁級";
            } else {
              dm.turn_mode = typeof dm.turn_mode === "string" ? dm.turn_mode : "narrative_only";
              dm.decision_required = false;
            }
          } else if (plannedTurnMode.mode === "decision_required") {
            const decision = Array.isArray((dm as any).decision_options) ? ((dm as any).decision_options as unknown[]) : [];
            const decCount = filterNarrativeActionOptions(
              decision.filter((x): x is string => typeof x === "string" && x.trim().length > 0),
              4
            ).length;
            if (optCount < 2 && decCount < 2) {
              recordDecisionOptionsFixOutcome(false);
              const regen = await generateDecisionOptionsOnlyFallback({
                narrative: String(dm.narrative ?? ""),
                latestUserInput,
                playerContext,
                ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { phase: "final_hooks", purpose: "decision_options_fix" } },
                signal: pipelineAbort.signal,
                budgetMs: 2200,
              });
              if (regen.ok) {
                recordDecisionOptionsFixOutcome(true);
                dm.turn_mode = "decision_required";
                dm.decision_required = true;
                dm.decision_options = regen.decision_options;
                // Backward-compatible: also mirror into legacy options for current UI.
                dm.options = regen.decision_options;
              }
            } else {
              dm.turn_mode = typeof dm.turn_mode === "string" ? dm.turn_mode : "decision_required";
              dm.decision_required = true;
            }
          }
        } catch (e) {
          console.warn("[api/chat] turn mode correction skipped", e);
        }

        // --- Phase 8: resolve DM turn envelope + decision quality gate + post-resolve regen ---
        let resolved = resolveDmTurn(dmRecord);
        // Phase-2 hook: enrich the post-narrative state delta from the resolved envelope.
        // Today this is observer-only; used by analytics and by future phases that will
        // short-circuit narrative rendering when the delta already determines outcome.
        const postStateDelta = computePostNarrativeDelta({
          pre: preStateDelta,
          dmRecord: resolved as unknown as Record<string, unknown>,
        });
        // Hole-fill DM record from delta for downstream consumers that may see
        // partial model output. Non-destructive: only fills absent fields.
        const rendered = renderNarrativeFromDelta({
          dmRecord: dmRecord as Record<string, unknown>,
          delta: postStateDelta,
          epistemicFilter: actorEpistemicFilter,
        });
        dmRecord = rendered.dmRecord;
        if (rendered.notes.length > 0 && process.env.NODE_ENV === "development") {
          console.debug("[api/chat] renderNarrativeFromDelta filled", {
            requestId,
            notes: rendered.notes,
          });
        }
        if (rendered.epistemicFilterMeta && epistemicRolloutFlags.epistemicDebugLog) {
          epistemicDebugLog("render_filter_meta", {
            requestId,
            ...rendered.epistemicFilterMeta,
          });
        }
        try {
          const rollout = getVerseCraftRolloutFlags();
          const mode = (resolved as any).turn_mode as string;
          if (rollout.enableLongNarrativeMode || rollout.enableDecisionTurnMode) {
            const tm =
              mode === "narrative_only" || mode === "system_transition" || mode === "decision_required"
                ? (mode as "narrative_only" | "decision_required" | "system_transition")
                : "decision_required";
            incrTurnModeCount(tm, 1);
            if ((resolved as any).decision_required === true) incrDecisionRequiredHitCount(1);
          }
          const nar = String((resolved as any).narrative ?? "");
          if (nar) recordNarrativeChars(nar.length);
        } catch {
          // ignore
        }

        // Phase-6: decision_required option quality gate (cheap dedupe; no extra heavy calls).
        // Goal: avoid "鎹㈢毊鍚屼箟閫夐」" causing fake decisions, while keeping 2-4 options.
        try {
          const rollout = getVerseCraftRolloutFlags();
          const tm = (resolved as any).turn_mode;
          if (rollout.enableDecisionOptionQualityGate && tm === "decision_required") {
            const before = Array.isArray((resolved as any).decision_options)
              ? (resolved as any).decision_options
              : Array.isArray((resolved as any).options)
                ? (resolved as any).options
                : [];
            const deduped = dedupeDecisionOptions(before, 4);
            (resolved as any).decision_options = deduped;
            (resolved as any).options = deduped; // keep legacy UI aligned
            (resolved as any).decision_required = true;
            // If dedupe made it invalid, do the existing low-cost fix once.
            if (deduped.length < 2) {
              recordDecisionOptionsFixOutcome(false);
              const regen = await generateDecisionOptionsOnlyFallback({
                narrative: String((resolved as any).narrative ?? ""),
                latestUserInput,
                playerContext,
                ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { phase: "quality_gate", purpose: "decision_options_fix" } },
                signal: pipelineAbort.signal,
                budgetMs: 1800,
              });
              if (regen.ok) {
                recordDecisionOptionsFixOutcome(true);
                (resolved as any).decision_options = regen.decision_options;
                (resolved as any).options = regen.decision_options;
              }
            }
          }
        } catch (e) {
          console.warn("[api/chat] decision option quality gate skipped", e);
        }

        try {
          const rollout = getVerseCraftRolloutFlags();
          const settlementFreeze =
            guardMeta?.settlement_guard === "stage2_freeze_on_illegal_or_death";
          const shouldSkipRegen = shouldSkipPostResolveOptionsRegen({
            clientPurpose: validated.clientPurpose,
            shouldApplyFirstActionConstraint: Boolean(shouldApplyFirstActionConstraint),
            settlementFreeze,
            resolved: { turn_mode: (resolved as any).turn_mode },
          });
          const skipReason = getPostResolveOptionsRegenSkipReason({
            clientPurpose: validated.clientPurpose,
            shouldApplyFirstActionConstraint: Boolean(shouldApplyFirstActionConstraint),
            settlementFreeze,
            resolved: { turn_mode: (resolved as any).turn_mode },
          });
          const resolvedOpts = Array.isArray((resolved as any).options) ? ((resolved as any).options as unknown[]) : [];
          const resolvedOptCount = resolvedOpts.filter((x): x is string => typeof x === "string" && x.trim().length > 0).length;
          if (process.env.NODE_ENV === "development") {
            console.debug("[api/chat] options_regen_post_resolve_gate", {
              requestId,
              skipReason,
              turn_mode: (resolved as any).turn_mode,
              resolvedOptCount,
              enable: rollout.enableOptionsAutoRegenOnEmpty,
            });
          }
          if (!shouldSkipRegen && rollout.enableOptionsAutoRegenOnEmpty && resolvedOptCount < 2) {
            if (resolvedOptCount === 0) incrEmptyOptionsTurnCount(1);
            const regen = await generateOptionsOnlyFallback({
              narrative: String((resolved as any).narrative ?? ""),
              latestUserInput,
              playerContext,
              ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { phase: "final_hooks", after: "resolveDmTurn" } },
              signal: pipelineAbort.signal,
              systemExtra: rollout.enableOptionsOnlyRegenPathV2 ? buildOptionsOnlySystemPrompt() : "",
              budgetMs: 4500,
            });
            if (regen.ok) {
              (dmRecord as Record<string, unknown>).options = regen.options;
              dmRecord = runEpistemicPostGuard(dmRecord);
              resolved = resolveDmTurn(dmRecord);
            }
          }
        } catch (e) {
          console.warn("[api/chat] options regen (post-resolve) skipped", e);
        }
        // Optional telemetry: keep a lightweight warning for analysis, but do not block.
        try {
          const narrative = String(resolved.narrative ?? "");
          const awardedItemsLen = Array.isArray(resolved.awarded_items) ? resolved.awarded_items.length : 0;
          const awardedWarehouseLen = Array.isArray(resolved.awarded_warehouse_items) ? resolved.awarded_warehouse_items.length : 0;
          if (hasStrongAcquireSemantics(narrative) && awardedItemsLen === 0 && awardedWarehouseLen === 0) {
            console.warn("[api/chat] consistency: acquire semantics present but awards empty (resolved)", {
              requestId,
              sessionId,
              userId,
              downgraded: resolved.ui_hints?.consistency_flags?.includes("acquire_without_awards_downgraded") ?? false,
            });
          }
        } catch {
          // ignore
        }

        // --- Phase 8.5: post-generation narrative validator + explicit commit ---
        // Pure, no-IO. Validator classifies issues; commitTurn applies overrides
        // and produces a structured commit summary for analytics/debug.
        try {
          const candidateRec = resolved as unknown as Record<string, unknown>;
          // Phase-5: bridge upstream npcConsistency telemetry into the unified
          // post-generation validator report so analytics has a single source
          // of truth. Note: the actual NPC consistency rewrite already ran in
          // Phase-6 above; here we only aggregate its *signal count*.
          const npcConsistencyIssueCount =
            (epistemicPostValidatorTelemetry?.rewriteTriggered ? 1 : 0) +
            (epistemicPostValidatorTelemetry?.personalityDriftCount ?? 0) +
            (epistemicPostValidatorTelemetry?.foreshadowLeakCount ?? 0) +
            (epistemicPostValidatorTelemetry?.taskModeMismatchCount ?? 0) +
            (epistemicPostValidatorTelemetry?.timeFeelMismatchCount ?? 0);
          const validatorReport = validateNarrative({
            dmRecord: candidateRec,
            delta: postStateDelta,
            epistemicFilter: actorEpistemicFilter,
            intent: normalizedIntent,
            sceneNpcIds: presentNpcIdsForEpistemic ?? [],
            riskTags: pipelineControl?.risk_tags ?? [],
            npcConsistencyIssueCount,
          });
          const commitResult = commitTurn({
            requestId,
            sessionId,
            turnIndex: totalRounds,
            candidateDmRecord: candidateRec,
            delta: postStateDelta,
            validatorReport,
          });
          commitSummaryForAnalytics = commitResult.summary;
          void commitSummaryForAnalytics; // signal usage across try/catch for eslint dataflow
          if (validatorReport.optionsOverride) {
            (resolved as any).options = [...validatorReport.optionsOverride];
            if (Array.isArray((resolved as any).decision_options)) {
              (resolved as any).decision_options = [...validatorReport.optionsOverride];
            }
            // Phase 8.5 修复：validator 的 optionsOverride 现在只是“清空信号”，不再注入罐头短句。
            // 若覆盖后 options 不足，立刻再调用一次大模型实时生成，确保玩家看到的是模型产物而非既定文案。
            const overriddenOpts = Array.isArray((resolved as any).options)
              ? ((resolved as any).options as unknown[]).filter(
                  (x): x is string => typeof x === "string" && x.trim().length > 0
                )
              : [];
            if (overriddenOpts.length < 2) {
              try {
                const rolloutForRegen = getVerseCraftRolloutFlags();
                const regen = await generateOptionsOnlyFallback({
                  narrative: String((resolved as any).narrative ?? ""),
                  latestUserInput,
                  playerContext,
                  ctx: {
                    requestId,
                    userId,
                    sessionId,
                    path: "/api/chat",
                    tags: { phase: "post_validator", purpose: "options_regen_after_override" },
                  },
                  signal: pipelineAbort.signal,
                  systemExtra: rolloutForRegen.enableOptionsOnlyRegenPathV2
                    ? buildOptionsOnlySystemPrompt()
                    : "",
                  budgetMs: 4500,
                });
                if (regen.ok && regen.options.length >= 2) {
                  (resolved as any).options = [...regen.options];
                  if (Array.isArray((resolved as any).decision_options)) {
                    (resolved as any).decision_options = [...regen.options];
                  }
                }
              } catch (regenErr) {
                console.warn("[api/chat] post-validator options regen skipped", regenErr);
              }
            }
          }
          if (validatorReport.narrativeOverride) {
            try {
              const parsedSafe = JSON.parse(validatorReport.narrativeOverride) as Record<string, unknown>;
              if (typeof parsedSafe.narrative === "string") {
                (resolved as any).narrative = parsedSafe.narrative;
              }
              if (Array.isArray(parsedSafe.options)) {
                (resolved as any).options = [...(parsedSafe.options as unknown[])];
              }
              (resolved as any).is_action_legal = false;
            } catch {
              /* ignore parse error; keep original */
            }
          }
          const committedMeta = commitResult.committedDmRecord.security_meta;
          if (committedMeta && typeof committedMeta === "object" && !Array.isArray(committedMeta)) {
            const prev =
              ((resolved as any).security_meta as Record<string, unknown> | undefined) ?? {};
            (resolved as any).security_meta = { ...prev, ...(committedMeta as Record<string, unknown>) };
          }
          if (validatorReport.telemetry.totalIssues > 0 && epistemicRolloutFlags.epistemicDebugLog) {
            epistemicDebugLog("narrative_validator_report", {
              requestId,
              sessionId,
              totalIssues: validatorReport.telemetry.totalIssues,
              byCode: validatorReport.telemetry.byCode,
              optionsOverrideApplied: validatorReport.telemetry.optionsOverrideApplied,
              safeNarrativeFallbackApplied: validatorReport.telemetry.safeNarrativeFallbackApplied,
            });
          }
          if (epistemicRolloutFlags.epistemicDebugLog) {
            epistemicDebugLog("turn_commit_summary", {
              requestId,
              sessionId,
              turnIndex: totalRounds,
              degraded: commitResult.summary.degraded,
              optionsRewriteApplied: commitResult.summary.optionsRewriteApplied,
              safeNarrativeFallbackApplied: commitResult.summary.safeNarrativeFallbackApplied,
              commitFlags: commitResult.summary.commitFlags,
              deltaSummary: commitResult.summary.deltaSummary,
            });
          }
          // Phase-4/5: promote commit/validator telemetry to formal analytics events
          // so operations/rollout tooling can observe them without debug logs.
          // Non-blocking; errors are swallowed.
          if (sessionId) {
            const capturedSessionIdAnalytics = sessionId;
            void recordGenericAnalyticsEvent({
              eventId: `${requestId}:turn_commit_summary`,
              idempotencyKey: `${requestId}:turn_commit_summary`,
              userId,
              guestId: userId ? null : chatGuestId,
              sessionId: capturedSessionIdAnalytics,
              eventName: "turn_commit_summary",
              eventTime: new Date(),
              page: "/play",
              source: "chat",
              platform,
              tokenCost: 0,
              playDurationDeltaSec: 0,
              payload: {
                requestId,
                turnIndex: totalRounds,
                lane: turnLaneDecision.lane,
                laneReasons: [...turnLaneDecision.reasons],
                degraded: commitResult.summary.degraded,
                optionsRewriteApplied: commitResult.summary.optionsRewriteApplied,
                safeNarrativeFallbackApplied: commitResult.summary.safeNarrativeFallbackApplied,
                commitFlags: [...commitResult.summary.commitFlags],
                deltaSummary: commitResult.summary.deltaSummary,
                validatorIssueCounts: commitResult.summary.validatorIssueCounts,
              },
            }).catch(() => {});
            if (validatorReport.telemetry.totalIssues > 0) {
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:narrative_validator_issue`,
                idempotencyKey: `${requestId}:narrative_validator_issue`,
                userId,
                guestId: userId ? null : chatGuestId,
                sessionId: capturedSessionIdAnalytics,
                eventName: "narrative_validator_issue",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId,
                  turnIndex: totalRounds,
                  lane: turnLaneDecision.lane,
                  totalIssues: validatorReport.telemetry.totalIssues,
                  byCode: validatorReport.telemetry.byCode,
                  optionsOverrideApplied: validatorReport.telemetry.optionsOverrideApplied,
                  safeNarrativeFallbackApplied: validatorReport.telemetry.safeNarrativeFallbackApplied,
                  issueCodes: validatorReport.issues.map((x) => x.code),
                },
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn("[api/chat] narrative validator / commit skipped", e);
        }
        // Finalize payload candidate first; output moderation must inspect the complete DM narrative.
        let resolvedForClient: ResolvedDmTurn = resolved;
        if (!shouldSkipItemOptionInjection({ resolved, clientPurpose: validated.clientPurpose })) {
          resolvedForClient = applyItemGameplayOptionInjection(resolved, clientState);
        }
        finalizePayload = JSON.stringify(resolvedForClient);
        moderationBody = finalizePayload;
      } else {
        // 褰撲笂娓歌繑鍥為潪涓ユ牸 JSON 鎴栭噸澶嶆嫾鎺ュ璞℃椂锛屽己鍒跺洖钀藉埌鏍囧噯 DM JSON 褰㈢姸锛屼繚璇?SSE 濂戠害绋冲畾銆?        finalizePayload = sanitizeAssistantContent(accumulatedText);
        moderationBody = finalizePayload;
      }

      // --- Phase 9: commit side effects (output audit + moderation + final write + persist + world tick + kg cache) ---
      // Output audit: external provider only once per candidate DM (and never skip on malformed DM fallback).
      if (finalizePayload && isLikelyValidDMJson(finalizePayload)) {
        const dmObj: Record<string, unknown> = JSON.parse(finalizePayload) as Record<string, unknown>;

        try {
          const outputAudit = await auditDmOutputCandidateOnServer({
            dmRecord: dmObj,
            sceneKind: "private_story_output",
            traceId: requestId,
            routeContext: { path: "/api/chat" },
            userId: userId ?? undefined,
            sessionId: sessionId ?? undefined,
            ip: clientIp,
          });

          dmRecord = outputAudit.updatedDmRecord;
          let auditedResolved = resolveDmTurn(dmRecord);
          if (!shouldSkipItemOptionInjection({ resolved: auditedResolved, clientPurpose: validated.clientPurpose })) {
            auditedResolved = applyItemGameplayOptionInjection(auditedResolved, clientState);
          }
          finalizePayload = JSON.stringify(auditedResolved);
          moderationBody = finalizePayload;

          if (outputAudit.verdict === "reject") {
            const narrative = typeof dmRecord.narrative === "string" ? dmRecord.narrative : "当前内容无法处理。";
            const reason = outputAudit.reasonCode || "output_reject";

            recordHighRisk({ ip: clientIp, sessionId, userId }, `output_reject:${reason}`);
            writeAuditTrail({
              requestId,
              sessionId,
              userId,
              ip: clientIp,
              stage: "final_output",
              riskLevel: "black",
              action: "degrade",
              triggeredRule: reason,
              provider: outputAudit.providerRiskSummary?.providers?.join(",") ?? "none",
              summary: blockedAuditSummary,
            });

            await writer.write(
              sse(
                safeBlockedDmJson(narrative, {
                  action: "degrade",
                  stage: "final_output",
                  riskLevel: "black",
                  requestId,
                  reason,
                })
              )
            );
            await writer.close();
            return true;
          }
        } catch (e: unknown) {
          console.warn("[api/chat] output audit skipped due to error", e);
          // If output audit fails unexpectedly, keep the existing finalized payload.
          // Streaming chunks already passed local moderation.
        }
      }

      if (finalizePayload) {
        const finalModeration = await finalOutputModeration({
          input: moderationBody,
          userId,
          ip: clientIp,
          path: "/api/chat",
          requestId,
        });

        if (finalModeration.policy.blocked) {
          recordHighRisk(
            { ip: clientIp, sessionId: sessionId ?? undefined, userId: userId ?? undefined },
            finalModeration.result.reason
          );
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

          const narrative =
            typeof finalModeration.policy.userMessage === "string" ? finalModeration.policy.userMessage : "该内容无法呈现。";

          await writer.write(
            sse(
              safeBlockedDmJson(narrative, {
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
      }

      if (finalizePayload) {
        await writer.write(sse(`__VERSECRAFT_FINAL__:${finalizePayload}`));
        if (
          epistemicResiduePlan.persistEntry &&
          userId &&
          sessionMemory &&
          sessionMemoryRowLooksPresent(sessionMemory)
        ) {
          const nextDb = mergeEpistemicResidueUseIntoSessionDbRow(
            sessionMemory,
            epistemicResiduePlan.persistEntry
          );
          if (nextDb) {
            void db
              .insert(gameSessionMemory)
              .values({
                userId,
                plotSummary: nextDb.plotSummary,
                playerStatus: nextDb.playerStatus,
                npcRelationships: nextDb.npcRelationships,
              })
              .onConflictDoUpdate({
                target: gameSessionMemory.userId,
                set: {
                  plotSummary: nextDb.plotSummary,
                  playerStatus: nextDb.playerStatus,
                  npcRelationships: nextDb.npcRelationships,
                },
              })
              .catch((e) => console.warn("[api/chat] epistemic residue recent persist skipped", e));
          }
        }
        if (dmRecord && userId && sessionId) {
          const dmForWriteback = (() => {
            try {
              const parsed = JSON.parse(finalizePayload) as Record<string, unknown>;
              const promotions =
                clientState &&
                typeof clientState === "object" &&
                !Array.isArray(clientState) &&
                Array.isArray((clientState as any).memoryPromotions)
                  ? ((clientState as any).memoryPromotions as unknown[])
                      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                      .map((x) => x.trim())
                      .slice(0, 2)
                  : [];
              if (promotions.length > 0) {
                return { ...parsed, memory_spine_promotions: promotions };
              }
              return parsed;
            } catch {
              return dmRecord;
            }
          })();
          void persistTurnFacts({
            requestId,
            latestUserInput,
            dmRecord: dmForWriteback,
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
          // Phase-4: non-blocking background world tick. The wrapper decides
          // triggers + enqueue and NEVER awaits inside the hot path.
          const capturedSessionId = sessionId;
          const { pending } = scheduleBackgroundWorldTick({
            requestId,
            userId,
            sessionId,
            turnIndex: totalRounds,
            latestUserInput,
            dmRecord,
            playerLocation:
              typeof dmRecord.player_location === "string" ? dmRecord.player_location : null,
            npcLocationUpdateCount: Array.isArray(dmRecord.npc_location_updates)
              ? dmRecord.npc_location_updates.length
              : 0,
            preflightRiskTags: pipelineControl?.risk_tags ?? [],
            dmNarrativePreview: String(dmRecord.narrative ?? ""),
            commitSummary: commitSummaryForAnalytics,
            enqueueFn: enqueueWorldEngineTick,
            onSettled: ({ decision, result }) => {
              if (!result.enqueued) return;
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:world_engine_enqueued`,
                idempotencyKey: `${requestId}:world_engine_enqueued`,
                userId,
                guestId: userId ? null : chatGuestId,
                sessionId: capturedSessionId,
                eventName: "world_engine_enqueued",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId,
                  dedupKey: result.dedupKey,
                  triggers: [...decision.triggers],
                },
              }).catch(() => {});
            },
          });
          // Intentionally do NOT await `pending`: online turn must not block
          // on background queue RTT.
          void pending;
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
                guestId: userId ? null : chatGuestId,
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
    let streamStatusSent = false;
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
          if (ttftProfile.firstValidStreamChunkAt === null) {
            // 绗竴鏉℃湁鏁?chunk 鍒拌揪锛氬彲鐢ㄤ簬鍒ゆ柇涓婃父杩炴帴/鎺掗槦鏄惁鏄?TTFT 涓诲洜銆?            ttftProfile.firstValidStreamChunkAt = nowMs();
          }
          if (firstChunkAt === 0) {
            firstChunkAt = Date.now();
            if (!streamStatusSent) {
              streamStatusSent = true;
              await writeStatusFrame("streaming", "正文流动中");
            }
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
      operationMode: routingReport.operationMode,
      // Phase-2锛歊esponse 鍦ㄤ笂娓歌繛鎺ュ墠灏辫繑鍥烇紝鍥犳杩欓噷涓嶆壙璇衡€滈涓繛鎺ョ殑 role鈥濄€?      // 鍚庣画鍙粠 SSE status frames / ai.telemetry / chat_request_finished 浜嬩欢涓洖婧€?      httpFallbackCount: routingReport.fallbackCount,
    };
    sseHeadersOut["X-AI-Routing-Http-Snapshot"] = Buffer.from(JSON.stringify(snap), "utf8").toString("base64url");
  }

  return new Response(readable, {
    status: 200,
    headers: sseHeadersOut,
  });
}

/** IVFFlat 榛樿 probes=5锛涘悜閲忕淮 256銆傚嬁鎻愰珮 @/db pool max锛堝綋鍓?10锛夛紝缂撳瓨璺緞浠呯煭浜嬪姟銆?*/
const KG_SEMANTIC_DEFAULT_PROBES = 5;
const KG_SEMANTIC_DEFAULT_K = 5;
const KG_SEMANTIC_MIN_SIMILARITY = 0.78;

async function tryServeCodexFromGlobalCache(args: {
  kgRoute: RouteResult;
  latestUserInput: string;
  requestId: string;
  userId: string | null;
  guestId?: string | null;
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
      guestId: args.userId ? null : (args.guestId ?? null),
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
    guestId: args.userId ? null : (args.guestId ?? null),
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

