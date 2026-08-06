// src/app/api/chat/route.ts
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createTracingAdapter, startTurnTrace, endTurnTrace, getLangfuseTraceId, recordAiGenerationMetric, ensureLangfuseSdk } from "@/lib/observability/langfuse";
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
import { buildQuotaLimitMessage, checkQuota, incrementQuota, estimateTokensFromInput } from "@/lib/quota";
import { markUserActive } from "@/lib/presence";
import { getUtcDateKey, recordDailyTokenUsage } from "@/lib/adminDailyMetrics";
import {
  buildChatRequestFinishedPayload,
  toEnhanceTurnMetrics,
} from "@/lib/analytics/chatRequestFinishedPayload";
import { getGuestIdFromClientState } from "@/lib/chat/clientStateGuest";
import { recordChatActionCompletedAnalytics, recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import type { AnalyticsPlatform } from "@/lib/analytics/types";
import { buildPlayerContextDigest, inferWeaponizationAttempted } from "@/lib/analytics/playerContextDigest";
import { DEFAULT_PLAYER_ROLE_CHAIN, isMockAiProviderEnv, resolveAiEnv } from "@/lib/ai/config/env";
import { resolveOperationMode } from "@/lib/ai/degrade/mode";
import { allowControlPreflightForSession } from "@/lib/ai/governance/sessionBudget";
import { pushAiRoutingReport } from "@/lib/ai/debug/routingRing";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { PlayerChatStreamSuccess } from "@/lib/ai/router/execute";
import type { AiRoutingReport } from "@/lib/ai/routing/types";
import { anyAiProviderConfigured } from "@/lib/ai/service";
import {
  enhanceScene,
  expandNarrativeOnly,
  generateDecisionOptionsOnlyFallback,
  generateMainReply,
  generateOptionsOnlyFallback,
  localizeGameplayPresentation,
  repairNarrativeOnly,
  type EnhanceAfterMainStreamResult,
} from "@/lib/ai/logicalTasks";
import { buildNarrativeLanguageInstruction, normalizeGameLanguage, type GameLanguage } from "@/lib/i18n/language";
import { hasWrongGameplayTurnLanguage } from "@/lib/i18n/gameplayPresentation";
import {
  buildDynamicPlayerDmSystemSuffix,
  getCompactStablePlayerDmSystemPrefix,
  getStablePlayerDmSystemPrefix,
  shouldUseCompactStablePrompt,
} from "@/lib/playRealtime/playerChatSystemPrompt";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import {
  incrDecisionRequiredHitCount,
  incrOptionsOnlyRegenPathHitCount,
  incrTurnModeCount,
  recordDecisionOptionsFixOutcome,
  recordLanguageAntiCheatOutcome,
  recordNarrativeChars,
  recordNarrativeGovernanceOutcome,
  recordOptionsAutoRegenOutcome,
  recordOptionsManualRegenOutcome,
} from "@/lib/observability/versecraftRolloutMetrics";
import { logChatGenerationMetrics } from "@/lib/observability/chatGenerationMetrics";
import { persistTurnFacts } from "@/lib/worldKnowledge/ingestion/persistTurnFacts";
import { uploadSelfHealingScores } from "@/lib/worldKnowledge/observability/selfHealingScores";
import {
  normalizePlayerDmJson,
  parseAccumulatedPlayerDmJson,
} from "@/lib/playRealtime/normalizePlayerDmJson";
import {
  createVerseCraftRequestId,
  isSafeVerseCraftRequestId,
  VERSECRAFT_REQUEST_ID_HEADER,
} from "@/lib/telemetry/requestId";
import {
  buildChatQueueIdentity,
  buildChatQueueResponsePayload,
  claimChatQueueTicketForExecution,
  completeChatQueueTicket,
  enqueueChatRequest,
  failChatQueueTicket,
  getChatQueueIdFromHeaders,
} from "@/lib/chatQueue/service";
import { CHAT_QUEUE_ID_HEADER } from "@/lib/chatQueue/types";
import { isChatPurposeHeaderConsistent } from "@/lib/chatPurpose";
import { buildRuleSnapshot } from "@/lib/playRealtime/ruleSnapshot";
import { CHAT_LATENCY_BUDGET, OPTIONS_REGEN_LATENCY_BUDGET, VC_WAITING } from "@/lib/perf/waitingConfig";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import { buildPlayerChatMessages } from "@/lib/playRealtime/promptAssembly";
import {
  loadVerseCraftEnvFilesOnce,
  reloadVerseCraftProcessEnv,
  resolveVerseCraftProjectRoot,
} from "@/lib/config/loadVerseCraftEnv";
import { envBoolean, envNumber } from "@/lib/config/envRaw";
import { isKgLayerEnabled } from "@/lib/config/kgEnv";
import { moderationTextForPrivateStoryChat, validateChatRequest } from "@/lib/security/chatValidation";
import { buildChatValidationFailureResponse, isEmptyChatInput } from "./chatValidationFailureResponse";
import { finalOutputModeration, postModelModeration, preInputModeration } from "@/lib/security/contentSafety";
import { safeBlockedDmJson } from "@/lib/security/policy";
import {
  isVisibleSafetyDegradeReason,
  visibleSafetyDegradeMessageFor,
} from "@/lib/security/visibleSafety";
import {
  buildInternalNoNarrativeDmJson,
  buildVisibleSiteFailureDmJson,
} from "@/lib/playRealtime/immersiveTurnContinuation";
import { checkRiskControl, recordHighRisk } from "@/lib/security/riskControl";
import { writeAuditTrail } from "@/lib/security/auditTrail";
import { moderateInputOnServer } from "@/lib/safety/input/pipeline";
import { normalizeFinishReason, normalizeUsage } from "@/lib/ai/stream/openaiLike";
import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import type {
 TokenUsage } from "@/lib/ai/types/core";
import { embedText } from "@/lib/kg/embed";
import { ingestUserKnowledge } from "@/lib/kg/ingest";
import { routeUserInput, type RouteResult } from "@/lib/kg/routing";
import { getWorldRevision, touchSemanticCacheHit, tryGetSemanticCache } from "@/lib/kg/semanticCache";
import { enqueueWorldEngineTick } from "@/lib/worldEngine/queue";
import { loadDirectorState } from "@/lib/worldEngine/directorState";
import { applyB1SafetyGuard, extractPresentNpcIds, guessPlayerLocationFromContext } from "@/lib/playRealtime/b1Safety";
import { buildDeterministicServiceTurn } from "@/lib/playRealtime/deterministicServiceTurn";
import { buildNpcConsistencyBoundaryCompactBlock } from "@/lib/playRealtime/npcConsistencyBoundaryPackets";
import { markDirectorAgendaInjected, expireStaleDirectorAgenda } from "@/lib/worldEngine/agenda";
import { detectDirectorHintAdoption } from "@/lib/storyDirector/serverHint";
import { markSocialEventsProjected } from "@/lib/socialWorld/persistence";
import { buildActorScopedEpistemicMemoryBlock } from "@/lib/epistemic/actorScopedMemoryBlock";
import { buildNpcEpistemicProfile } from "@/lib/epistemic/builders";
import { getEpistemicRolloutFlags } from "@/lib/epistemic/featureFlags";
import { resolveEpistemicTargetNpcId } from "@/lib/epistemic/targetNpc";
import type {
 EpistemicValidatorTelemetry } from "@/lib/epistemic/validator";
import type {
 LorePacket } from "@/lib/worldKnowledge/types";
import { isRegisteredCanonicalNpcId } from "@/lib/registry/npcCanon";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { computeMaxRevealRankFromSignals } from "@/lib/registry/revealRegistry";
import { buildNarrativeContinuityPacketBlock } from "@/lib/playRealtime/narrativeStylePackets";
import { shapeUserActionForModelV2 } from "@/lib/playRealtime/actionIntent";
import { buildPovPacketBlock } from "@/lib/playRealtime/povPackets";
import { buildNpcGenderPronounPacketBlock } from "@/lib/playRealtime/npcGenderPackets";
import { buildOptionsOnlySystemPrompt, buildOptionsOnlyUserPacket } from "@/lib/playRealtime/optionsOnlyPackets";
import { readPlayerEchoCanon } from "@/lib/playerEcho/repository";
import type {
 PlayerEchoCanon } from "@/lib/playerEcho/types";
import { assessAndRewriteAntiCheatInput } from "@/lib/playRealtime/antiCheatInput";
import { buildOptionsRegenResponse } from "./optionsRegenPayload";
import {
  createChatTtftProfile,
  elapsedMs,
  nowMs,
  pushAndSummarizeTtft,
  resolveChatPerfFlags,
} from "@/lib/turnEngine/chatPerf";
import {
  sanitizeAssistantContent,
  isLikelyValidDMJson,
} from "@/lib/turnEngine/fallback";
import {
  buildMinimalPlayerContextSnapshot,
  buildTurnRequestMetadata,
  clampText,
  dedupeDecisionOptions,
  extractLastAssistantNarrativeTail,
  parseUpstreamErrorFields,
} from "@/lib/turnEngine/requestMetadata";
import {
  createDefaultPreflightMetrics,
  resolveRiskLane,
  runControlPreflightStage,
} from "@/lib/turnEngine/preflight";
import { loadRuntimeLoreStage } from "@/lib/turnEngine/runtimeLore";
import {
  buildSseHeaders,
  buildStatusFramePayload,
  createSseResponse,
  sse,
  sseText,
  VERSECRAFT_FINAL_PREFIX,
} from "@/lib/narrativeEngine/streamFrames";
import type {
  ChatTtftProfile,
  NormalizedPlayerIntent,
  TurnLaneDecision,
} from "@/lib/turnEngine/types";
import { normalizePlayerInput } from "@/lib/turnEngine/normalizePlayerInput";
import { routeTurnLane } from "@/lib/turnEngine/routeTurnLane";
import {
  assessNarrativeLengthForTelemetry,
  buildNarrativeLengthTelemetry,
  type NarrativeLengthTelemetry,
} from "@/lib/turnEngine/narrativeLengthTelemetry";
import { scheduleBackgroundWorldTick } from "@/lib/turnEngine/enqueueBackgroundTick";
import { schedulePlayerEchoPersistFromTurn } from "@/lib/playerEcho/persistFromTurn";
import {
  applyNarrativeExpansionResultToDmRecord,
  emptyNarrativeExpansionTelemetry,
  narrativeExpansionTelemetryFromResult,
  shouldTriggerNarrativeExpansion,
  type NarrativeExpansionResult,
  type NarrativeExpansionTelemetry,
} from "@/lib/turnEngine/narrativeExpansion";
import {
  asAnalyticsEventName,
  buildNarrativeSafetyTelemetryEvents,
  collectSafetyReport,
  getNarrativeSafetyRuntimeConfig,
  planNarrativeSafetyEnforcement,
  pushNarrativeSafetyTelemetryEvent,
} from "@/lib/turnEngine/narrativeSafety";
// ── Imports originally from the (now-removed) streamFinalHooks.ts extraction ──
import { resolveDmTurn, type ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";
import { hasStrongAcquireSemantics } from "@/features/play/turnCommit/semanticGuards";
import { applyItemGameplayOptionInjection, shouldSkipItemOptionInjection } from "@/lib/play/itemGameplay";
import { shouldApplyDeferredOptionsStrip, stripPlayableOptionsForDeferredClientDelivery } from "@/lib/play/deferMainTurnOptionsDelivery";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import { sanitizeNarrativeLeakageForFinal } from "@/lib/playRealtime/protocolGuard";
import { mergeAutoCapturedCodexUpdates } from "@/lib/registry/codexAutoCapture";
import { auditDmOutputCandidateOnServer } from "@/lib/safety/output/pipeline";
import { isGlobalCacheSafe } from "@/lib/kg/cacheGate";
import { normalizeForHash, sha256Hex } from "@/lib/kg/normalize";
import { putSemanticCache } from "@/lib/kg/semanticCache";
import { applyB1ServiceExecutionGuard } from "@/lib/playRealtime/serviceExecution";
import { applyEquipmentExecutionGuard } from "@/lib/playRealtime/equipmentExecution";
import { applyMainThreatUpdateGuard } from "@/lib/playRealtime/mainThreatGuard";
import { applyWeaponTacticalAdjudication } from "@/lib/playRealtime/weaponAdjudication";
import { applyWorldWeaponPickupGuard } from "@/lib/playRealtime/worldWeaponAffordances";
import { applyPresentNpcObservationGuard } from "@/lib/playRealtime/presentNpcObservationGuard";
import { applyAuthoredLocationMovementGuard } from "@/lib/playRealtime/authoredLocationMovementGuard";
import { applyRegisteredMechanicsGuard } from "@/lib/playRealtime/registeredMechanicsGuard";
import { applyPhysicalInjuryNarrativeGuard } from "@/lib/playRealtime/physicalInjuryNarrativeGuard";
import { applyEquipmentNarrativeConsistencyGuard } from "@/lib/playRealtime/equipmentNarrativeConsistencyGuard";
import { applyPresentNpcNarrativeBoundaryGuard } from "@/lib/playRealtime/presentNpcNarrativeBoundaryGuard";
import { applyInternalIdNarrativeGuard } from "@/lib/playRealtime/internalIdNarrativeGuard";
import { applyProfessionNarrativeCoherenceGuard } from "@/lib/playRealtime/professionNarrativeCoherenceGuard";
import { applyAnonymizationArtifactGuard } from "@/lib/playRealtime/anonymizationArtifactGuard";
import { applyLocationNarrativeConsistencyGuard } from "@/lib/playRealtime/locationNarrativeConsistencyGuard";
import { applyDeadNpcContinuityGuard } from "@/lib/playRealtime/deadNpcContinuityGuard";
import { applyStage2SettlementGuard } from "@/lib/playRealtime/settlementGuard";
import { applyNpcProactiveGrantGuard, buildNpcGrantFallbackNarrativeBlock, normalizeDmTaskPayload } from "@/lib/tasks/taskV2";
import { applyDmChangeSetToDmRecord } from "@/lib/dmChangeSet/applyChangeSet";
import { ensure7FConspiracyTask } from "@/lib/revive/conspiracy";
import { detectCognitiveAnomaly } from "@/lib/epistemic/detector";
import { epistemicDebugLog } from "@/lib/epistemic/featureFlags";
import type {
 EpistemicSceneContext } from "@/lib/epistemic/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { applyHighRiskWarningsShadowMode, extractNarrativeClaims, summarizeVerificationForTelemetry, verifyClaimsAgainstEvidence } from "@/lib/guardrails/provenanceVerifier";
import { buildNpcHeartRuntimeView } from "@/lib/npcHeart/selectors";
import { buildNpcRuntimeStateV1 } from "@/lib/npcHeart/runtimeState";
import { gateFactCommit, type WorldFactCommitCandidate } from "@/lib/worldFacts/factCommitGate";
import { listWorldFacts } from "@/lib/worldFacts/worldFactRegistry";
import { getPostResolveOptionsRegenSkipReason } from "@/app/api/chat/postResolveOptionsRegenSkip";
import { evaluateUnifiedOptionsRegen } from "@/app/api/chat/optionsRegenDecision";
import { buildDialogueContext } from "@/lib/narrativeEngine/contextBuilder";
import { computePostNarrativeDelta } from "@/lib/turnEngine/computeStateDelta";
import { renderNarrativeFromDelta } from "@/lib/turnEngine/renderNarrative";
import { applyNpcConsistencyPostGeneration, validateNarrative, type NarrativeValidationReport } from "@/lib/narrativeEngine/checker";
import { COMMIT_RECORD_OVERRIDE_FIELDS, COMMIT_STATE_CHANGING_FIELDS, COMMIT_STATE_MIRROR_FIELDS, commitNarrativeEvents, commitTurn, type TurnCommitSummary } from "@/lib/narrativeEngine/committer";
import { logNarrativeRun } from "@/lib/narrativeEngine/runLogger";
import { extractChineseNames, isHighConfidenceUnregisteredPersonName, redactHighConfidenceUnregisteredPersonNames } from "@/lib/narrative/extractChineseNames";
import { NPC_ALIAS_FLAT_SET } from "@/lib/registry/npcAliases";
import { NPCS } from "@/lib/registry/npcs";
import { buildRouteModelOutputFromResolvedTurn, buildRouteNarrativeCheckResult } from "@/lib/narrativeEngine/routeAdapter";
import { buildPacingCandidateFromDmRecord, normalizeBeatState, validatePacing } from "@/lib/turnEngine/pacing";
import { detectPersonaMixup } from "@/lib/npcConsistency/personaMixupValidator";
import { findOffscreenNpcDialogueViolations } from "@/lib/npcConsistency/validator";
import { insertPacingLedgerRow } from "@/lib/turnEngine/pacing/pacingLedger";
import { insertForeshadowLedgerRows, expireOverdueForeshadows } from "@/lib/narrativeGovernance/foreshadowLedger";
import { shouldAttemptDmAgent } from "@/lib/ai/tools/dmMechanicsIntentRouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUNDS_THRESHOLD = 10;
const SHORT_TERM_ROUNDS = 5;
const TTFT_HARD_CAP_SESSION_MEMORY_MS = 140;

// NPC name sets for v4全链路人名白名单 final guard
const NPC_NAME_SET: ReadonlySet<string> = new Set([
  ...NPCS.map((n) => n.name),
  ...NPC_ALIAS_FLAT_SET,
]);
const NPC_ALIAS_SET: ReadonlySet<string> = NPC_ALIAS_FLAT_SET;

/**
 * 开局首轮（OPENING_SYSTEM_PROMPT 触发的回合）若命中安全降级，
 * 不向前端展示标准的「本回合涉及涉黄、涉暴或违法伤害内容，不能继续。」。
 * 该文本会污染既定开场白的沉浸感；改用克制的中性中文承接句，并保留合规拦截行为本身。
 */
const OPENING_TURN_NEUTRAL_FALLBACK_NARRATIVE =
  "夜风从走廊深处吹来，我先把心稳一稳，再决定下一步。";
const OPENING_TURN_NEUTRAL_FALLBACK_NARRATIVE_EN =
  "A night wind rises from the far end of the corridor. I steady myself before choosing my next move.";

function resolveVisibleSafetyMessageForTurn(
  raw: string | null,
  isOpeningTurn: boolean,
  language: GameLanguage = "zh-CN"
): string | null {
  if (!raw) return null;
  if (isOpeningTurn) {
    return language === "en-US" ? OPENING_TURN_NEUTRAL_FALLBACK_NARRATIVE_EN : OPENING_TURN_NEUTRAL_FALLBACK_NARRATIVE;
  }
  return raw;
}

function hasAuthSessionCookie(headers: Headers): boolean {
  const cookie = headers.get("cookie") ?? "";
  if (!cookie) return false;
  return /(?:^|;\s*)(?:authjs\.session-token|__Secure-authjs\.session-token|next-auth\.session-token|__Secure-next-auth\.session-token)=/.test(
    cookie
  );
}

const EARLY_STATUS_WRAPPER_HEADER = "x-versecraft-early-status-wrapper";
const OUTPUT_LANGUAGE_HEADER = "x-versecraft-output-language";

function requestedOutputLanguage(headers: Headers): GameLanguage {
  return normalizeGameLanguage(headers.get(OUTPUT_LANGUAGE_HEADER));
}

function rebuildChatRequest(req: Request, requestId?: string, chatQueueId?: string | null): Request {
  const headers = new Headers(req.headers);
  headers.set(EARLY_STATUS_WRAPPER_HEADER, "1");
  if (requestId) headers.set(VERSECRAFT_REQUEST_ID_HEADER, requestId);
  if (chatQueueId) headers.set(CHAT_QUEUE_ID_HEADER, chatQueueId);
  return new Request(req, {
    headers,
  });
}

function createChatQueueJsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function createChatPurposeMismatchResponse(): Response {
  return createChatQueueJsonResponse(
    { error: "chat_purpose_mismatch", message: "请求用途与请求体不一致。" },
    { status: 400 }
  );
}

async function resolveAuthenticatedUserIdForQueue(headers: Headers): Promise<string | null> {
  if (!hasAuthSessionCookie(headers)) return null;
  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function resolveChatQueueGate(
  req: Request,
  requestId: string
): Promise<{ queueId: string | null; response: Response | null }> {
  if (isMockAiProviderEnv() && envBoolean("VC_MOCK_AI_BYPASS_CHAT_QUEUE", true)) {
    return { queueId: null, response: null };
  }
  if (req.headers.get(EARLY_STATUS_WRAPPER_HEADER) === "1") {
    return { queueId: getChatQueueIdFromHeaders(req.headers), response: null };
  }

  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return { queueId: null, response: null };
  }

  const validated = validateChatRequest(body);
  if (!validated.ok) return { queueId: null, response: null };
  if (!isChatPurposeHeaderConsistent({ headers: req.headers, clientPurpose: validated.clientPurpose })) {
    return { queueId: null, response: createChatPurposeMismatchResponse() };
  }
  if (validated.clientPurpose === "options_regen_only") return { queueId: null, response: null };

  const queueGateStartedAt = Date.now();
  const userId = await resolveAuthenticatedUserIdForQueue(req.headers);
  const queueGuestId = userId ? null : getGuestIdFromClientState(validated.clientState);
  const identity = buildChatQueueIdentity({
    headers: req.headers,
    sessionId: validated.sessionId,
    userId,
  });
  const inboundQueueId = getChatQueueIdFromHeaders(req.headers);
  if (inboundQueueId) {
    const claimed = await claimChatQueueTicketForExecution({ queueId: inboundQueueId, identity });
    if (!claimed.ok) {
      const status = claimed.reason === "ticket_not_ready" ? 202 : 409;
      return {
        queueId: null,
        response: createChatQueueJsonResponse(
          {
            status: claimed.reason === "ticket_not_ready" ? "queued" : "rejected",
            reason: claimed.reason,
            retryAfterSeconds: claimed.retryAfterSeconds,
          },
          {
            status,
            headers: { "retry-after": String(claimed.retryAfterSeconds) },
          }
        ),
      };
    }
    return { queueId: claimed.ticket?.queueId ?? inboundQueueId, response: null };
  }

  const admission = await enqueueChatRequest({
    requestId,
    identity,
    reason: "manual",
  });
  if (!admission.ok) {
    void recordGenericAnalyticsEvent({
      eventId: `${requestId}:chat_request_finished_queue_rejected`,
      idempotencyKey: `${requestId}:chat_request_finished_queue_rejected`,
      userId,
      guestId: queueGuestId,
      sessionId: validated.sessionId ?? "unknown_session",
      eventName: "chat_request_finished",
      eventTime: new Date(),
      page: "/play",
      source: "chat_queue",
      platform: "unknown",
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        requestId,
        model: "chat_queue",
        success: false,
        stage: "queue_admission",
        httpStatus: 429,
        upstreamStatus: null,
        rateLimited: true,
        queueReason: admission.reason,
        queueRetryAfterSeconds: admission.retryAfterSeconds,
        firstChunkLatencyMs: null,
        totalLatencyMs: Date.now() - queueGateStartedAt,
      },
    }).catch(() => {});
    return {
      queueId: null,
      response: createChatQueueJsonResponse(
        {
          status: "rejected",
          reason: admission.reason,
          retryAfterSeconds: admission.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "retry-after": String(admission.retryAfterSeconds) },
        }
      ),
    };
  }
  if (admission.kind === "disabled") return { queueId: null, response: null };
  if (admission.ticket.status === "queued") {
    return {
      queueId: null,
      response: createChatQueueJsonResponse(buildChatQueueResponsePayload(admission.ticket), {
        status: 202,
        headers: { "retry-after": String(admission.retryAfterSeconds) },
      }),
    };
  }
  return { queueId: admission.ticket.queueId, response: null };
}

async function releaseChatQueueExecution(queueId: string | null, outcome: "completed" | "failed"): Promise<void> {
  if (!queueId) return;
  try {
    if (outcome === "completed") await completeChatQueueTicket(queueId);
    else await failChatQueueTicket(queueId);
  } catch (error) {
    console.warn("[api/chat][queue_release_failed]", {
      queueId,
      outcome,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function wrapResponseWithQueueRelease(response: Response, queueId: string | null): Response {
  if (!queueId) return response;
  if (!response.body) {
    void releaseChatQueueExecution(queueId, response.ok ? "completed" : "failed");
    return response;
  }
  let released = false;
  const releaseOnce = async (outcome: "completed" | "failed") => {
    if (released) return;
    released = true;
    await releaseChatQueueExecution(queueId, outcome);
  };
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await releaseOnce(response.ok ? "completed" : "failed");
          controller.close();
          return;
        }
        if (value) controller.enqueue(value);
      } catch (error) {
        await releaseOnce("failed");
        controller.error(error);
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } finally {
        await releaseOnce("failed");
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

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
  const inboundRequestId = req.headers.get(VERSECRAFT_REQUEST_ID_HEADER);
  const requestId = isSafeVerseCraftRequestId(inboundRequestId)
    ? inboundRequestId
    : createVerseCraftRequestId("chat");
  const queueGate = await resolveChatQueueGate(req, requestId);
  if (queueGate.response) return queueGate.response;
  const outputLanguage = requestedOutputLanguage(req.headers);

  if (!envBoolean("AI_CHAT_ENABLE_EARLY_STATUS_WRAPPER", true)) {
    const internalReq = rebuildChatRequest(req, requestId, queueGate.queueId);
    return wrapResponseWithQueueRelease(await postChatInternal(internalReq), queueGate.queueId);
  }
  if (req.headers.get(EARLY_STATUS_WRAPPER_HEADER) === "1") {
    return postChatInternal(req);
  }

  const firstStatusFlushPaddingBytes = Math.max(
    0,
    Math.min(4096, envNumber("VC_FIRST_STATUS_FLUSH_PADDING_BYTES", 2048))
  );
  const internalReq = rebuildChatRequest(req, requestId, queueGate.queueId);
  let outerStreamClosed = false;
  let queueReleaseOutcome: "completed" | "failed" = "completed";
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        sse(
          buildStatusFramePayload({
            stage: "request_sent",
            message: "行动已送出",
            requestId,
            flushPaddingBytes: firstStatusFlushPaddingBytes,
          })
        )
      );

      setTimeout(() => {
        void (async () => {
          try {
      const inner = await postChatInternal(internalReq);
      const innerContentType = inner.headers.get("content-type") ?? "";
      const isStreamingContentType =
        innerContentType.toLowerCase().includes("text/event-stream");

      // one-api 对流式响应也返回 Content-Type: application/json，
      // 但 body 是 ReadableStream 且 status=200。仅在此兼容条件下放行。
      if (!isStreamingContentType) {
        if (inner.ok && inner.body) {
          console.warn(
            "[api/chat][early_status_wrapper] non-streaming content-type with 2xx + body stream — forwarding (one-api compat)",
            { contentType: innerContentType, status: inner.status, requestId }
          );
        } else {
          // 既不是 text/event-stream，也不是成功的流式 body → 降级
          if (!outerStreamClosed) {
            let reason = `early_status_invalid_content_type(status=${inner.status},ct=${innerContentType || "none"})`;
            try {
              const errorText = await inner.clone().text();
              if (errorText) {
                reason += `,body=${errorText.slice(0, 300)}`;
              }
            } catch {
              // best-effort
            }
            controller.enqueue(
              sse(
                `${VERSECRAFT_FINAL_PREFIX}${buildVisibleSiteFailureDmJson({
                  kind: "site_unavailable",
                  requestId,
                  reason,
                  language: outputLanguage,
                })}`
              )
            );
          }
          return;
        }
      }
      if (!inner.body) {
        const text = await inner.text();
              if (text && !outerStreamClosed) controller.enqueue(new TextEncoder().encode(text));
        return;
      }

      const reader = inner.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
              if (value && !outerStreamClosed) controller.enqueue(value);
      }
    } catch (error) {
      queueReleaseOutcome = "failed";
      console.warn("[api/chat][early_status_wrapper_failed]", {
        requestId,
        message: error instanceof Error ? error.message : String(error),
      });
      try {
              if (!outerStreamClosed) {
                controller.enqueue(
                  sse(
                    `${VERSECRAFT_FINAL_PREFIX}${buildVisibleSiteFailureDmJson({
                      kind: "site_unavailable",
                      requestId,
                      reason: "early_status_wrapper_failed",
                      language: outputLanguage,
                    })}`
                  )
                );
              }
      } catch {
        // Best effort: if the client has gone away, there is no final frame to deliver.
      }
    } finally {
      await releaseChatQueueExecution(queueGate.queueId, queueReleaseOutcome);
      try {
              if (!outerStreamClosed) {
                outerStreamClosed = true;
                controller.close();
              }
      } catch {
        // Client cancellation should not surface as an unhandled rejection.
      }
    }
        })();
      }, 0);
    },
    cancel() {
      outerStreamClosed = true;
    },
  });

  const responseHeaders = buildSseHeaders(requestId);
  if (process.env.VC_FORCE_AI_KEYS_MISSING === "1" || process.env.AI_FORCE_KEYS_MISSING === "1") {
    responseHeaders["X-VerseCraft-Ai-Status"] = "keys_missing";
  }

  return new Response(readable, {
    status: 200,
    headers: responseHeaders,
  });
}

async function postChatInternal(req: Request) {
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
    const validationRequestId = req.headers.get(VERSECRAFT_REQUEST_ID_HEADER) ?? createVerseCraftRequestId("chat");
    return buildChatValidationFailureResponse({
      validation: validated,
      requestId: validationRequestId,
      isEmptyInput: isEmptyChatInput(body),
    });
  }
  if (!isChatPurposeHeaderConsistent({ headers: req.headers, clientPurpose: validated.clientPurpose })) {
    return NextResponse.json({ error: "chat_purpose_mismatch", message: "请求用途与请求体不一致。" }, { status: 400 });
  }
  const messages = validated.messages;
  const playerContext = validated.playerContext;
  const clientState = validated.clientState;
  const chatGuestId = getGuestIdFromClientState(clientState);
  let latestUserInput = validated.latestUserInput;
  const sessionId = validated.sessionId;
  const clientPurpose = validated.clientPurpose;
  const languageInstruction = buildNarrativeLanguageInstruction(validated.language);
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
  const session = hasAuthSessionCookie(req.headers) ? await auth() : null;
  ttftProfile.authSessionMs = elapsedMs(authStartAt);
  const userId = session?.user?.id ?? null;

  // Langfuse tracing: create per-request adapter and start trace
  // Preload Langfuse SDK before trace creation — with 2s deadline.
  // Ensures startGeneration can create observations synchronously.
  await Promise.race([
    ensureLangfuseSdk(),
    new Promise<void>((r) => setTimeout(r, 2000)),
  ]).catch(() => {});
  createTracingAdapter();
  startTurnTrace({
    requestId,
    userIdHash: userId ?? undefined,
    sessionIdHash: sessionId ?? undefined,
    task: "PLAYER_CHAT",
    environment: process.env.NODE_ENV ?? "development",
    clientPurpose,
    riskLane: undefined, // set after lane decision
    isFirstAction,
    operationMode: validated.clientPurpose ?? "normal",
  });

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
    // Bounded server deadline; the UI may retry, but this path must not become a long story turn.
    const optionsRegenStartedAt = Date.now();
    const optionsServerBudgetMs = Math.max(
      1_000,
      Math.min(
        OPTIONS_REGEN_LATENCY_BUDGET.serverBudgetMs,
        envNumber("VC_OPTIONS_ONLY_SERVER_BUDGET_MS", VC_WAITING.optionsOnlyServerBudgetMs)
      )
    );
    let regen = await generateOptionsOnlyFallback({
      narrative: lastAssistant,
      latestUserInput: packet,
      playerContext: snapshot,
      ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { clientPurpose: "options_regen_only" } },
      systemExtra: rollout.enableOptionsOnlyRegenPathV2 ? buildOptionsOnlySystemPrompt() : "",
      outputLanguage: validated.language,
      budgetMs: optionsServerBudgetMs,
      signal: undefined,
    });
    if (!regen.ok) {
      const retryBudgetMs = Math.max(0, optionsServerBudgetMs - (Date.now() - optionsRegenStartedAt));
      if (retryBudgetMs >= 1_200) {
        regen = await generateOptionsOnlyFallback({
          narrative: lastAssistant,
          latestUserInput: packet,
          playerContext: snapshot,
          ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { clientPurpose: "options_regen_only", retryPass: true } },
          systemExtra: rollout.enableOptionsOnlyRegenPathV2 ? buildOptionsOnlySystemPrompt() : "",
          outputLanguage: validated.language,
          budgetMs: retryBudgetMs,
          signal: undefined,
        });
      }
    }
    const shaped = buildOptionsRegenResponse({
      clientTurnModeHint,
      options: regen.ok ? regen.options : [],
      generatorOk: regen.ok,
      debugReasonCodes: regen.ok
        ? (regen.repairUsed ? ["repair_pass_used"] : [])
        : (regen.debugReasonCodes ?? ["parse_failed"]),
    });
    const optionsRegenLatencyMs = Date.now() - optionsRegenStartedAt;
    const optionsRegenDebugReasonCodes = shaped.debug_reason_codes ?? [];
    const optionsRegenTimedOut =
      optionsRegenDebugReasonCodes.some((code) => /timeout|abort/i.test(code)) ||
      (!regen.ok && /timeout|abort/i.test(regen.reason));
    if (process.env.NODE_ENV !== "production") {
      console.debug("[api/chat][options_regen_only_metrics]", {
        requestId,
        options_regen_latency_ms: optionsRegenLatencyMs,
        options_regen_trigger: clientReason || "unknown",
        options_regen_success: shaped.ok,
        options_regen_failure_reason: regen.ok ? null : regen.reason,
        options_regen_repair_used: regen.ok ? Boolean(regen.repairUsed) : optionsRegenDebugReasonCodes.includes("repair_pass_used"),
        options_regen_timed_out: optionsRegenTimedOut,
        options_regen_semantic_reject_codes: optionsRegenDebugReasonCodes.filter((code) => /reject/i.test(code)),
        options_regen_server_budget_ms: optionsServerBudgetMs,
      });
    }
    if (!regen.ok && process.env.NODE_ENV !== "production") {
      console.warn("[api/chat][options_regen_only_failed]", {
        requestId,
        reason: regen.reason,
        debug_reason_codes: regen.debugReasonCodes ?? [],
        rawLength: regen.rawLength ?? null,
        extractedOptionsCount: regen.extractedOptionsCount ?? null,
        normalizedOptionsCount: regen.normalizedOptionsCount ?? null,
      });
    }
    const ok = shaped.ok;
    const payload = JSON.stringify(shaped);
    const isAuto =
      /涓诲洖鍚坾options\s*缂哄け|auto_missing_main/i.test(reason) ||
      /auto/i.test(clientReason);
    if (isAuto) recordOptionsAutoRegenOutcome(ok);
    else recordOptionsManualRegenOutcome(ok);
    const statusFrames = [
      buildStatusFramePayload({ stage: "request_sent", message: "选项请求已送出", requestId }),
      buildStatusFramePayload({ stage: "context_building", message: "正在分析局势", requestId }),
      buildStatusFramePayload({ stage: "generating", message: "正在判断影响", requestId }),
      buildStatusFramePayload({ stage: "finalizing", message: "正在生成选项", requestId }),
    ];
    return new Response(`${statusFrames.map((frame) => sseText(frame)).join("")}${sseText(payload)}`, {
      status: 200,
      headers: buildSseHeaders(requestId),
    });
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
      payload: buildVisibleSiteFailureDmJson({
        kind: "site_busy",
        requestId,
        reason: `risk_control:${riskControl.reason}`,
        language: validated.language,
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
    const inputSafetyDebug =
      inputSafety.debug && typeof inputSafety.debug === "object" && !Array.isArray(inputSafety.debug)
        ? (inputSafety.debug as Record<string, unknown>)
        : {};
    const inputSafetyVerdict =
      inputSafetyDebug.verdict && typeof inputSafetyDebug.verdict === "object" && !Array.isArray(inputSafetyDebug.verdict)
        ? (inputSafetyDebug.verdict as Record<string, unknown>)
        : {};
    const inputSafetyReasonCode =
      typeof inputSafetyVerdict.reasonCode === "string" && inputSafetyVerdict.reasonCode.trim()
        ? inputSafetyVerdict.reasonCode.trim()
        : "input_reject";
    const inputSafetyLocalRisk =
      inputSafetyVerdict.debug && typeof inputSafetyVerdict.debug === "object" && !Array.isArray(inputSafetyVerdict.debug)
        ? ((inputSafetyVerdict.debug as Record<string, unknown>).localRisk as unknown)
        : null;
    const inputSafetyTags =
      inputSafetyLocalRisk && typeof inputSafetyLocalRisk === "object" && !Array.isArray(inputSafetyLocalRisk)
        ? ((inputSafetyLocalRisk as Record<string, unknown>).tags as unknown)
        : null;
    const inputSafetyCategory = Array.isArray(inputSafetyTags)
      ? inputSafetyTags.filter((tag): tag is string => typeof tag === "string").join("|")
      : inputSafetyReasonCode;
    recordHighRisk({ ip: clientIp, sessionId, userId }, `input_reject:${inputSafety.traceId}`);
    const visibleSafetyMessage = resolveVisibleSafetyMessageForTurn(
      visibleSafetyDegradeMessageFor({
        userMessage: inputSafety.userMessage,
        narrativeFallback: inputSafety.narrativeFallback,
        reasonCode: inputSafetyReasonCode,
        category: inputSafetyCategory,
      }),
      Boolean(shouldApplyFirstActionConstraint),
      validated.language
    );
    return createSseResponse({
      requestId,
      status: 403,
      payload: visibleSafetyMessage
        ? safeBlockedDmJson(visibleSafetyMessage, {
            action: "degrade",
            stage: "pre_input",
            riskLevel: "gray",
            requestId,
            reason: `input_reject:${inputSafetyReasonCode}`,
            reasonCode: inputSafetyReasonCode,
            category: inputSafetyCategory,
          })
        : buildInternalNoNarrativeDmJson({
            requestId,
            reason: `input_reject_non_visible:${inputSafetyReasonCode}`,
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
  const narrativeSafetyRuntime = getNarrativeSafetyRuntimeConfig();
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

  // chat_request_started analytics（请求开始处理，在 AI 调用之前）
  void recordGenericAnalyticsEvent({
    eventId: `${requestId}:chat_request_started`,
    idempotencyKey: `${requestId}:chat_request_started`,
    userId,
    guestId: userId ? null : chatGuestId,
    sessionId: sessionId ?? "unknown_session",
    eventName: "chat_request_started",
    eventTime: new Date(),
    page: "/play",
    source: "chat",
    platform,
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {
      requestId,
      riskLane: riskLane === "fast" ? "fast" : "slow",
      isFirstAction: isFirstAction ? true : false,
    },
  }).catch(() => {});

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
      const visibleSafetyMessage = resolveVisibleSafetyMessageForTurn(
        visibleSafetyDegradeMessageFor({
          userMessage: preCheck.policy.userMessage,
          reason: preCheck.result.reason,
          categories: preCheck.result.categories,
        }),
        Boolean(shouldApplyFirstActionConstraint),
        validated.language
      );
      return createSseResponse({
        requestId,
        status: preCheck.policy.statusCode,
        payload: visibleSafetyMessage
          ? safeBlockedDmJson(visibleSafetyMessage, {
              action: "degrade",
              stage: "pre_input",
              riskLevel: "gray",
              requestId,
              reason: preCheck.result.reason,
            })
          : buildInternalNoNarrativeDmJson({
              requestId,
              reason: `pre_input_non_visible:${preCheck.result.reason}`,
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

  // Authoritative B1 forge services do not need a generative DM turn. This
  // branch intentionally sits after input safety / anti-cheat / lane policy,
  // but before KG, lore, control preflight and every model call.
  if (clientPurpose === "normal") {
    const deterministicServiceTurn = buildDeterministicServiceTurn({
      latestUserInput,
      playerContext,
      clientState,
      requestId,
    });
    if (deterministicServiceTurn) {
      writeAuditTrail({
        requestId,
        sessionId,
        userId,
        ip: clientIp,
        path: "/api/chat",
        stage: "deterministic_service",
        riskLevel: "normal",
        action: "allow",
        triggeredRule: "b1_forge_service_fast_lane",
        summary: "model_calls=0 token_cost=0",
      });
      const deterministicPayload = [
          buildStatusFramePayload({
            stage: "finalizing",
            message: "正在结算服务结果…",
            requestId,
          }),
          `${VERSECRAFT_FINAL_PREFIX}${JSON.stringify(deterministicServiceTurn)}`,
        ].map(sseText).join("");
      return new Response(deterministicPayload, {
        status: 200,
        headers: buildSseHeaders(requestId, { "X-VerseCraft-Turn-Path": "deterministic_service" }),
      });
    }
  }

  // Pre-resolve env and start lore retrieval as early as possible after input
  // moderation, so it overlaps with control preflight and session-memory read.
  const preflightEnv = resolveAiEnv();

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

  const loreRetrievalBudgetMs = Math.max(
    0,
    Math.min(preflightEnv.loreRetrievalBudgetMs, perfFlags.loreRetrievalBudgetMsCap)
  );
  const loreRetrievalP = riskLane === "fast" && perfFlags.enableLightweightFastPath
    ? Promise.resolve()
    : loadRuntimeLoreStage({
        perfFlags,
        riskLane,
        loreRetrievalBudgetMs,
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

  const kgEnabled = isKgLayerEnabled();
  const kgRoute = routeUserInput(latestUserInput);
  if (kgEnabled) {
    void ingestUserKnowledge({ userId, latestUserInput, route: kgRoute });
  }

  const pipelineRule = buildRuleSnapshot(playerContext, latestUserInput);
  let pipelineControl: PlayerControlPlane | null = null;
  let pipelinePreflightFailed = true;
  let controlPreflightBudgetHit = false;
  let preflightTurnMetrics = createDefaultPreflightMetrics();

  if (isFirstAction && userId) {
    db.delete(gameSessionMemory)
      .where(eq(gameSessionMemory.userId, userId))
      .catch((e: unknown) => {
        console.warn("[api/chat][session_memory_cleanup_failed]", {
          userId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
  }

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
  await runControlPreflightP;
  ttftProfile.controlPreflightMs =
    typeof preflightTurnMetrics.latencyMs === "number" ? Math.max(0, preflightTurnMetrics.latencyMs) : 0;
  const playerLocEarly = guessPlayerLocationFromContext(playerContext);
  const presentNpcIdsEarly = extractPresentNpcIds(playerContext, playerLocEarly);
  const focusNpcEarly =
    !shouldApplyFirstActionConstraint
      ? resolveEpistemicTargetNpcId({
          latestUserInput,
          playerContext,
          playerLocation: playerLocEarly,
          controlTarget: pipelineControl?.extracted_slots?.target ?? null,
        })
      : null;
  const epistemicRolloutFlags = getEpistemicRolloutFlags();
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
  const directorBeatHint = typeof directorDigest?.beatModeHint === "string" ? directorDigest.beatModeHint : null;
  const directorTension = typeof directorDigest?.tension === "number" ? directorDigest.tension : null;
  const turnLaneDecision: TurnLaneDecision = routeTurnLane({
    intent: normalizedIntent,
    riskLane,
    focusNpcId: focusNpcEarly,
    directorBeat: directorBeatHint,
    directorTension,
    epistemicEnabled: epistemicRolloutFlags.enableEpistemicGuard,
  });
  const laneSideEffectPlan = turnLaneDecision.sideEffectPlan;
  const contextMode =
    perfFlags.enablePromptSlimming && perfFlags.enableLightweightFastPath && laneSideEffectPlan.compactPrompt
      ? "minimal"
      : "full";
  const useFastLaneCompactStablePrompt = shouldUseCompactStablePrompt({
    promptSlimmingEnabled: perfFlags.enablePromptSlimming,
    compactLanePrompt: laneSideEffectPlan.compactPrompt && envBoolean("AI_CHAT_FASTLANE_COMPACT_STABLE_PROMPT", true),
    turnLane: turnLaneDecision.lane,
    standardCompactEnabled: envBoolean("AI_CHAT_STANDARD_COMPACT_STABLE_PROMPT", false),
  });
  const playerDmStablePrefix = useFastLaneCompactStablePrompt
    ? getCompactStablePlayerDmSystemPrefix()
    : getStablePlayerDmSystemPrefix();
  const useFastLaneCompactDynamicPackets =
    contextMode === "minimal" && envBoolean("AI_CHAT_FASTLANE_COMPACT_DYNAMIC_PACKETS", true);
  const memoryCapsEarly =
    contextMode === "minimal"
      ? {
          summaryMaxChars: 120,
          playerStatusMaxChars: 80,
          npcRelationsMaxChars: 60,
          layerMaxChars: 80,
          npcSnapshotsMaxChars: 60,
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
    maxChars: contextMode === "minimal" ? 560 : 1600,
    microSceneActorGate: contextMode === "minimal",
  });
  const playerContextForPrompt =
    contextMode === "minimal"
      ? buildMinimalPlayerContextSnapshot(playerContext)
      : playerContext;
  const narrativeContinuityBlockEarly = buildNarrativeContinuityPacketBlock({
    previousTail: extractLastAssistantNarrativeTail(rawChatMessages),
    rawAction: turnRawAction ?? latestUserInput,
    dice: turnDice,
    maxChars: contextMode === "minimal" ? 300 : 900,
  });
  const povBlockEarly = buildPovPacketBlock({ maxChars: contextMode === "minimal" ? 180 : 420 });
  const npcGenderPronounBlockEarly = buildNpcGenderPronounPacketBlock({
    focusNpcId: focusNpcEarly,
    presentNpcIds: presentNpcIdsEarly,
    maxChars: contextMode === "minimal" ? 280 : 760,
  });
  const dynamicCoreForQuota = buildDynamicPlayerDmSystemSuffix({
    languageInstruction,
    memoryBlock,
    playerContext: playerContextForPrompt,
    isFirstAction: shouldApplyFirstActionConstraint,
    runtimePackets: "",
    controlAugmentation: "",
    latestUserInput,
    npcConsistencyBoundaryBlock: npcConsistencyBoundaryEarly.text,
    narrativeContinuityBlock: narrativeContinuityBlockEarly,
    povBlock: povBlockEarly,
    npcGenderPronounBlock: npcGenderPronounBlockEarly,
  });
  const systemPromptForQuota = `${playerDmStablePrefix}\n\n${dynamicCoreForQuota}`;

  const shouldRunStrictQuotaBeforeFirstToken = true;
  if ((userId || chatGuestId) && shouldRunStrictQuotaBeforeFirstToken) {
    try {
      const estimated = estimateTokensFromInput(systemPromptForQuota, messages);
      const quotaCheckStartAt = nowMs();
      const quotaResult = await checkQuota({
        userId,
        guestId: userId ? null : chatGuestId,
        estimatedTokens: estimated,
      });
      ttftProfile.quotaCheckMs = elapsedMs(quotaCheckStartAt);
      if (!quotaResult.ok) {
        const status = quotaResult.reason === "banned" ? 403 : 429;
        const msg = buildQuotaLimitMessage(quotaResult);
        void recordGenericAnalyticsEvent({
          eventId: `${requestId}:chat_request_finished_quota`,
          idempotencyKey: `${requestId}:chat_request_finished_quota`,
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
            model: "quota_guard",
            success: false,
            stage: "quota",
            httpStatus: status,
            upstreamStatus: null,
            rateLimited: status === 429,
            quotaReason: quotaResult.reason,
            quotaActorType: quotaResult.actorType,
            quotaDailyTokenLimit: quotaResult.dailyTokenLimit,
            quotaUsedTokens: quotaResult.usedTokens,
            quotaEstimatedTokens: quotaResult.estimatedTokens,
            quotaBonusTokens: quotaResult.bonusTokens,
            quotaSurveyBonus: quotaResult.hasSurveyBonus,
            firstChunkLatencyMs: null,
            totalLatencyMs: Date.now() - requestStartedAt,
          },
        }).catch(() => {});
        return createSseResponse({
          requestId,
          status,
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
  } else if (userId || chatGuestId) {
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
          void recordGenericAnalyticsEvent({
            eventId: `${requestId}:memory_compression_completed`,
            idempotencyKey: `${requestId}:memory_compression_completed`,
            userId,
            guestId: null,
            sessionId: sessionId ?? "unknown_session",
            eventName: "memory_compression_completed",
            eventTime: new Date(),
            page: "/play",
            source: "chat",
            platform,
            tokenCost: 0,
            playDurationDeltaSec: 0,
            payload: {
              totalRounds,
              compressedCount: toCompress.length,
              newPlotSummaryChars: typeof dbRow.plotSummary === "string" ? dbRow.plotSummary.length : 0,
              newPlayerStatusChars: JSON.stringify(dbRow.playerStatus ?? {}).length,
              newNpcRelationsChars: JSON.stringify(dbRow.npcRelationships ?? {}).length,
            },
          }).catch(() => {});
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

  let playerEchoReadFailed = false;
  const playerEchoCanonPromise: Promise<PlayerEchoCanon | null> =
    verseRollout.enablePlayerEchoCanon && verseRollout.enablePlayerEchoPromptPacket && userId
      ? loadPlayerEchoCanonForPrompt(userId, 100).then((result) => {
          if (!result.ok) playerEchoReadFailed = true;
          return result.value;
        })
      : Promise.resolve(null);

  const promptBuildStartAt = nowMs();

  // Wire up promptAssembly.ts — build all prompt messages
  const promptAssemblyResult = await buildPlayerChatMessages({
    requestId,
    userId,
    sessionId,
    chatGuestId,
    platform,
    latestUserInput,
    clientPurpose,
    languageInstruction,
    riskLane,
    totalRounds,
    shouldApplyFirstActionConstraint,
    playerContextForPrompt,
    contextMode,
    useFastLaneCompactDynamicPackets,
    playerContext,
    loreFallbackPath,
    loreSourceCount,
    loreCacheHit,
    loreBudgetHit,
    loreTokenEstimate,
    runtimeLoreCompact,
    loreRetrievalLatencyMs,
    runtimeLorePacket,
    runtimePacketChars,
    runtimePacketTokenEstimate,
    directorBeatHint,
    directorTension,
    isFirstAction,
    playerDmStablePrefix,
    requestStartedAt,
    clientState,
    rawChatMessages,
    perfFlags,
    ttftProfile,
    laneSideEffectPlan,
    turnLaneDecision,
    pipelineControl,
    pipelineRule,
    preflightTurnMetrics,
    sessionMemory,
    verseRollout,
    epistemicRolloutFlags,
    normalizedIntent,
    pipelinePreflightFailed,
    controlPreflightBudgetHit,
    memoryBlock,
    messagesToSend,
    inputSafety,
    antiCheat,
    turnRawAction,
    turnDice,
    runControlPreflightP,
    loreRetrievalP,
    playerEchoCanonPromise,
    playerEchoReadFailed,
  });

  // Reassign mutable outer-scope state variables
  runtimePacketChars = promptAssemblyResult.runtimePacketChars;
  runtimePacketTokenEstimate = promptAssemblyResult.runtimePacketTokenEstimate;
  memoryBlock = promptAssemblyResult.memoryBlock;

  // Destructure all other results
  const {
    safeMessages,
    stableCharLen,
    dynamicCharLen,
    promptVersion,
    promptStablePrefixHash,
    stableTokenEstimate,
    dynamicTokenEstimate,
    promptComponentChars,
    preStateDelta,
    plannedTurnMode,
    epistemicPromptContext,
    narrativeBudget,
    narrativeBudgetTier,
    narrativeBudgetTargetChars,
    playerChatMaxTokens,
    playerChatMaxTokensResolution,
    actorEpistemicFilter,
    _dmEpistemicFilter,
    npcConsistencyBoundaryFinal,
    npcKnowledgePacketForValidator,
    allowedWorldFactIdsForValidator,
    playerEchoPacketChars,
    _playerEchoSelectedFragments,
    focusNpcForPrompt,
    aiEnvForSystem,
    epistemicPromptMetrics,
    epistemicResiduePlan,
    socialProjectionTelemetry,
    injectedDirectorAgendaIds,
    injectedSocialEventIds,
    dueDirectorAgendaForPrompt,
    playerEchoFirstEncounterPlan,
    allEpistemicFactsForPrompt,
    presentNpcIdsForEpistemic,
    nowIsoForEpistemic,
    maxRevealRankForMemory,
    epistemicProfileForPrompt,
    directorDigestForPrompt,
    socialWorldConfig,
    worldDirectorConfig,
    totalSystemPromptChars,
  } = promptAssemblyResult;
  // NOTE: let — epistemicAnomalyResult is mutated after post-generation detection.
  let { epistemicAnomalyResult } = promptAssemblyResult;

  ttftProfile.promptBuildMs = elapsedMs(promptBuildStartAt);

  const telemetryPreferredModel = DEFAULT_PLAYER_ROLE_CHAIN[0];

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
    }
    console.warn(
      `[api/chat] No AI gateway configured (AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY / AI_MODEL_MAIN). See .env.example. Returning degraded SSE with 200.`
    );
    const degradedPayloadAscii = buildVisibleSiteFailureDmJson({
      kind: "auth_or_config",
      requestId,
      reason: "keys_missing",
      language: validated.language,
    });
    return new Response(
      `${sseText(
        buildStatusFramePayload({
          stage: "request_sent",
          message: "request accepted",
          requestId,
        })
      )}${sseText(
        buildStatusFramePayload({
          stage: "finalizing",
          message: "degraded: keys missing",
          requestId,
        })
      )}${sseText(`${VERSECRAFT_FINAL_PREFIX}${degradedPayloadAscii}`)}`,
      {
        status: 200,
        headers: buildSseHeaders(requestId, { "X-VerseCraft-Ai-Status": "keys_missing" }),
      }
    );
  }

  const enableStatusFrames = envBoolean("AI_CHAT_ENABLE_STATUS_FRAMES", true);
  const SSE_HEADERS = buildSseHeaders(requestId);

  const fallbackPayload = buildVisibleSiteFailureDmJson({
    kind: "site_unavailable",
    requestId,
    reason: "server_internal_generation_failed",
    language: validated.language,
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
      ["auth", ttftProfile.authSessionMs ?? 0],
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
      authSessionMs: ttftProfile.authSessionMs,
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
      ttftProfile.firstSseWriteAt = nowMs();
      emitTtftProfileSummary("first_sse_write");
    }
    return writer.write(sse(data));
  };
  const writeControlToStream = async (data: string) => writer.write(sse(data));
  const firstStatusFlushPaddingBytes = Math.max(
    0,
    Math.min(4096, envNumber("VC_FIRST_STATUS_FLUSH_PADDING_BYTES", 2048))
  );
  const writeStatusFrame = async (
    stage:
      | "request_sent"
      | "routing"
      | "context_building"
      | "generating"
      | "streaming"
      | "finalizing",
    message: string,
    flushPaddingBytes = 0
  ) => {
    if (!enableStatusFrames) return;
    statusFrameCount += 1;
    return writeControlToStream(buildStatusFramePayload({ stage, message, requestId, flushPaddingBytes }));
  };
  const closeWithFallback = async () => {
    try {
      await writeControlToStream(`${VERSECRAFT_FINAL_PREFIX}${fallbackPayload}`);
    } catch {
      // Same best-effort boundary as close(): if the client has already gone away,
      // the fallback cannot be delivered and should not crash the background stream task.
    } finally {
      try {
        await writer.close();
      } catch {
        // The client or test harness may already have closed the SSE response.
        // Fallback writing is best-effort; do not convert a closed stream into a background crash.
      }
    }
  };

  const MIN_STREAM_OUTPUT_CHARS = 24;
  /**
   * Turn-level absolute watchdog. The per-read bounds below only cover the
   * upstream read loop; the observed production wedge is a background stream
   * task that dangles on some await with the event loop idle (25+ minutes, no
   * timer), never closes the SSE writer, and therefore never releases the
   * chat-queue execution ticket — every later turn then starves behind the
   * queue. This watchdog fires regardless of where the task is stuck: it
   * cancels the active upstream reader, emits the parseable site-failure
   * fallback final frame, and closes the writer so the response body ends and
   * the queue ticket is released. Cleared when the background task settles.
   */
  const turnWatchdogMs = Math.max(
    60_000,
    Math.min(900_000, envNumber("VC_CHAT_TURN_WATCHDOG_MS", 300_000))
  );
  let activeStreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let readerAlreadyCancelled = false;
  const turnWatchdog = setTimeout(() => {
    console.error("[api/chat] turn watchdog fired", { requestId, turnWatchdogMs });
    void (async () => {
      if (!readerAlreadyCancelled) {
        readerAlreadyCancelled = true;
        try {
          await activeStreamReader?.cancel();
        } catch {
          /* best effort: reader may already be closed */
        }
      }
      await closeWithFallback();
    })();
  }, turnWatchdogMs);
  turnWatchdog.unref?.();
  /**
   * Upstream stream bounds. resilientFetch's timeout only covers the wait for
   * response headers; a mid-stream stall (observed: a DeepSeek stream that
   * stayed silent for 14.1 minutes) otherwise hangs this read forever, holds
   * the chat-queue ticket, and wedges every later turn. Two bounds:
   * - idle: no bytes at all for `streamIdleTimeoutMs` (pure silence);
   * - hard cap: the whole stream round must finish within `streamHardCapMs`,
   *   regardless of keep-alive ping bytes (a stalled stream can still trickle
   *   SSE comments, which would defeat an idle-only watchdog).
   * On either bound we throw into the existing stream catch path, which
   * cancels the reader, attempts one bounded reconnect, and otherwise closes
   * with the parseable site-failure fallback final frame.
   */
  const streamIdleTimeoutMs = Math.max(
    10_000,
    Math.min(300_000, envNumber("VC_CHAT_STREAM_IDLE_TIMEOUT_MS", 45_000))
  );
  const streamHardCapMs = Math.max(
    30_000,
    Math.min(600_000, envNumber("VC_CHAT_STREAM_HARD_CAP_MS", 90_000))
  );
  const readUpstreamBounded = (
    streamReader: ReadableStreamDefaultReader<Uint8Array>,
    deadlineAt: number
  ): Promise<ReadableStreamReadResult<Uint8Array>> => {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      return Promise.reject(new Error(`stream_hard_cap_${streamHardCapMs}ms`));
    }
    const boundMs = Math.min(streamIdleTimeoutMs, remainingMs);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              boundMs === remainingMs
                ? `stream_hard_cap_${streamHardCapMs}ms`
                : `stream_idle_timeout_${streamIdleTimeoutMs}ms`
            )
          ),
        boundMs
      );
    });
    return Promise.race([streamReader.read(), bound]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  };
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
  let finalFrameWritten = false;
  let statusFrameCount = 0;
  let tokenUsageFlushedGlobal = false;
  let lastEnhanceAnalytics: EnhanceAfterMainStreamResult | null = null;
  let enhancePathDmParsed = false;
  let finalJsonParseSuccess = false;
  let settlementGuardApplied = false;
  let settlementAwardPruned = 0;
  let finalOptionsCountTelemetry = 0;
  let finalOptionsQualityPassTelemetry = false;
  let optionsRepairUsedTelemetry = false;
  let optionsRepairMsTelemetry: number | null = null;
  let fallbackUsedTelemetry = false;
  let epistemicPostValidatorTelemetry: EpistemicValidatorTelemetry | null = null;
  let narrativeLengthTelemetry: NarrativeLengthTelemetry | null = null;
  let directorAdoptionTelemetry: {
    adoptedCount: number;
    adoptionRate: number;
    directorAgendaCount: number;
  } | null = null;
  let narrativeExpansionTelemetry: NarrativeExpansionTelemetry = emptyNarrativeExpansionTelemetry();
  let provenanceVerifierTelemetry: any = null;

  (async () => {
    await writeStatusFrame("request_sent", "行动已送出", firstStatusFlushPaddingBytes);
    await writeStatusFrame("routing", "姝ｅ湪杩炴帴娣辨笂");

    // ── DM Agent 路径（Feature Flag 控制：VERSECRAFT_ENABLE_DM_AGENT=true）──
    const _dmAgentRollout = getVerseCraftRolloutFlags();
    if (_dmAgentRollout.enableDmAgent && shouldAttemptDmAgent(latestUserInput)) {
      const { tryRunDmAgentTurn, buildDmAgentDmJson } = await import(
        "@/lib/ai/tools/dmAgentRouteIntegration"
      );
      await writeStatusFrame("generating", "DM 正在思考…");
      const _dmInput = {
        requestId,
        sessionId: sessionId ?? "unknown",
        userId,
        playerLocation: (clientState as any)?.playerLocation ?? "1F_Lobby",
        worldId: "dark_moon",
        systemMessages: safeMessages.filter((m) => m.role === "system"),
        userMessage: { role: "user" as const, content: latestUserInput },
        signal: pipelineAbort.signal,
        forceEnabled: true,
        serverGameState: {
          clientState: clientState ?? null,
          sessionMemory: sessionMemory ?? null,
          latestUserInput,
          totalRounds,
        },
      } as any;
      const _dmAgentResult = await tryRunDmAgentTurn(_dmInput);
      if (_dmAgentResult.agentUsed && _dmAgentResult.result) {
        const _turnResult = _dmAgentResult.result;
        // 工具执行状态反馈
        if (_turnResult.toolsUsed) {
          const _toolLabelMap: Record<string, string> = {
            get_player_state: "查阅状态中…", get_inventory: "检查背包中…",
            get_active_quests: "查阅任务中…", get_world_context: "感知周围…",
            get_combat_state: "评估战况…", inspect_forge_options: "检查锻造台…",
            issue_quest: "创建任务中…", update_quest_progress: "更新任务中…",
            forge_weapon: "锻造中…", consume_materials: "消耗材料中…",
            grant_item: "获得物品中…", start_combat: "战斗开始…",
            resolve_combat_action: "战斗判定中…", apply_world_event: "世界变化中…",
          };
          for (const _t of _turnResult.toolTrace) {
            await writeStatusFrame("generating",
              _toolLabelMap[_t.toolName] ?? (_t.ok ? "操作完成" : "操作失败"));
          }
        }
        // 构建 DM JSON → normalize → resolveDmTurn → 完整 final chain（Phase 1 修复：不再绕过 NPC consistency / validator / commit / world tick）
        // awarded_items 统一经 buildDmAgentDmJson 的注册表门禁（与主链路 guard 同一事实源）
        const _dmJson: Record<string, unknown> = buildDmAgentDmJson(_turnResult);
        const _dmNorm = normalizePlayerDmJson(_dmJson);
        if (_dmNorm) {
          // Phase 6: NPC consistency（DM Agent 路径提取在场 NPC ID 以启用量 tier-1 检查）
          const _dmAgentPresentNpcIds: string[] = [
            ...new Set([
              ...presentNpcIdsEarly,
              ...((clientState as any)?.presentNpcIds ?? []),
            ]),
          ];
          const _npcConsistencyResult = applyNpcConsistencyPostGeneration({
            dmRecord: _dmNorm,
            actorNpcId: null,
            presentNpcIds: _dmAgentPresentNpcIds,
            allFacts: [],
            profile: null,
            anomalyResult: null,
            nowIso: new Date().toISOString(),
            maxRevealRank: 99,
            canonical: null,
            playerContext: playerContext ?? "",
            latestUserInput: latestUserInput,
            playerEchoPacketPresent: false,
            firstEncounterPlan: null,
          });
          const _postConsistency = _npcConsistencyResult.dmRecord;

          // Phase 7: resolve
          const _dmResolved = resolveDmTurn(_postConsistency);

          // Phase 8.5: post-generation validator
          const _agentStateDelta = {
            isActionLegal: true,
            sanityDamage: 0,
            consumesTime: true,
            isDeath: false,
          };
          const _validatorReport = validateNarrative({
            dmRecord: _dmResolved as Record<string, unknown>,
            delta: _agentStateDelta,
            epistemicFilter: null,
            intent: null,
            sceneNpcIds: [],
            riskTags: pipelineControl?.risk_tags ?? [],
            npcConsistencyIssueCount: _npcConsistencyResult.telemetry?.rewriteTriggered ? 1 : 0,
          });

          // Phase 8.5: explicit commit
          const _commitResult = commitTurn({
            requestId: requestId,
            sessionId: sessionId ?? null,
            turnIndex: totalRounds,
            candidateDmRecord: _dmResolved as Record<string, unknown>,
            delta: _agentStateDelta,
            validatorReport: _validatorReport,
            gameLanguage: validated.language,
          });
          const _committed = _commitResult.committedDmRecord;
          const _commitControlledFields = [
            ...COMMIT_STATE_CHANGING_FIELDS,
            ...COMMIT_STATE_MIRROR_FIELDS,
            ...COMMIT_RECORD_OVERRIDE_FIELDS,
          ] as const;
          for (const _field of _commitControlledFields) {
            if (_field in _committed) {
              (_dmResolved as any)[_field] = _committed[_field];
            }
          }

          // Inject Langfuse trace ID for downstream calibration/score upload
          const lfTraceId = getLangfuseTraceId(requestId);
          if (lfTraceId) {
            (_dmResolved as Record<string, unknown>)._langfuse_trace_id = lfTraceId;
          }

          // Phase 9: write FINAL（exactly once — 由 route.ts 统一控制，DM Agent 不自行写入）
          await writeControlToStream(
            sseText(`${VERSECRAFT_FINAL_PREFIX}${JSON.stringify(_dmResolved)}`)
          );

          // Non-blocking background world tick
          if (sessionId) {
            const _bgTick = scheduleBackgroundWorldTick({
              requestId: requestId,
              userId: userId,
              sessionId: sessionId,
              turnIndex: totalRounds,
              latestUserInput: latestUserInput,
              dmRecord: _dmResolved as Record<string, unknown>,
              playerLocation: typeof (_dmResolved as any).player_location === "string"
                ? (_dmResolved as any).player_location : null,
              previousPlayerLocation: null,
              npcLocationUpdateCount: 0,
              minTriggerGapTurns: 999,
              maxPendingAgenda: 99,
              preflightRiskTags: pipelineControl?.risk_tags ?? [],
              dmNarrativePreview: String((_dmResolved as any).narrative ?? ""),
              commitSummary: _commitResult.summary,
              enqueueFn: enqueueWorldEngineTick,
              onSettled: ({ result: _tickResult }) => {
                if (!_tickResult.enqueued) return;
                void recordGenericAnalyticsEvent({
                  eventId: `${requestId}:world_engine_enqueued`,
                  idempotencyKey: `${requestId}:world_engine_enqueued`,
                  userId, guestId: userId ? null : chatGuestId,
                  sessionId: sessionId ?? "unknown_session",
                  eventName: "world_engine_enqueued",
                  eventTime: new Date(), page: "/play", source: "chat", platform,
                  tokenCost: 0, playDurationDeltaSec: 0,
                  payload: { requestId, source: "dm_agent" },
                }).catch(() => {});
              },
            });
            void _bgTick.pending;
          }

          // chat_request_finished analytics（统一口径）
          const _dmAgentTokenEstimate =
            Math.max(100, Math.ceil((_turnResult.narrative || "").length / 2.5));
          try {
            void recordGenericAnalyticsEvent({
              eventId: `${requestId}:chat_request_finished`,
              idempotencyKey: `${requestId}:chat_request_finished`,
              userId, guestId: userId ? null : chatGuestId,
              sessionId: sessionId ?? "unknown_session",
              eventName: "chat_request_finished",
              eventTime: new Date(), page: "/play", source: "chat", platform,
              tokenCost: _dmAgentTokenEstimate, playDurationDeltaSec: 0,
              payload: {
                requestId, success: true, source: "dm_agent",
                toolsUsed: _turnResult.toolsUsed,
                toolCount: _turnResult.toolTrace.length,
                totalLatencyMs: _turnResult.totalLatencyMs,
                commitFlags: _commitResult.summary.commitFlags,
                validatorIssueCounts: _commitResult.summary.validatorIssueCounts,
              },
            });
          } catch { /* analytics best-effort */ }

          // dm_agent_turn_completed analytics（保留既有事件）
          try {
            void recordGenericAnalyticsEvent({
              eventId: `${requestId}:dm_agent_turn_completed`,
              idempotencyKey: `${requestId}:dm_agent_turn_completed`,
              userId, guestId: userId ? null : chatGuestId,
              sessionId: sessionId ?? "unknown_session",
              eventName: "dm_agent_turn_completed" as any,
              eventTime: new Date(), page: "/play", source: "chat", platform,
              tokenCost: _dmAgentTokenEstimate, playDurationDeltaSec: 0,
              payload: { requestId, toolsUsed: _turnResult.toolsUsed,
                toolCount: _turnResult.toolTrace.length,
                totalLatencyMs: _turnResult.totalLatencyMs },
            });
          } catch { /* analytics best-effort */ }
          try { await writer.close(); } catch { /* already closed */ }
          return;
        }
      }
      await writeStatusFrame("routing", "切换至标准模式");
    }
    // ── DM Agent 路径结束 ──

    const aiRuntimeEnvForTurn = resolveAiEnv();
    const TIMEOUT_MS =
      riskLane === "fast"
        ? aiRuntimeEnvForTurn.playerChatFastLaneTimeoutMs
        : aiRuntimeEnvForTurn.playerChatSlowLaneTimeoutMs;
    const streamReconnectWallMs =
      aiRuntimeEnvForTurn.playerChatStreamReconnectWallMs > 0
        ? aiRuntimeEnvForTurn.playerChatStreamReconnectWallMs
        : 40_000;
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
            tags: {
              clientPurpose,
              riskLane,
              narrativeBudgetTier,
              narrativeBudgetTargetChars,
              playerChatMaxTokens,
              playerChatMaxTokensSource: playerChatMaxTokensResolution.source,
              playerChatMaxTokensClamped: playerChatMaxTokensResolution.clamped,
              latestUserInput,
              // eval mock 模式通过 header 传递期望选项数量，mock provider 据此截断选项列表
              expectedOptionsCount: Number(req.headers.get("x-versecraft-expected-options-count")) || undefined,
            },
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
      const isUpstreamRateLimited = first.lastHttpStatus === 429 || /rate_limit|429/i.test(String(first.code));
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
          httpStatus: first.lastHttpStatus ?? null,
          upstreamStatus: first.lastHttpStatus ?? null,
          rateLimited: isUpstreamRateLimited,
          firstChunkLatencyMs: null,
          totalLatencyMs: Date.now() - requestStartedAt,
          riskLane: riskLane === "fast" ? "fast" : "slow",
          aiFallbackCount: first.httpAttempts?.filter((a) => a.failureKind !== undefined).length ?? 0,
          streamReconnectCount,
          statusFrameCount,
          preflightRan: preflightTurnMetrics.ran,
          preflightSkippedReason: preflightTurnMetrics.skippedReason,
          preflightCacheHit: preflightTurnMetrics.cacheHit,
          preflightLatencyMs: preflightTurnMetrics.latencyMs,
          preflightOk: preflightTurnMetrics.ok,
          preflightBudgetHit: controlPreflightBudgetHit,
          upstreamConnectMs: null,
          serverPerf: envBoolean("AI_CHAT_ENABLE_DIAGNOSTICS", process.env.NODE_ENV === "development")
            ? {
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
                upstreamConnectMs: null,
                firstSseWriteDeltaMs:
                  ttftProfile.firstSseWriteAt !== null
                    ? Math.max(0, ttftProfile.firstSseWriteAt - ttftProfile.requestReceivedAt)
                    : null,
                totalTtftMs: null,
                lane: ttftProfile.lane,
              }
            : undefined,
        },
      }).catch(() => {});

      const upstreamStatus = first.lastHttpStatus ?? 0;
      const attemptsForHint = first.httpAttempts ?? [];
      const lastWithBody = [...attemptsForHint].reverse().find((a) => typeof a.httpStatus === "number" && a.message);
      const hintFields = parseUpstreamErrorFields(lastWithBody?.message);
      const degraded = buildVisibleSiteFailureDmJson({
        kind: isUpstreamRateLimited ? "site_busy" : isTimeout ? "network_or_gateway" : "site_unavailable",
        requestId,
        reason: hintFields.upstreamCode
          ? `ai_router:${first.code}:${hintFields.upstreamCode}`
          : `ai_router:${first.code}:${upstreamStatus || "unknown"}`,
        language: validated.language,
      });
      try {
        await writeStatusFrame("finalizing", isUpstreamRateLimited ? "网站生成通道繁忙" : "网站连接暂时不稳定");
        await writeToStream(`${VERSECRAFT_FINAL_PREFIX}${degraded}`);
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
        if (Date.now() - requestStartedAt > streamReconnectWallMs) return false;
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
      latestFinishReason: string | null;
    }) => {
      if (tokenUsageFlushedGlobal) return;
      tokenUsageFlushedGlobal = true;
      const { latestTotalTokens, accumulated } = args;
      const expansionTokens = Math.max(0, narrativeExpansionTelemetry.totalTokens ?? 0);
      const enhanceTokens =
        lastEnhanceAnalytics?.kind === "applied"
          ? Math.max(0, lastEnhanceAnalytics.usage?.totalTokens ?? 0)
          : 0;
      const toPersist =
        latestTotalTokens > 0
          ? latestTotalTokens + expansionTokens + enhanceTokens
          : accumulated.length > 0
            ? Math.max(100, Math.ceil(accumulated.length / 2.5)) + expansionTokens + enhanceTokens
            : enhanceTokens;
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
          promptVersion,
          promptStablePrefixHash,
          stableTokenEstimate,
          dynamicTokenEstimate,
          runtimePacketChars,
          runtimePacketTokenEstimate,
          latestUsage: args.latestUsage,
          streamFinishReason: args.latestFinishReason,
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
          firstStatusMs:
            ttftProfile.firstSseWriteAt !== null ? Math.max(0, ttftProfile.firstSseWriteAt - requestStartedAt) : null,
          firstVisibleTextMs: args.firstChunkAt > 0 ? Math.max(0, args.firstChunkAt - requestStartedAt) : null,
          finalMs: Math.max(0, finishedAt - requestStartedAt),
          narrativeChars: narrativeLengthTelemetry?.actualNarrativeChars ?? null,
          optionsCount: finalOptionsCountTelemetry,
          optionsQualityPass: finalOptionsQualityPassTelemetry,
          optionsRepairUsed: optionsRepairUsedTelemetry,
          optionsRepairMs: optionsRepairMsTelemetry,
          fallbackUsed: fallbackUsedTelemetry,
          degradedMode: false,
          promptBuildMs: ttftProfile.promptBuildMs,
          loreRetrievalMs: loreRetrievalLatencyMs,
          retryCount: routingReport.attempts.filter((a) => a.failureKind !== undefined).length,
          errorType: args.streamBlocked ? "stream_blocked" : null,
          settlementGuardApplied,
          settlementAwardPruned,
          narrativeLength: narrativeLengthTelemetry,
          narrativeExpansion: narrativeExpansionTelemetry,
          });

          const vTypes = epistemicPostValidatorTelemetry?.violationTypes ?? [];
          const epistemicRollupPayload = {
            rolloutFlags: epistemicRolloutFlags,
            actorNpcId: focusNpcForPrompt,
            actorKnownFactCount: epistemicPromptMetrics.actorKnownFactCount,
            publicFactCount: epistemicPromptMetrics.publicFactCount,
            forbiddenFactCount: epistemicPromptMetrics.forbiddenFactCount,
            epistemicFactCount: epistemicPromptMetrics.epistemicFactCount,
            promptContext: epistemicPromptContext.telemetry,
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
          const withSocialProjection = {
            ...base,
            socialWorldMode: socialProjectionTelemetry.socialWorldMode,
            socialHintCount: socialProjectionTelemetry.socialHintCount,
            socialHintChars: socialProjectionTelemetry.socialHintChars,
            socialPromptChars: socialProjectionTelemetry.socialPromptChars,
            socialQueryLatencyMs: socialProjectionTelemetry.socialQueryLatencyMs,
            socialHintVisibilityCounts: socialProjectionTelemetry.socialHintVisibilityCounts,
            socialEventsProjected: socialProjectionTelemetry.socialEventsProjected,
            socialProjectionSkippedReason: socialProjectionTelemetry.socialProjectionSkippedReason,
          };
          const withEpistemicCore = { ...withSocialProjection, epistemicRollup: epistemicRollupPayload };
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

      logChatGenerationMetrics({
        requestId,
        sessionId,
        userId,
        provider: streamSource.providerId,
        model: args.gatewayModel,
        logicalRole: args.streamRole,
        promptVersion,
        promptStablePrefixHash,
        scenarioOrTurnMode: plannedTurnMode.mode,
        firstStatusMs:
          ttftProfile.firstSseWriteAt !== null ? Math.max(0, ttftProfile.firstSseWriteAt - requestStartedAt) : null,
        firstVisibleTextMs: args.firstChunkAt > 0 ? Math.max(0, args.firstChunkAt - requestStartedAt) : null,
        finalMs: Math.max(0, finishedAt - requestStartedAt),
        finalJsonParseSuccess,
        narrativeChars: narrativeLengthTelemetry?.actualNarrativeChars ?? null,
        optionsCount: finalOptionsCountTelemetry,
        optionsQualityPass: finalOptionsQualityPassTelemetry,
        optionsRepairUsed: optionsRepairUsedTelemetry,
        optionsRepairMs: optionsRepairMsTelemetry,
        fallbackUsed: fallbackUsedTelemetry,
        degradedMode: false,
        preflightMs: preflightTurnMetrics.latencyMs,
        loreRetrievalMs: loreRetrievalLatencyMs,
        promptBuildMs: ttftProfile.promptBuildMs,
        inputTokens: args.latestUsage?.promptTokens,
        outputTokens: args.latestUsage?.completionTokens,
        cachedInputTokens: args.latestUsage?.cachedPromptTokens,
        retryCount: routingReport.attempts.filter((a) => a.failureKind !== undefined).length,
        errorType: args.streamBlocked ? "stream_blocked" : null,
        usage: args.latestUsage,
      });

      logAiTelemetry({
        requestId,
        task: "PLAYER_CHAT",
        providerId: streamSource.providerId,
        logicalRole: args.streamRole,
        gatewayModel: args.gatewayModel,
        phase: "stream_complete",
        latencyMs: finishedAt - requestStartedAt,
        usage: args.latestUsage,
        finishReason: args.latestFinishReason,
        ttftMs: args.firstChunkAt > 0 ? args.firstChunkAt - requestStartedAt : undefined,
        stableCharLen,
        dynamicCharLen,
        runtimePacketChars,
        runtimePacketTokenEstimate,
        cachedPromptTokens: args.latestUsage?.cachedPromptTokens,
        stream: true,
        userId,
      });

      // Also record usage to Langfuse generation observation
      recordAiGenerationMetric({
        requestId,
        task: "PLAYER_CHAT",
        providerId: streamSource.providerId,
        logicalRole: args.streamRole,
        gatewayModel: args.gatewayModel,
        phase: "stream_complete",
        latencyMs: finishedAt - requestStartedAt,
        usage: args.latestUsage,
        finishReason: args.latestFinishReason,
        ttftMs: args.firstChunkAt > 0 ? args.firstChunkAt - requestStartedAt : undefined,
        stream: true,
        userId,
        outputSnapshot: args.accumulated,
      });
    };

    const runStreamFinalHooks = async (
      accumulatedText: string,
      blockedAuditSummary: string
    ): Promise<boolean> => {
      // Inlined final-hooks closure — avoids 80-field ctx object + cross-module call
      // Helper: extractPartialNarrativeForRepair
      function extractPartialNarrativeForRepair(raw: string): string {
        const text = String(raw ?? "");
        const match = text.match(/"narrative"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (!match?.[1]) return "";
        try {
          return JSON.parse(`"${match[1]}"`);
        } catch {
          return match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
        }
      }

      await writeStatusFrame("finalizing", "正在收束本回合");

      const verseRolloutSnapshot = getVerseCraftRolloutFlags();
      // mock scenario 不做 options defer（eval probe 只读一次 final frame，不做 options_regen 请求）
      const isMockScenario = /\[mock_scenario:[a-z0-9_]+\]/i.test(latestUserInput);
      const deferPlayableOptsToSeparateRequest =
        verseRolloutSnapshot.deferMainTurnOptionsToClient && clientPurpose !== "options_regen_only" && !isMockScenario;

      let commitSummaryForAnalytics: TurnCommitSummary | null = null;
      const finalRepairBudgetMs = Math.max(
        1_000,
        Math.min(12_000, envNumber("VC_FINAL_REPAIR_BUDGET_MS", 6_000))
      );
      const finalRepairDeadlineAt = Date.now() + finalRepairBudgetMs;
      const remainingFinalRepairBudgetMs = () => Math.max(0, finalRepairDeadlineAt - Date.now());
      const nextFinalRepairBudgetMs = (requestedMs: number) =>
        Math.max(0, Math.min(requestedMs, remainingFinalRepairBudgetMs()));
      const canRunFinalRepair = (minMs = 500) => remainingFinalRepairBudgetMs() >= minMs;

      // Stashed condition values for the unified options regen decision.
      // Each value is set at the original trigger point; the LLM call happens once later.
      const optsRegenState = {
        preResolveNarrativeOptCount: -1,
        preResolveFreeze: false,
        turnModeFilteredOptCount: -1,
        turnModeFilteredDecCount: -1,
        dedupedDecisionOptCount: -1,
        postResolveSkipReason: "not_skipped" as string,
        enableOptionsAutoRegenOnEmpty: false,
        resolvedOptCount: -1,
        validatorOverrideApplied: false,
        validatorOverriddenOptCount: -1,
      };

      /**
       * Turn-compiler phases (Phase-2 of the structural refactor).
       *
       * Execution order is preserved:
       *   parse/normalize -> guards -> validator -> resolveDmTurn -> commit side effects.
       *
       * Each phase is a local closure that reads the outer request state
       * (requestId: requestId, playerContext: playerContext, pipelineControl, ...) and returns the next
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
        return applyDmChangeSetToDmRecord(rec, { clientState: clientState, requestId: requestId });
      };

      const phaseRepairMalformedCandidate = async (): Promise<Record<string, unknown> | null> => {
        if (!canRunFinalRepair()) return null;
        const partialNarrative = extractPartialNarrativeForRepair(accumulatedText);
        const seedRecord: Record<string, unknown> = {
          is_action_legal: true,
          sanity_damage: 0,
          narrative: partialNarrative,
          is_death: false,
          consumes_time: true,
          consumed_items: [],
          options: [],
          internal_meta: {
            action: "model_repair_after_malformed_dm",
            request_id: requestId,
          },
        };
        try {
          const repaired = await repairNarrativeOnly({
            originalNarrative: partialNarrative || latestUserInput,
            originalDmRecord: seedRecord,
            latestUserInput: latestUserInput,
            playerContextSnapshot: playerContext,
            issues: [
              {
                source: "parseAccumulatedPlayerDmJson",
                code: "malformed_dm_json",
                severity: "high",
                detail: "main stream ended before a complete DM JSON object was available",
              },
            ],
            constraints: [
              "按当前场景继续生成正常叙事，不解释 JSON、解析、模型或系统错误。",
              "玩家输入若无法直接完成，就写成尝试、询问、呼喊、寻找或判断，再给出自然后果。",
            ],
            ctx: {
              requestId: requestId,
              userId: userId,
              sessionId: sessionId,
              path: "/api/chat",
              tags: { phase: "final_hooks", purpose: "malformed_dm_repair" },
            },
            signal: pipelineAbort.signal,
            budgetMs: nextFinalRepairBudgetMs(4_000),
            maxChars: narrativeBudget.maxChars,
          });
          if (!repaired.ok) return null;
          let repairedOptions: string[] = [];
          if (!deferPlayableOptsToSeparateRequest) {
            const optionsRepairStartedAt = Date.now();
            const regen = await generateOptionsOnlyFallback({
              narrative: repaired.narrative,
              latestUserInput: latestUserInput,
              playerContext: playerContext,
              ctx: {
                requestId: requestId,
                userId: userId,
                sessionId: sessionId,
                path: "/api/chat",
                tags: { phase: "final_hooks", purpose: "malformed_dm_options_repair" },
              },
              signal: pipelineAbort.signal,
              outputLanguage: validated.language,
              budgetMs: nextFinalRepairBudgetMs(OPTIONS_REGEN_LATENCY_BUDGET.repairAttemptTimeoutMs),
            });
            optionsRepairUsedTelemetry = true;
            optionsRepairMsTelemetry = Math.max(0, Date.now() - optionsRepairStartedAt);
            repairedOptions = regen.ok ? regen.options : [];
          }
          const repairedRecord = normalizePlayerDmJson({
            ...seedRecord,
            narrative: repaired.narrative,
            options: repairedOptions,
          });
          if (!repairedRecord) return null;
          fallbackUsedTelemetry = true;
          return applyDmChangeSetToDmRecord(repairedRecord, { clientState: clientState, requestId: requestId });
        } catch (e) {
          console.warn("[api/chat] malformed DM model repair skipped", e);
          return null;
        }
      };

      // --- Phase 2: structural guards (pre-enhance) ---
      const phaseApplyStructuralGuards = (
        dm: Record<string, unknown>
      ): Record<string, unknown> => {
        let rec = dm;
        rec = applyB1ServiceExecutionGuard({
          dmRecord: rec,
          latestUserInput: latestUserInput,
          playerContext: playerContext,
          clientState: clientState,
        });
        rec = applyEquipmentExecutionGuard({
          dmRecord: rec,
          latestUserInput: latestUserInput,
          playerContext: playerContext,
          clientState: clientState,
        });
        rec = applyWorldWeaponPickupGuard({ dmRecord: rec, latestUserInput: latestUserInput, clientState: clientState });
        rec = applyAuthoredLocationMovementGuard({
          dmRecord: rec,
          latestUserInput: latestUserInput,
          clientState: clientState,
          enableCanonicalLocationMovement: verseRolloutSnapshot.enableCanonicalLocationMovement,
        });
        rec = applyDeadNpcContinuityGuard({ dmRecord: rec, latestUserInput: latestUserInput, deadNpcIds: clientState?.deadNpcIds });
        rec = applyB1SafetyGuard({
          dmRecord: rec,
          fallbackLocation: guessPlayerLocationFromContext(playerContext),
        });
        rec = applyMainThreatUpdateGuard({ dmRecord: rec, playerContext: playerContext });
        rec = applyWeaponTacticalAdjudication({
          dmRecord: rec,
          playerContext: playerContext,
          latestUserInput: latestUserInput,
          requestId: requestId,
          clientState: clientState,
        });
        // Must run after tactical adjudication so authored threat/weapon deltas
        // are the final authority rather than being appended to model deltas.
        rec = applyRegisteredMechanicsGuard({ dmRecord: rec, latestUserInput: latestUserInput, clientState: clientState });
        rec = applyPhysicalInjuryNarrativeGuard(rec);
        rec = applyPresentNpcObservationGuard({ dmRecord: rec, latestUserInput: latestUserInput, clientState: clientState });
        rec = normalizeDmTaskPayload(rec);
        rec = ensure7FConspiracyTask(rec, { playerContext: playerContext, latestUserInput: latestUserInput });
        rec = applyNpcProactiveGrantGuard({ dmRecord: rec, playerContext: playerContext });
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
            baseCtx: { requestId: requestId, userId: userId, sessionId: sessionId, path: "/api/chat" },
            signal: pipelineAbort.signal,
            isFirstAction: isFirstAction,
            playerContext: playerContext,
            latestUserInput: latestUserInput,
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
      if (!dmRecord) {
        dmRecord = await phaseRepairMalformedCandidate();
      }

      let capturedBeatForLedger: string | null = null;
      let moderationBody = accumulatedText;
      let finalizePayload: string | null = null;

      if (dmRecord) {
        dmRecord = phaseApplyStructuralGuards(dmRecord);
        dmRecord = await phaseEnhanceAndSettle(dmRecord);
        // Enhancement may replace candidate prose after the structural phase;
        // re-apply this pure narrative/state consistency guard at the final
        // post-generation boundary.
        dmRecord = applyPhysicalInjuryNarrativeGuard(dmRecord);
        dmRecord = applyEquipmentNarrativeConsistencyGuard({ dmRecord, clientState: clientState });
        dmRecord = applyPresentNpcNarrativeBoundaryGuard({ dmRecord, clientState: clientState });
        // --- Parallel: compose non-overlapping narrative regex guards ---
        // applyInternalIdNarrativeGuard, applyProfessionNarrativeCoherenceGuard, and
        // applyAnonymizationArtifactGuard are pure CPU-only regex transforms. Each
        // operates on distinct, non-overlapping text patterns in dmRecord.narrative:
        //   - internalId: replaces leaked registry IDs (e.g. {prof_trial_lampkeeper})
        //   - profession:  repairs model word-substitution errors (e.g. 烛台的陌生人)
        //   - anonymization: fixes anonymization artifacts (e.g. 大堂的陌生人在头顶)
        // None reads clientState or any dmRecord field beyond `narrative`, and their
        // regex patterns target different artifact classes with zero overlap. Running
        // all three on the same input snapshot in parallel is semantically equivalent
        // to sequential application. The reduce below chains narrative modifications
        // (any guard that didn't change the text returns the original dnRecord ref)
        // and merges all _commit_flags into a deduplicated set.
        const [postInternalId, postProfession, postAnonymization] = await Promise.all([
          Promise.resolve().then(() => applyInternalIdNarrativeGuard(dmRecord)),
          Promise.resolve().then(() => applyProfessionNarrativeCoherenceGuard(dmRecord)),
          Promise.resolve().then(() => applyAnonymizationArtifactGuard(dmRecord)),
        ]);
        dmRecord = [postInternalId, postProfession, postAnonymization].reduce((rec, next) => {
          if (next === rec) return rec;
          return {
            ...rec,
            narrative: typeof next.narrative === "string" ? next.narrative : rec.narrative,
            _commit_flags: [
              ...new Set([
                ...(Array.isArray(rec._commit_flags) ? (rec._commit_flags as string[]) : []),
                ...(Array.isArray(next._commit_flags) ? (next._commit_flags as string[]) : []),
              ]),
            ],
          };
        }, dmRecord);
        dmRecord = applyLocationNarrativeConsistencyGuard({ dmRecord, clientState: clientState });

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
              requestId: requestId,
              sessionId: sessionId,
              userId: userId,
              flags: sanitized.flags,
              role: routingReport.actualLogicalRole ?? streamSource.logicalRole,
            });
            void recordGenericAnalyticsEvent({
              eventId: `${requestId}:narrative_protocol_leak`,
              idempotencyKey: `${requestId}:narrative_protocol_leak`,
              userId: userId,
              guestId: userId ? null : chatGuestId,
              sessionId: sessionId ?? "unknown_session",
              eventName: "narrative_protocol_leak",
              eventTime: new Date(),
              page: "/play",
              source: "chat",
              platform: platform,
              tokenCost: 0,
              playDurationDeltaSec: 0,
              payload: {
                requestId: requestId,
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
        // Conditions are evaluated here; the actual LLM call is made once,
        // after all conditions are known, in the unified options regen block.
        try {
          const rawOpts = Array.isArray((dmRecord as { options?: unknown }).options)
            ? ((dmRecord as { options?: unknown }).options as unknown[])
                .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : [];
          const opts = filterNarrativeActionOptions(rawOpts, 4);
          const preResolveGuard =
            dmRecord.security_meta && typeof dmRecord.security_meta === "object" && !Array.isArray(dmRecord.security_meta)
              ? (dmRecord.security_meta as Record<string, unknown>)
              : null;
          const preResolveFreeze = preResolveGuard?.settlement_guard === "stage2_freeze_on_illegal_or_death";
          optsRegenState.preResolveNarrativeOptCount = opts.length;
          optsRegenState.preResolveFreeze = preResolveFreeze;
        } catch (e) {
          console.warn("[api/chat] options regen (pre-resolve) skipped", e);
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

        // Opt3-Epistemic惰性化：pre-prompt 已跳过完整检测（lazy=true），
        // 此处 post-generation 补跑完整 detectCognitiveAnomaly，
        // 将结果注入 applyNpcConsistencyPostGeneration 与 analytics。
        if (focusNpcForPrompt && epistemicProfileForPrompt) {
          const epistemicSceneForDeferred: EpistemicSceneContext = {
            presentNpcIds: [...new Set([...presentNpcIdsForEpistemic, focusNpcForPrompt])],
          };
          epistemicAnomalyResult = detectCognitiveAnomaly({
            npcId: focusNpcForPrompt,
            playerInput: latestUserInput,
            allFacts: allEpistemicFactsForPrompt,
            scene: epistemicSceneForDeferred,
            profile: epistemicProfileForPrompt,
            nowIso: nowIsoForEpistemic,
            maxRevealRank: maxRevealRankForMemory,
            canonical: getNpcCanonicalIdentity(focusNpcForPrompt),
          });
          if (epistemicRolloutFlags.epistemicDebugLog && epistemicAnomalyResult.anomaly) {
            epistemicDebugLog("anomaly_detected_deferred", {
              npcId: focusNpcForPrompt,
              severity: epistemicAnomalyResult.severity,
              reactionStyle: epistemicAnomalyResult.reactionStyle,
            });
          }
        }

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
            playerContext: playerContext,
            latestUserInput: latestUserInput,
            playerEchoPacketPresent: playerEchoPacketChars > 0,
            firstEncounterPlan: playerEchoFirstEncounterPlan,
          });
          epistemicPostValidatorTelemetry = telemetry;
          return next;
        };
        if (laneSideEffectPlan.requireNpcConsistency) {
          dmRecord = runEpistemicPostGuard(dmRecord);
        }
        try {
          const { validateCanonNames } = await import("@/lib/npcConsistency/canonNameValidator");
          const nar = String((dmRecord as Record<string, unknown>).narrative ?? "");
          const canonWarnings = validateCanonNames(nar, presentNpcIdsForEpistemic);
          if (canonWarnings.length > 0 && process.env.NODE_ENV !== "production") {
            console.warn("[api/chat][canon_name_warning]", { requestId: requestId, canonWarnings });
          }
        } catch { /* non-critical */ }

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
            // Stash counts for later unified evaluation; the LLM call is deferred.
            optsRegenState.turnModeFilteredOptCount = optCount;
            optsRegenState.turnModeFilteredDecCount = decCount;
            dm.turn_mode = typeof dm.turn_mode === "string" ? dm.turn_mode : "decision_required";
            dm.decision_required = true;
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
            requestId: requestId,
            notes: rendered.notes,
          });
        }
        if (rendered.epistemicFilterMeta && epistemicRolloutFlags.epistemicDebugLog) {
          epistemicDebugLog("render_filter_meta", {
            requestId: requestId,
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
            // If dedupe made it invalid, the consolidated regen will handle it.
            optsRegenState.dedupedDecisionOptCount = deduped.length;
          }
        } catch (e) {
          console.warn("[api/chat] decision option quality gate skipped", e);
        }

        // --- Phase 4.5: post-resolve options regen gate (condition only) ---
        // The LLM call is handled by the unified regen block later.
        try {
          const rollout = getVerseCraftRolloutFlags();
          const settlementFreeze =
            guardMeta?.settlement_guard === "stage2_freeze_on_illegal_or_death";
          const skipReason = getPostResolveOptionsRegenSkipReason({
            clientPurpose: validated.clientPurpose,
            shouldApplyFirstActionConstraint: Boolean(shouldApplyFirstActionConstraint),
            settlementFreeze,
            resolved: { turn_mode: (resolved as any).turn_mode },
          });
          const resolvedOpts = Array.isArray((resolved as any).options) ? ((resolved as any).options as unknown[]) : [];
          const resolvedOptCount = resolvedOpts.filter((x): x is string => typeof x === "string" && x.trim().length > 0).length;
          optsRegenState.postResolveSkipReason = skipReason;
          optsRegenState.enableOptionsAutoRegenOnEmpty = rollout.enableOptionsAutoRegenOnEmpty;
          optsRegenState.resolvedOptCount = resolvedOptCount;
          if (process.env.NODE_ENV === "development") {
            console.debug("[api/chat] options_regen_post_resolve_gate", {
              requestId: requestId,
              skipReason,
              turn_mode: (resolved as any).turn_mode,
              resolvedOptCount,
              enable: rollout.enableOptionsAutoRegenOnEmpty,
            });
          }
        } catch (e) {
          console.warn("[api/chat] options regen (post-resolve) skipped", e);
        }

        // Narrative length telemetry only. Do not mutate narrative, options, or state.
        try {
          const narrative = String((resolved as any).narrative ?? "");
          const decisionOptions = [
            ...(Array.isArray((resolved as any).decision_options) ? ((resolved as any).decision_options as unknown[]) : []),
            ...(Array.isArray((resolved as any).options) ? ((resolved as any).options as unknown[]) : []),
          ];
          const hasDecisionOptions = decisionOptions.some(
            (option) => typeof option === "string" && option.trim().length > 0
          );
          const securityMeta =
            (resolved as any).security_meta &&
            typeof (resolved as any).security_meta === "object" &&
            !Array.isArray((resolved as any).security_meta)
              ? ((resolved as any).security_meta as Record<string, unknown>)
              : null;
          const isSafetyFallback =
            securityMeta?.action === "degrade" ||
            String(securityMeta?.stage ?? "").includes("safety") ||
            String(securityMeta?.stage ?? "").includes("final_output") ||
            String(securityMeta?.riskLevel ?? "").toLowerCase() === "black";
          const lengthResult = assessNarrativeLengthForTelemetry({
            narrative,
            budget: narrativeBudget ?? null,
            playerChatMaxTokens: playerChatMaxTokens,
            plannedTurnMode: `${plannedTurnMode.mode}:${plannedTurnMode.reason}`,
            isActionLegal: (resolved as any).is_action_legal !== false,
            isDeath: (resolved as any).is_death === true,
            isSafetyFallback,
            isSystemTransition:
              normalizedIntent.isSystemTransition || (resolved as any).turn_mode === "system_transition",
            hasDecisionOptions,
            riskTags: pipelineControl?.risk_tags ?? [],
          });
          narrativeLengthTelemetry = lengthResult.telemetry;
          recordNarrativeChars(narrativeLengthTelemetry.actualNarrativeChars ?? 0, {
            underMin: narrativeLengthTelemetry.narrativeUnderMin,
            overMax: narrativeLengthTelemetry.narrativeOverMax,
            severity: narrativeLengthTelemetry.narrativeLengthSeverity,
            budgetMissing: narrativeLengthTelemetry.narrativeLengthStatus === "budget_missing",
            assessmentError: narrativeLengthTelemetry.narrativeLengthStatus === "assessment_error",
          });
          if (lengthResult.assessmentError) {
            console.warn("[api/chat] narrative length assessment skipped", {
              requestId: requestId,
              message:
                lengthResult.assessmentError instanceof Error
                  ? lengthResult.assessmentError.message
                  : String(lengthResult.assessmentError),
            });
          }
        } catch (e) {
          const narrative = String((resolved as any).narrative ?? "");
          narrativeLengthTelemetry = buildNarrativeLengthTelemetry({
            budget: narrativeBudget ?? null,
            playerChatMaxTokens: playerChatMaxTokens,
            actualNarrativeChars: Array.from(narrative.replace(/\s+/g, "")).length,
            status: "assessment_error",
          });
          recordNarrativeChars(narrativeLengthTelemetry.actualNarrativeChars ?? 0, {
            severity: "error",
            assessmentError: true,
          });
          console.warn("[api/chat] narrative length assessment skipped", {
            requestId: requestId,
            message: e instanceof Error ? e.message : String(e),
          });
        }

        try {
          const narrative = String((resolved as any).narrative ?? "");
          const securityMeta =
            (resolved as any).security_meta &&
            typeof (resolved as any).security_meta === "object" &&
            !Array.isArray((resolved as any).security_meta)
              ? ((resolved as any).security_meta as Record<string, unknown>)
              : null;
          const hasProtocolOrSafetyDegrade =
            securityMeta?.action === "degrade" ||
            typeof securityMeta?.protocol_guard === "string" ||
            String(securityMeta?.stage ?? "").includes("safety") ||
            String(securityMeta?.stage ?? "").includes("final_output") ||
            String(securityMeta?.riskLevel ?? "").toLowerCase() === "black";
          const performanceBudgetMs = Math.max(0, 56_000 - (Date.now() - requestStartedAt));
          const expansionDecision = shouldTriggerNarrativeExpansion({
            enabled: aiEnvForSystem.enableNarrativeExpansion,
            budget: narrativeBudget ?? null,
            lengthTelemetry: narrativeLengthTelemetry,
            isSafetyFallback: hasProtocolOrSafetyDegrade,
            isActionLegal: (resolved as any).is_action_legal !== false,
            isDeath: (resolved as any).is_death === true,
            isSystemTransition:
              normalizedIntent.isSystemTransition || (resolved as any).turn_mode === "system_transition",
            hasProtocolOrSafetyDegrade,
            performanceBudgetMs,
          });

          if (!expansionDecision.trigger) {
            narrativeExpansionTelemetry = emptyNarrativeExpansionTelemetry(expansionDecision.skippedReason);
            if (expansionDecision.skippedReason === "performance_budget_exhausted") {
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:narrative_expansion_skipped`,
                idempotencyKey: `${requestId}:narrative_expansion_skipped`,
                userId,
                guestId: userId ? null : chatGuestId,
                sessionId: sessionId ?? "unknown_session",
                eventName: "narrative_expansion_skipped",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  skippedReason: expansionDecision.skippedReason,
                  performanceBudgetMs: Math.max(0, Math.trunc(performanceBudgetMs)),
                  elapsedMs: requestStartedAt ? Date.now() - requestStartedAt : null,
                },
              });
            }
          } else {
            const configuredExpansionBudgetMs = Math.max(
              0,
              Math.min(
                10_000,
                envNumber("VC_NARRATIVE_EXPANSION_BUDGET_MS", VC_WAITING.narrativeExpansionServerBudgetMs)
              )
            );
            // This optional recovery must remain inside the observable p95
            // deadline. A per-turn p50 cap was too strict: it cancelled valid
            // 7–8s expansions even while the completed turn still fit well
            // inside the 20s p95 budget.
            const finalP95RemainingMs = Math.max(
              0,
              CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms - (Date.now() - requestStartedAt) - 500
            );
            const ABSOLUTE_EXPANSION_CAP_MS = 8_000;
            const expansionBudgetMs = Math.max(
              0,
              Math.min(
                configuredExpansionBudgetMs,
                performanceBudgetMs - 250,
                finalP95RemainingMs,
                ABSOLUTE_EXPANSION_CAP_MS
              )
            );
            if (expansionBudgetMs < 1_500) {
              narrativeExpansionTelemetry = emptyNarrativeExpansionTelemetry("performance_budget_exhausted");
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:narrative_expansion_skipped`,
                idempotencyKey: `${requestId}:narrative_expansion_skipped`,
                userId,
                guestId: userId ? null : chatGuestId,
                sessionId: sessionId ?? "unknown_session",
                eventName: "narrative_expansion_skipped",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  skippedReason: "performance_budget_exhausted",
                  expansionBudgetMs: Math.max(0, Math.trunc(expansionBudgetMs)),
                  performanceBudgetMs: Math.max(0, Math.trunc(performanceBudgetMs)),
                  elapsedMs: requestStartedAt ? Date.now() - requestStartedAt : null,
                },
              });
            } else {
            const expansionResult: NarrativeExpansionResult = await expandNarrativeOnly({
              originalNarrative: narrative,
              originalDmRecord: resolved as unknown as Record<string, unknown>,
              narrativeBudget: narrativeBudget,
              latestUserInput: latestUserInput,
              playerContextSnapshot: playerContextForPrompt,
              recentNarrativeTail: extractLastAssistantNarrativeTail(rawChatMessages),
              constraints: [
                "只替换 narrative 字段，其他结构字段必须保持原结论。",
                "不要新增 NPC、地点、道具、任务或世界真相。",
                "只补足动作反馈、感官细节、环境阻力、即时反应和悬疑节奏。",
              ],
              ctx: {
                requestId: requestId,
                userId: userId,
                sessionId: sessionId,
                path: "/api/chat",
                tags: {
                  phase: "final_hooks",
                  purpose: "narrative_expansion",
                  narrativeBudgetTier: narrativeBudgetTier,
                  latestUserInput: latestUserInput,
                },
              },
              signal: pipelineAbort.signal,
              budgetMs: expansionBudgetMs,
            });
            narrativeExpansionTelemetry = narrativeExpansionTelemetryFromResult(expansionResult);
            if (expansionResult.ok) {
              (resolved as any).narrative = expansionResult.narrative;
              dmRecord = applyNarrativeExpansionResultToDmRecord(
                dmRecord as Record<string, unknown>,
                expansionResult
              );
            }
            }
          }
        } catch (e) {
          const beforeChars = narrativeLengthTelemetry?.actualNarrativeChars ?? null;
          narrativeExpansionTelemetry = {
            narrativeExpansionTriggered: true,
            narrativeExpansionSucceeded: false,
            narrativeExpansionSkippedReason: "exception",
            narrativeExpansionLatencyMs: null,
            narrativeBeforeChars: beforeChars,
            narrativeAfterChars: null,
          };
          console.warn("[api/chat] narrative expansion skipped", {
            requestId: requestId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
        // Optional telemetry: keep a lightweight warning for analysis, but do not block.
        try {
          const narrative = String(resolved.narrative ?? "");
          const awardedItemsLen = Array.isArray(resolved.awarded_items) ? resolved.awarded_items.length : 0;
          const awardedWarehouseLen = Array.isArray(resolved.awarded_warehouse_items) ? resolved.awarded_warehouse_items.length : 0;
          if (hasStrongAcquireSemantics(narrative) && awardedItemsLen === 0 && awardedWarehouseLen === 0) {
            console.warn("[api/chat] consistency: acquire semantics present but awards empty (resolved)", {
              requestId: requestId,
              sessionId: sessionId,
              userId: userId,
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
          const narrativeAudit =
            candidateRec._narrative_audit && typeof candidateRec._narrative_audit === "object" && !Array.isArray(candidateRec._narrative_audit)
              ? (candidateRec._narrative_audit as Record<string, unknown>)
              : {};
          const candidateFactsForGate: WorldFactCommitCandidate[] = Array.isArray(narrativeAudit.candidate_new_facts)
            ? narrativeAudit.candidate_new_facts.filter(
                (fact): fact is WorldFactCommitCandidate => Boolean(fact && typeof fact === "object" && !Array.isArray(fact))
              )
            : [];
          const runNarrativeValidator = (dmRecordForValidation: Record<string, unknown>): NarrativeValidationReport =>
            validateNarrative({
              dmRecord: dmRecordForValidation,
              delta: postStateDelta,
              epistemicFilter: actorEpistemicFilter,
              intent: normalizedIntent,
              sceneNpcIds: presentNpcIdsForEpistemic ?? [],
              riskTags: pipelineControl?.risk_tags ?? [],
              npcConsistencyIssueCount,
              narrativeStyleValidationEnabled: verseRollout.enableNarrativeStyleValidator,
              narrativeStyleFocus: normalizedIntent.kind,
              npcKnowledgeValidationEnabled: verseRollout.enableNpcKnowledgeValidator,
              npcKnowledgePacket: npcKnowledgePacketForValidator,
              speakerNpcId: focusNpcForPrompt,
              npcKnowledgeMaxRevealRank: maxRevealRankForMemory,
              unsupportedFactDetectionEnabled: verseRollout.enableWorldFactRegistry,
              allowedFactIds: allowedWorldFactIdsForValidator,
              scenePublicFactIds: actorEpistemicFilter.scenePublicFacts.map((fact) => fact.id),
              actorScopedFactIds: actorEpistemicFilter.actorScopedFacts.map((fact) => fact.id),
              factDetectionMaxRevealRank: maxRevealRankForMemory,
              inventoryItemIds: clientState && typeof clientState === "object" && !Array.isArray(clientState) && Array.isArray((clientState as Record<string, unknown>).inventoryItemIds)
                ? ((clientState as Record<string, unknown>).inventoryItemIds as unknown[]).filter((value): value is string => typeof value === "string")
                : [],
              recentRegisters: undefined, // Phase-2.6: 账本读取留给未来优化
            });
          let validatorReport = runNarrativeValidator(candidateRec);
          const usedFactIdsForSafety = Array.isArray(narrativeAudit.used_fact_ids)
            ? narrativeAudit.used_fact_ids.filter((value): value is string => typeof value === "string")
            : [];
          const clientStateForPacing =
            clientState && typeof clientState === "object" && !Array.isArray(clientState)
              ? (clientState as Record<string, unknown>)
              : {};
          const directorDigestRecordForPacing =
            directorDigestForPrompt && typeof directorDigestForPrompt === "object" && !Array.isArray(directorDigestForPrompt)
              ? (directorDigestForPrompt as Record<string, unknown>)
              : null;
          const directorChapterForPacing =
            directorDigestRecordForPacing?.chapter &&
            typeof directorDigestRecordForPacing.chapter === "object" &&
            !Array.isArray(directorDigestRecordForPacing.chapter)
              ? (directorDigestRecordForPacing.chapter as Record<string, unknown>)
              : null;
          const previousBeatStateForPacing =
            normalizeBeatState(directorChapterForPacing?.phase) ??
            normalizeBeatState(directorDigestRecordForPacing?.beatModeHint);
          const directorBeatStateForPacing = normalizeBeatState(directorBeatHint);
          const candidateBeatStateForPacing =
            plannedTurnMode.mode === "decision_required"
              ? "choice"
              : plannedTurnMode.mode === "narrative_only" && previousBeatStateForPacing === "peak"
                ? "aftermath"
                : directorBeatStateForPacing === "peak"
                  ? "peak"
                  : turnLaneDecision.lane === "REVEAL"
                    ? "rising"
                    : null;
          if (candidateBeatStateForPacing) capturedBeatForLedger = candidateBeatStateForPacing;
          const completedTaskIdsForPacing = Array.isArray(clientStateForPacing.completedTaskIds)
            ? clientStateForPacing.completedTaskIds
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean)
                .slice(0, 64)
            : [];
          const journalClueCountForPacing =
            typeof clientStateForPacing.journalClueCount === "number" &&
            Number.isFinite(clientStateForPacing.journalClueCount)
              ? Math.max(0, Math.trunc(clientStateForPacing.journalClueCount))
              : 0;
          const directorPressureFlagsForPacing = Array.isArray(directorDigestRecordForPacing?.pressureFlags)
            ? directorDigestRecordForPacing.pressureFlags.filter((value): value is string => typeof value === "string")
            : [];
          const directorStallCountForPacing =
            typeof directorDigestRecordForPacing?.stallCount === "number" &&
            Number.isFinite(directorDigestRecordForPacing.stallCount)
              ? Math.max(0, Math.trunc(directorDigestRecordForPacing.stallCount))
              : 0;
          const consecutiveCrisisTurnsForPacing =
            (directorTension ?? 0) >= 85 || directorPressureFlagsForPacing.includes("high_threat")
              ? Math.max(1, directorStallCountForPacing)
              : 0;
          const directorDueAgendaHintForPacing =
            dueDirectorAgendaForPrompt
              .map((item) => `${item.eventCode}:${item.priority}:${item.revealPolicy}`)
              .filter(Boolean)
              .join("|") || null;
          const pacingReport = narrativeSafetyRuntime.pacingValidatorEnabled
            ? validatePacing({
                lane: turnLaneDecision.lane,
                candidate: buildPacingCandidateFromDmRecord(candidateRec, {
                  beatState: candidateBeatStateForPacing,
                }),
                stateDelta: postStateDelta,
                previousSnapshot: {
                  beatState: previousBeatStateForPacing,
                  consecutivePeakTurns: previousBeatStateForPacing === "peak" ? 1 : 0,
                  consecutiveCrisisTurns: consecutiveCrisisTurnsForPacing,
                  majorRevealCooldown: 0,
                  prerequisiteClueCount: journalClueCountForPacing,
                  completedTaskIds: completedTaskIdsForPacing,
                  pendingChoiceConsequence: false,
                  ...(typeof directorTension === "number" ? { tension: directorTension } : {}),
                },
                revealBudget: {
                  requiredPrerequisiteClues: 0,
                  majorRevealCooldown: 0,
                  maxConsecutiveCrisisTurns: 3,
                },
                allowedFactIds: allowedWorldFactIdsForValidator,
                worldFacts: verseRollout.enableWorldFactRegistry ? listWorldFacts() : [],
                directorDueAgendaHint: directorDueAgendaHintForPacing,
              })
            : null;
          // When a pacing budget breach is detected, re-run lightweight NPC consistency
          // checks (persona mixup + offscreen dialogue) on the current narrative.
          // An over-budget turn is more likely to have rushed/inconsistent NPC behaviour.
          const pacingRecheckIssues: Array<{
            code: string;
            severity: "low" | "medium" | "high";
            source: string;
            detail?: string;
            invariant?: string;
          }> = [];
          if (pacingReport?.needsRevalidate) {
            const narrativeForRecheck = typeof candidateRec.narrative === "string" ? candidateRec.narrative : "";
            if (narrativeForRecheck && presentNpcIdsForEpistemic.length > 0) {
              try {
                const personaResult = detectPersonaMixup({
                  narrative: narrativeForRecheck,
                  presentNpcIds: presentNpcIdsForEpistemic,
                  focusNpcId: focusNpcForPrompt?.trim() || null,
                });
                if (personaResult.hits.length > 0) {
                  pacingRecheckIssues.push({
                    code: "npc_status_forbidden_direct_speech",
                    severity: "medium",
                    source: "pacing",
                    detail: `persona_mixup_recheck:${personaResult.hits
                      .slice(0, 3)
                      .map((h) => `${h.victimNpcId}<=${h.leakedFromNpcId}:${h.token}`)
                      .join("|")}`,
                    invariant: "pacing_budget_breach",
                  });
                }
              } catch (e) {
                console.warn("[pacing_recheck] persona mixup check skipped", e);
              }
              try {
                const offscreenViolations = findOffscreenNpcDialogueViolations(
                  narrativeForRecheck,
                  presentNpcIdsForEpistemic
                );
                for (const v of offscreenViolations) {
                  pacingRecheckIssues.push({
                    code: "offscreen_npc_direct_speech",
                    severity: "medium",
                    source: "pacing",
                    detail: v,
                    invariant: "offscreen_npc_direct_speech",
                  });
                }
              } catch (e) {
                console.warn("[pacing_recheck] offscreen dialogue check skipped", e);
              }
            }
          }
          const optionsForSafety = Array.isArray(candidateRec.options)
            ? candidateRec.options.filter((value): value is string => typeof value === "string")
            : [];
          const sessionCommittedEntityIdsForSafety = [
            ...new Set([
              ...presentNpcIdsForEpistemic,
              ...String(playerContext ?? "")
                .split(/\r?\n/)
                .flatMap((line) => {
                  const match = line.match(/^\s*(?:active_npc|present_npc|npc)\s*:\s*(.+?)\s*$/i);
                  return match?.[1] ? [match[1].trim()] : [];
                }),
              ...[...String(playerContext ?? "").matchAll(/\bN-\d{3,6}\b/gi)].map((match) => match[0].toUpperCase()),
            ]),
          ];
          let narrativeSafetyReport = narrativeSafetyRuntime.kernelEnabled
            ? collectSafetyReport({
                dmRecord: candidateRec,
                narrative: typeof candidateRec.narrative === "string" ? candidateRec.narrative : null,
                options: optionsForSafety,
                validateNarrativeReport: validatorReport,
                pacingReport,
                npcKnowledgeIssues: [],
                unsupportedFactIssues: [],
                speakerNpcId: focusNpcForPrompt,
                allowedFactIds: allowedWorldFactIdsForValidator,
                usedFactIds: usedFactIdsForSafety,
                worldFacts: verseRollout.enableWorldFactRegistry ? listWorldFacts() : [],
                maxRevealRank: maxRevealRankForMemory,
                stateDelta: postStateDelta,
                intent: normalizedIntent,
                sessionCommittedEntityIds: sessionCommittedEntityIdsForSafety,
              })
            : null;
          // Merge any pacing-triggered NPC consistency recheck issues into the safety report.
          if (pacingRecheckIssues.length > 0 && narrativeSafetyReport) {
            const mergedIssues = [
              ...narrativeSafetyReport.issues,
              ...pacingRecheckIssues.map((issue) => ({
                code: issue.code as NarrativeSafetyReport["issues"][number]["code"],
                severity: issue.severity,
                source: issue.source as NarrativeSafetyReport["issues"][number]["source"],
                ...(issue.detail ? { detail: issue.detail } : {}),
                ...(issue.invariant ? { invariant: issue.invariant as any } : {}),
              })),
            ];
            const newInvariants = [
              ...new Set([
                ...narrativeSafetyReport.invariantsViolated,
                ...pacingRecheckIssues.map((i) => i.invariant).filter((v): v is string => Boolean(v)),
              ]),
            ];
            narrativeSafetyReport = {
              ...narrativeSafetyReport,
              ok: false,
              decision: narrativeSafetyReport.decision === "pass" ? "repair" : narrativeSafetyReport.decision,
              issues: mergedIssues,
              maxSeverity:
                narrativeSafetyReport.maxSeverity === "high" || narrativeSafetyReport.maxSeverity === "medium"
                  ? narrativeSafetyReport.maxSeverity
                  : "medium",
              invariantsViolated: newInvariants,
            };
          }
          // 检测 [mock_scenario:...] 标记：benchmark/eval --mode mock 注入。
          // 标记存在时禁用 entity hard gate，避免 mock 叙事被兜底文案替换。
          const isMockScenarioRequest = /\[mock_scenario:[a-z0-9_]+\]/i.test(String(latestUserInput ?? ""));
          let narrativeSafetyEnforcement = planNarrativeSafetyEnforcement({
            safetyReport: narrativeSafetyReport,
            pacingReport,
            policy: {
              kernelEnabled: narrativeSafetyRuntime.kernelEnabled,
              mode: narrativeSafetyRuntime.mode,
              entityHardGateEnabled: narrativeSafetyRuntime.entityHardGateEnabled && !isMockScenarioRequest,
              pacingValidatorEnabled: narrativeSafetyRuntime.pacingValidatorEnabled,
              laneRequiresHardGate: laneSideEffectPlan.requireNarrativeSafetyHardGate,
            },
          });
          const repairableNarrativeFailure =
            narrativeSafetyRuntime.mode !== "shadow" &&
            (
              Boolean(validatorReport.narrativeOverride) ||
              narrativeSafetyEnforcement.shouldFallback ||
              narrativeSafetyEnforcement.shouldBlockCommit
            ) &&
            !narrativeSafetyEnforcement.promptInjectionBlocked;
          if (repairableNarrativeFailure && canRunFinalRepair()) {
            try {
              const repairIssues = [
                ...validatorReport.issues.map((issue) => ({
                  source: "validateNarrative",
                  code: issue.code,
                  severity: issue.severity,
                  detail: issue.detail,
                  anchor: issue.anchor,
                })),
                ...(narrativeSafetyReport?.issues ?? []).map((issue) => ({
                  source: issue.source,
                  code: issue.code,
                  severity: issue.severity,
                  detail: issue.detail,
                  anchor: issue.anchor,
                })),
              ];
              const hasHookMissing = repairIssues.some((i) => i.code === "hook_missing" || i.detail?.includes("hook_missing"));
              const constraints: string[] = [
                "只修 narrative，不新增状态事实。",
                "保持玩家沉浸，修复失败也用当前场景内的自然承接。",
                "不得出现系统、降级、校验失败、无法生成、内容违规等措辞。",
              ];
              if (hasHookMissing) {
                constraints.push("尾部必须有一个钩子——悬念、危机、抉择、情感或揭示之一。收束拍不能把回合收成彻底安全或解释完毕。");
              }
              const repaired = await repairNarrativeOnly({
                originalNarrative: String(candidateRec.narrative ?? ""),
                originalDmRecord: candidateRec,
                latestUserInput: latestUserInput,
                playerContextSnapshot: playerContext,
                issues: repairIssues,
                constraints,
                ctx: {
                  requestId: requestId,
                  userId: userId,
                  sessionId: sessionId,
                  path: "/api/chat",
                  tags: { phase: "post_validator", purpose: "narrative_repair" },
                },
                signal: pipelineAbort.signal,
                budgetMs: nextFinalRepairBudgetMs(6_000),
                maxChars: narrativeBudget.maxChars,
              });
              if (repaired.ok) {
                candidateRec.narrative = repaired.narrative;
                (resolved as any).narrative = repaired.narrative;
                validatorReport = runNarrativeValidator(candidateRec);
                narrativeSafetyReport = narrativeSafetyRuntime.kernelEnabled
                  ? collectSafetyReport({
                      dmRecord: candidateRec,
                      narrative: typeof candidateRec.narrative === "string" ? candidateRec.narrative : null,
                      options: optionsForSafety,
                      validateNarrativeReport: validatorReport,
                      pacingReport,
                      npcKnowledgeIssues: [],
                      unsupportedFactIssues: [],
                      speakerNpcId: focusNpcForPrompt,
                      allowedFactIds: allowedWorldFactIdsForValidator,
                      usedFactIds: usedFactIdsForSafety,
                      worldFacts: verseRollout.enableWorldFactRegistry ? listWorldFacts() : [],
                      maxRevealRank: maxRevealRankForMemory,
                      stateDelta: postStateDelta,
                      intent: normalizedIntent,
                      sessionCommittedEntityIds: sessionCommittedEntityIdsForSafety,
                    })
                  : null;
                narrativeSafetyEnforcement = planNarrativeSafetyEnforcement({
                  safetyReport: narrativeSafetyReport,
                  pacingReport,
                  policy: {
                    kernelEnabled: narrativeSafetyRuntime.kernelEnabled,
                    mode: narrativeSafetyRuntime.mode,
                    entityHardGateEnabled: narrativeSafetyRuntime.entityHardGateEnabled && !isMockScenarioRequest,
                    pacingValidatorEnabled: narrativeSafetyRuntime.pacingValidatorEnabled,
                    laneRequiresHardGate: laneSideEffectPlan.requireNarrativeSafetyHardGate,
                  },
                });
              }
            } catch (repairErr) {
              console.warn("[api/chat] narrative repair skipped", repairErr);
            }
          }
          const shouldRecordNarrativeSafetyIssue =
            narrativeSafetyEnforcement.decision !== "pass" &&
            !validatorReport.issues.some(
              (issue) =>
                issue.code === "npc_consistency_bridge" &&
                String(issue.detail ?? "").startsWith("narrative_safety_kernel:")
            );
          const effectiveValidatorReport: NarrativeValidationReport = shouldRecordNarrativeSafetyIssue
            ? {
                ...validatorReport,
                ok: false,
                issues: [
                  ...validatorReport.issues,
                  {
                    code: "npc_consistency_bridge",
                    severity: narrativeSafetyEnforcement.shouldBlockCommit ? "high" : "medium",
                    detail: `narrative_safety_kernel:${narrativeSafetyEnforcement.decision}`,
                    ...(narrativeSafetyReport?.issues[0]?.anchor
                      ? { anchor: narrativeSafetyReport.issues[0].anchor }
                      : {}),
                  },
                ],
                narrativeOverride: null,
                telemetry: {
                  ...validatorReport.telemetry,
                  totalIssues: validatorReport.telemetry.totalIssues + 1,
                  byCode: {
                    ...validatorReport.telemetry.byCode,
                    npc_consistency_bridge:
                      (validatorReport.telemetry.byCode.npc_consistency_bridge ?? 0) + 1,
                  },
                  safeNarrativeFallbackApplied: false,
                  narrativeGovernanceFinalSafe: !narrativeSafetyEnforcement.shouldBlockCommit,
                },
              }
            : validatorReport;
          const factCommitGateResult = verseRollout.enableFactCommitGate
            ? gateFactCommit({
                resolvedDmTurn: candidateRec,
                candidateFacts: candidateFactsForGate,
                validatorIssues: effectiveValidatorReport.issues,
                maxRevealRank: maxRevealRankForMemory,
              })
            : null;
          const commitResult = commitTurn({
            requestId: requestId,
            sessionId: sessionId,
            turnIndex: totalRounds,
            candidateDmRecord: candidateRec,
            delta: postStateDelta,
            validatorReport: effectiveValidatorReport,
            safetyReport: narrativeSafetyReport,
            pacingReport,
            safetyPolicy: {
              kernelEnabled: narrativeSafetyRuntime.kernelEnabled,
              mode: narrativeSafetyRuntime.mode,
              entityHardGateEnabled: narrativeSafetyRuntime.entityHardGateEnabled && !isMockScenarioRequest,
              pacingValidatorEnabled: narrativeSafetyRuntime.pacingValidatorEnabled,
              laneRequiresHardGate: laneSideEffectPlan.requireNarrativeSafetyHardGate,
            },
            factCommitGateResult,
            gameLanguage: validated.language,
          });
          const committedRecord = commitResult.committedDmRecord;
          const commitControlledFields = [
            ...COMMIT_STATE_CHANGING_FIELDS,
            ...COMMIT_STATE_MIRROR_FIELDS,
            ...COMMIT_RECORD_OVERRIDE_FIELDS,
          ] as const;
          for (const field of commitControlledFields) {
            if (field in committedRecord) {
              (resolved as any)[field] = committedRecord[field];
            } else if (commitResult.summary.blockedCommitFields.includes(field)) {
              delete (resolved as any)[field];
            }
          }
          // Narrative safety may conservatively clear a candidate change set.
          // Reassert only authored, structured mechanics after that decision so
          // a registered task delivery or registered combat action cannot become
          // randomly non-playable because the model prose was repaired/blocked.
          resolved = applyRegisteredMechanicsGuard({ dmRecord: resolved, latestUserInput: latestUserInput, clientState: clientState });
          recordNarrativeGovernanceOutcome(commitResult.summary.narrativeGovernanceTelemetry);
          commitSummaryForAnalytics = commitResult.summary;
          void commitSummaryForAnalytics; // signal usage across try/catch for eslint dataflow

          if (effectiveValidatorReport.optionsOverride) {
            (resolved as any).options = [...effectiveValidatorReport.optionsOverride];
            if (Array.isArray((resolved as any).decision_options)) {
              (resolved as any).decision_options = [...effectiveValidatorReport.optionsOverride];
            }
            // Phase 8.5: validator cleared options for safety.
            // The actual regen is deferred to the unified block below.
            const overriddenOpts = Array.isArray((resolved as any).options)
              ? ((resolved as any).options as unknown[]).filter(
                  (x): x is string => typeof x === "string" && x.trim().length > 0
                )
              : [];
            optsRegenState.validatorOverrideApplied = true;
            optsRegenState.validatorOverriddenOptCount = overriddenOpts.length;
          }

          // --- Unified options regen ---
          // Consolidates the 5 former LLM call sites (pre-resolve, turn-mode fix,
          // quality gate, post-resolve, post-validator) into a single decision + one call.
          if (canRunFinalRepair() && !deferPlayableOptsToSeparateRequest) {
            const rolloutNow = getVerseCraftRolloutFlags();
            const regenDecision = evaluateUnifiedOptionsRegen({
              preResolveNarrativeOptCount: optsRegenState.preResolveNarrativeOptCount,
              preResolveFreeze: optsRegenState.preResolveFreeze,
              plannedTurnMode: plannedTurnMode.mode,
              turnModeFilteredOptCount: optsRegenState.turnModeFilteredOptCount,
              turnModeFilteredDecCount: optsRegenState.turnModeFilteredDecCount,
              enableDecisionOptionQualityGate: rolloutNow.enableDecisionOptionQualityGate,
              resolvedTurnMode: String((resolved as any).turn_mode ?? ""),
              dedupedDecisionOptCount: optsRegenState.dedupedDecisionOptCount,
              postResolveSkipReason: optsRegenState.postResolveSkipReason,
              enableOptionsAutoRegenOnEmpty: optsRegenState.enableOptionsAutoRegenOnEmpty,
              resolvedOptCount: optsRegenState.resolvedOptCount,
              validatorOverrideApplied: optsRegenState.validatorOverrideApplied,
              validatorOverriddenOptCount: optsRegenState.validatorOverriddenOptCount,
              canRunFinalRepair: true,
              deferPlayableOptsToSeparateRequest: false,
              budgetPreResolveMs: nextFinalRepairBudgetMs(OPTIONS_REGEN_LATENCY_BUDGET.repairAttemptTimeoutMs),
              budgetDecisionFixMs: nextFinalRepairBudgetMs(OPTIONS_REGEN_LATENCY_BUDGET.repairAttemptTimeoutMs),
              budgetQualityGateMs: nextFinalRepairBudgetMs(1_800),
              budgetPostResolveMs: nextFinalRepairBudgetMs(4_500),
              budgetValidatorMs: nextFinalRepairBudgetMs(4_500),
            });

            if (regenDecision.shouldRegen) {
              const repairStartedAt = Date.now();
              try {
                if (regenDecision.regenType === "decision_options") {
                  const regen = await generateDecisionOptionsOnlyFallback({
                    narrative: String((resolved as any).narrative ?? ""),
                    latestUserInput: latestUserInput,
                    playerContext: playerContext,
                    ctx: {
                      requestId: requestId, userId: userId, sessionId: sessionId, path: "/api/chat",
                      tags: { phase: "unified_regen", purpose: regenDecision.reason },
                    },
                    signal: pipelineAbort.signal,
                    outputLanguage: validated.language,
                    budgetMs: regenDecision.budgetMs,
                  });
                  optionsRepairUsedTelemetry = true;
                  optionsRepairMsTelemetry = Math.max(0, Date.now() - repairStartedAt);
                  if (regen.ok) {
                    recordDecisionOptionsFixOutcome(true);
                    (resolved as any).decision_options = regen.decision_options;
                    (resolved as any).options = regen.decision_options;
                    (resolved as any).turn_mode = "decision_required";
                    (resolved as any).decision_required = true;
                  }
                } else {
                  let regen = await generateOptionsOnlyFallback({
                    narrative: String((resolved as any).narrative ?? ""),
                    latestUserInput: latestUserInput,
                    playerContext: playerContext,
                    ctx: {
                      requestId: requestId, userId: userId, sessionId: sessionId, path: "/api/chat",
                      tags: { phase: "unified_regen", purpose: regenDecision.reason },
                    },
                    signal: pipelineAbort.signal,
                    systemExtra: rolloutNow.enableOptionsOnlyRegenPathV2
                      ? buildOptionsOnlySystemPrompt()
                      : "",
                    outputLanguage: validated.language,
                    budgetMs: regenDecision.budgetMs,
                  });
                  if (!regen.ok && canRunFinalRepair()) {
                    regen = await generateOptionsOnlyFallback({
                      narrative: String((resolved as any).narrative ?? ""),
                      latestUserInput: latestUserInput,
                      playerContext: playerContext,
                      ctx: {
                        requestId: requestId, userId: userId, sessionId: sessionId, path: "/api/chat",
                        tags: { phase: "unified_regen", purpose: regenDecision.reason, retryPass: true },
                      },
                      signal: pipelineAbort.signal,
                      systemExtra: rolloutNow.enableOptionsOnlyRegenPathV2
                        ? buildOptionsOnlySystemPrompt()
                        : "",
                      outputLanguage: validated.language,
                      budgetMs: nextFinalRepairBudgetMs(3_500),
                    });
                  }
                  optionsRepairUsedTelemetry = true;
                  optionsRepairMsTelemetry = Math.max(0, Date.now() - repairStartedAt);
                  if (regen.ok) {
                    (resolved as any).options = regen.options;
                    if (Array.isArray((resolved as any).decision_options)) {
                      (resolved as any).decision_options = [...regen.options];
                    }
                    if (regenDecision.reason === "validator_override_cleared_options") {
                      recordOptionsAutoRegenOutcome(true);
                    }
                  }
                }
              } catch (regenErr) {
                console.warn("[api/chat] unified options regen failed", regenErr);
              }
            }
          }

          if (effectiveValidatorReport.narrativeOverride) {
            try {
              const parsedSafe = JSON.parse(effectiveValidatorReport.narrativeOverride) as Record<string, unknown>;
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
          const committedAudit = commitResult.committedDmRecord._narrative_audit;
          if (committedAudit && typeof committedAudit === "object" && !Array.isArray(committedAudit)) {
            (resolved as any)._narrative_audit = committedAudit;
          }
          const narrativeLedgerOutput = buildRouteModelOutputFromResolvedTurn({
            resolved: resolved as unknown as Record<string, unknown>,
            latestUserInput: latestUserInput,
          });
          const narrativeLedgerCheck = buildRouteNarrativeCheckResult({
            output: narrativeLedgerOutput,
            validatorReport: effectiveValidatorReport,
            commitSummary: commitResult.summary,
          });
          try {
            const rollout = getVerseCraftRolloutFlags();
            if (rollout.enableProvenanceVerifierShadow) {
              const npcRuntimeState = focusNpcForPrompt
                ? (() => {
                    const view = buildNpcHeartRuntimeView({
                      npcId: focusNpcForPrompt,
                      relationPartial: {},
                      locationId:
                        postStateDelta.playerLocation ??
                        guessPlayerLocationFromContext(playerContext) ??
                        "B1_SafeZone",
                      activeTaskIds: [],
                      hotThreatPresent: (pipelineControl?.risk_tags ?? []).some((tag) =>
                        String(tag).toLowerCase().includes("threat")
                      ),
                      maxRevealRank: maxRevealRankForMemory,
                      presentNpcIds: presentNpcIdsForEpistemic ?? [],
                    });
                    return view
                      ? buildNpcRuntimeStateV1({
                          view,
                          maxRevealRank: maxRevealRankForMemory,
                        })
                      : null;
                  })()
                : null;
              const claims = extractNarrativeClaims(resolved as unknown as Record<string, unknown>);
              const verification = verifyClaimsAgainstEvidence(
                claims,
                runtimeLorePacket?.evidenceBundle ?? [],
                npcRuntimeState
              );
              provenanceVerifierTelemetry = summarizeVerificationForTelemetry(verification);
              applyHighRiskWarningsShadowMode(verification);
            }
          } catch (verifierError) {
            console.warn("[api/chat] provenance verifier shadow skipped", verifierError);
          }
          void (async () => {
            try {
              const dialogueContext = await buildDialogueContext({
                requestId: requestId,
                sessionId: sessionId,
                userId: userId,
                latestUserInput: latestUserInput,
                messages: rawChatMessages,
                playerContext: playerContext,
                clientState: clientState,
                clientPurpose: clientPurpose,
                turnIndex: totalRounds,
                worldId: "base_apartment",
                sceneId: postStateDelta.playerLocation ?? null,
                activeNpcId: focusNpcForPrompt,
                revealTier: maxRevealRankForMemory,
                sessionMemory: sessionMemory,
                lorePacket: runtimeLorePacket,
                recentlyEncounteredEntities: presentNpcIdsForEpistemic ?? [],
              });
              const narrativeEventCommit = await commitNarrativeEvents({
                context: dialogueContext,
                checked: narrativeLedgerCheck,
                legacyCommitSummary: commitResult.summary,
              });
              await logNarrativeRun({
                requestId: requestId,
                sessionId: sessionId,
                userId: userId,
                turnIndex: totalRounds,
                ttftMs:
                  ttftProfile.firstSseWriteAt !== null
                    ? Math.max(0, ttftProfile.firstSseWriteAt - ttftProfile.requestReceivedAt)
                    : undefined,
                totalLatencyMs: Math.max(0, nowMs() - requestStartedAt),
                loreHitCount: loreSourceCount,
                validatorIssueCount: effectiveValidatorReport.telemetry.totalIssues,
                degradeReason: narrativeLedgerCheck.degradeReason ?? null,
                commitFlags: narrativeEventCommit.commitFlags,
                meta: {
                  providerRole: routingReport.actualLogicalRole ?? null,
                  routeLane: turnLaneDecision.lane,
                  contextBuildDegrade: null,
                  checkerIssues: narrativeLedgerCheck.issues,
                  loreRetrieval: {
                    usedCounts: {
                      sourceCount: loreSourceCount,
                      cacheHit: loreCacheHit,
                      fallbackPath: loreFallbackPath,
                      budgetHit: loreBudgetHit,
                      tokenEstimate: loreTokenEstimate,
                    },
                    hitCount: loreSourceCount,
                  },
                  modelParseFallback: finalJsonParseSuccess ? null : "parse_accumulated_player_dm_json_failed",
                  commitResult: narrativeEventCommit,
                  narrativeGovernanceTelemetry: commitResult.summary.narrativeGovernanceTelemetry,
                  provenanceVerifier: provenanceVerifierTelemetry,
                },
              });
            } catch (ledgerError) {
              console.warn("[api/chat] narrative engine ledger skipped", ledgerError);
            }
          })();
          if (effectiveValidatorReport.telemetry.totalIssues > 0 && epistemicRolloutFlags.epistemicDebugLog) {
            epistemicDebugLog("narrative_validator_report", {
              requestId: requestId,
              sessionId: sessionId,
              totalIssues: effectiveValidatorReport.telemetry.totalIssues,
              byCode: effectiveValidatorReport.telemetry.byCode,
              optionsOverrideApplied: effectiveValidatorReport.telemetry.optionsOverrideApplied,
              safeNarrativeFallbackApplied: effectiveValidatorReport.telemetry.safeNarrativeFallbackApplied,
            });
          }
          if (epistemicRolloutFlags.epistemicDebugLog) {
            epistemicDebugLog("turn_commit_summary", {
              requestId: requestId,
              sessionId: sessionId,
              turnIndex: totalRounds,
              degraded: commitResult.summary.degraded,
              optionsRewriteApplied: commitResult.summary.optionsRewriteApplied,
              safeNarrativeFallbackApplied: commitResult.summary.safeNarrativeFallbackApplied,
              commitFlags: commitResult.summary.commitFlags,
              deltaSummary: commitResult.summary.deltaSummary,
              safetyIssueCounts: commitResult.summary.safetyIssueCounts,
              pacingIssueCounts: commitResult.summary.pacingIssueCounts,
              blockedCommitFields: commitResult.summary.blockedCommitFields,
              fallbackApplied: commitResult.summary.fallbackApplied,
              entityAuditSummary: commitResult.summary.entityAuditSummary,
              narrativeGovernanceTelemetry: commitResult.summary.narrativeGovernanceTelemetry,
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
              userId: userId,
              guestId: userId ? null : chatGuestId,
              sessionId: capturedSessionIdAnalytics,
              eventName: "turn_commit_summary",
              eventTime: new Date(),
              page: "/play",
              source: "chat",
              platform: platform,
              tokenCost: 0,
              playDurationDeltaSec: 0,
              payload: {
                requestId: requestId,
                turnIndex: totalRounds,
                lane: turnLaneDecision.lane,
                laneReasons: [...turnLaneDecision.reasons],
                degraded: commitResult.summary.degraded,
                optionsRewriteApplied: commitResult.summary.optionsRewriteApplied,
                safeNarrativeFallbackApplied: commitResult.summary.safeNarrativeFallbackApplied,
                commitFlags: [...commitResult.summary.commitFlags],
                deltaSummary: commitResult.summary.deltaSummary,
                validatorIssueCounts: commitResult.summary.validatorIssueCounts,
                safetyIssueCounts: commitResult.summary.safetyIssueCounts,
                pacingIssueCounts: commitResult.summary.pacingIssueCounts,
                blockedCommitFields: commitResult.summary.blockedCommitFields,
                fallbackApplied: commitResult.summary.fallbackApplied,
                entityAuditSummary: commitResult.summary.entityAuditSummary,
                narrativeGovernanceTelemetry: commitResult.summary.narrativeGovernanceTelemetry,
                narrativeSafetyKernel: {
                  enabled: narrativeSafetyRuntime.kernelEnabled,
                  mode: narrativeSafetyRuntime.mode,
                  decision: narrativeSafetyEnforcement.decision,
                  reportDecision: narrativeSafetyReport?.decision ?? "disabled",
                  ok: narrativeSafetyReport?.ok ?? true,
                  maxSeverity: narrativeSafetyReport?.maxSeverity ?? null,
                  invariantsViolated: narrativeSafetyReport?.invariantsViolated ?? [],
                  telemetry: narrativeSafetyReport?.telemetry ?? null,
                  hardGateApplied: narrativeSafetyEnforcement.shouldBlockCommit,
                  fallbackApplied: false,
                },
              },
            }).catch(() => {});
            const narrativeSafetyTelemetryEvents = buildNarrativeSafetyTelemetryEvents({
              requestId: requestId,
              sessionId: capturedSessionIdAnalytics,
              turnIndex: totalRounds,
              config: narrativeSafetyRuntime,
              enforcement: narrativeSafetyEnforcement,
              safetyReport: narrativeSafetyReport,
              pacingReport,
              commitSummary: commitResult.summary,
              lane: turnLaneDecision.lane,
              laneReasons: turnLaneDecision.reasons,
              model: routingReport.actualLogicalRole ?? routingReport.intendedRole,
              task: "PLAYER_CHAT",
            });
            for (const event of narrativeSafetyTelemetryEvents) {
              pushNarrativeSafetyTelemetryEvent(event);
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:${event.eventName}`,
                idempotencyKey: `${requestId}:${event.eventName}`,
                userId: userId,
                guestId: userId ? null : chatGuestId,
                sessionId: capturedSessionIdAnalytics,
                eventName: asAnalyticsEventName(event.eventName),
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform: platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: event.payload,
              }).catch(() => {});
            }
            if (effectiveValidatorReport.telemetry.totalIssues > 0) {
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:narrative_validator_issue`,
                idempotencyKey: `${requestId}:narrative_validator_issue`,
                userId: userId,
                guestId: userId ? null : chatGuestId,
                sessionId: capturedSessionIdAnalytics,
                eventName: "narrative_validator_issue",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform: platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId: requestId,
                  turnIndex: totalRounds,
                  lane: turnLaneDecision.lane,
                  totalIssues: effectiveValidatorReport.telemetry.totalIssues,
                  byCode: effectiveValidatorReport.telemetry.byCode,
                  optionsOverrideApplied: effectiveValidatorReport.telemetry.optionsOverrideApplied,
                  safeNarrativeFallbackApplied: effectiveValidatorReport.telemetry.safeNarrativeFallbackApplied,
                  styleIssueCount: effectiveValidatorReport.telemetry.styleIssueCount,
                  styleDriftCount: effectiveValidatorReport.telemetry.styleDriftCount,
                  mechanicalExpositionCount: effectiveValidatorReport.telemetry.mechanicalExpositionCount,
                  npcKnowledgeIssueCount: effectiveValidatorReport.telemetry.npcKnowledgeIssueCount,
                  rootCauseLeakCount: effectiveValidatorReport.telemetry.rootCauseLeakCount,
                  unsupportedFactCount: effectiveValidatorReport.telemetry.unsupportedFactCount,
                  unsupportedRelationshipClaimCount: effectiveValidatorReport.telemetry.unsupportedRelationshipClaimCount,
                  narrativeGovernanceFinalSafe: commitResult.summary.narrativeGovernanceTelemetry.narrativeGovernanceFinalSafe,
                  issueCodes: effectiveValidatorReport.issues.map((x) => x.code),
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
        resolvedForClient = mergeAutoCapturedCodexUpdates(
          resolvedForClient as unknown as Record<string, unknown>,
          { maxMatches: 12 }
        ) as unknown as ResolvedDmTurn;
        // mock scenario 请求保留选项字段（benchmark/eval 需要检查 optionsCount）
        const isStreamFinalMockRequest = /\[mock_scenario:[a-z0-9_]+\]/i.test(String(latestUserInput ?? ""));
        if (!isStreamFinalMockRequest && shouldApplyDeferredOptionsStrip(
            verseRolloutSnapshot.deferMainTurnOptionsToClient,
            validated.clientPurpose,
            resolvedForClient as unknown as Record<string, unknown>
          )
        ) {
          resolvedForClient = stripPlayableOptionsForDeferredClientDelivery(resolvedForClient);
        }
        finalizePayload = JSON.stringify(resolvedForClient);
        moderationBody = finalizePayload;
      } else {
        // 褰撲笂娓歌繑鍥為潪涓ユ牸 JSON 鎴栭噸澶嶆嫾鎺ュ璞℃椂锛屽己鍒跺洖钀藉埌鏍囧噯 DM JSON 褰㈢姸锛屼繚璇?SSE 濂戠害绋冲畾銆?        finalizePayload = sanitizeAssistantContent(accumulatedText);
        fallbackUsedTelemetry = true;
        finalizePayload = fallbackPayload;
        moderationBody = fallbackPayload;
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
            isOpeningTurn: Boolean(shouldApplyFirstActionConstraint),
            language: validated.language,
          });

          dmRecord = outputAudit.updatedDmRecord;
          // Output auditing reconstructs a resolved DM envelope. Reapply
          // authored mechanics afterwards: otherwise the audit round-trip can
          // erase a deterministic state transition that was already
          // adjudicated (for example, consuming the registered letter while
          // completing its delivery task).
          let auditedResolved = resolveDmTurn(
            applyRegisteredMechanicsGuard({
              dmRecord,
              latestUserInput: latestUserInput,
              clientState: clientState,
            })
          );
          if (!shouldSkipItemOptionInjection({ resolved: auditedResolved, clientPurpose: validated.clientPurpose })) {
            auditedResolved = applyItemGameplayOptionInjection(auditedResolved, clientState);
          }
          auditedResolved = mergeAutoCapturedCodexUpdates(
            auditedResolved as unknown as Record<string, unknown>,
            { maxMatches: 12 }
          ) as unknown as ResolvedDmTurn;
          // mock scenario 请求保留选项字段（benchmark/eval 需要检查 optionsCount）
          const isAuditMockRequest = /\[mock_scenario:[a-z0-9_]+\]/i.test(String(latestUserInput ?? ""));
          if (!isAuditMockRequest && shouldApplyDeferredOptionsStrip(
              verseRolloutSnapshot.deferMainTurnOptionsToClient,
              validated.clientPurpose,
              auditedResolved as unknown as Record<string, unknown>
            )
          ) {
            auditedResolved = stripPlayableOptionsForDeferredClientDelivery(auditedResolved);
          }
          finalizePayload = JSON.stringify(auditedResolved);
          moderationBody = finalizePayload;

          // v4 全链路人名白名单 — Phase-N final guard：
          // 二次扫 narrative 残留未注册人名；高置信命中仅匿名化姓名。
          // mock scenario 请求跳过此 guard（mock 叙事不含注册人名，可能触发姓氏误报如"张泛黄"）。
          if (!isAuditMockRequest) {
            const residualText = String(auditedResolved.narrative ?? "");
            if (residualText) {
              const residual = extractChineseNames(residualText, {
                registeredNames: NPC_NAME_SET,
                aliases: NPC_ALIAS_SET,
              });
              const unregistered = residual.filter(
                (r) => r.candidate && r.token.length >= 2 && !r.registered,
              );
              const hasHighConfidenceUnregistered = unregistered.some(isHighConfidenceUnregisteredPersonName);
              if (hasHighConfidenceUnregistered) {
                auditedResolved = {
                  ...auditedResolved,
                  // Preserve the player's actual action and the generated
                  // scene consequence.  An unknown proper name is unsafe to
                  // commit, but replacing the *entire* turn with a static
                  // sentence destroys continuity and makes repeats likely.
                  narrative:
                    validated.language === "en-US"
                      ? "I stop at the edge of the corridor and listen. Whatever moved in the dark has not gone far; I need to choose carefully."
                      : redactHighConfidenceUnregisteredPersonNames(residualText, unregistered),
                  _commit_flags: [
                    ...(Array.isArray(auditedResolved._commit_flags)
                      ? (auditedResolved._commit_flags as unknown[]).map(String)
                      : []),
                    "unregistered_name_redacted_v1",
                  ],
                };
                finalizePayload = JSON.stringify(auditedResolved);
                moderationBody = finalizePayload;
              } else if (unregistered.length > 0) {
                // Keep the signal for audit, but do not replace a complete turn
                // based solely on a high-recall Chinese name heuristic.
                auditedResolved = {
                  ...auditedResolved,
                  _commit_flags: [
                    ...(Array.isArray(auditedResolved._commit_flags)
                      ? (auditedResolved._commit_flags as unknown[]).map(String)
                      : []),
                    "unregistered_name_low_confidence_audited_v1",
                  ],
                };
                finalizePayload = JSON.stringify(auditedResolved);
                moderationBody = finalizePayload;
              }
            }
          }

          // The prompt is the primary language control, but a mixed-language
          // upstream turn must never be committed to an English play surface.
          // This exceptional final hook only translates already-resolved display
          // copy; state deltas remain untouched. If translation fails, fail
          // closed to a neutral English line and let the bounded options-only
          // path restore choices on the next client tick.
          if (
            validated.language === "en-US" &&
            envBoolean("VERSECRAFT_ENABLE_FINAL_LANGUAGE_GUARD", true) &&
            hasWrongGameplayTurnLanguage(auditedResolved, validated.language)
          ) {
            const sourceOptions = Array.isArray(auditedResolved.decision_options) && auditedResolved.decision_options.length > 0
              ? auditedResolved.decision_options
              : Array.isArray(auditedResolved.options)
                ? auditedResolved.options
                : [];
            const localized = await localizeGameplayPresentation({
              narrative: String(auditedResolved.narrative ?? ""),
              options: sourceOptions.filter((option): option is string => typeof option === "string"),
              language: validated.language,
              ctx: {
                requestId: requestId,
                userId: userId,
                sessionId: sessionId,
                path: "/api/chat",
                tags: { phase: "final_language_guard" },
              },
              signal: pipelineAbort.signal,
            });
            if (localized.ok) {
              auditedResolved = {
                ...auditedResolved,
                narrative: localized.value.narrative,
                options: localized.value.options,
                decision_options: localized.value.options,
                _commit_flags: [
                  ...(Array.isArray(auditedResolved._commit_flags)
                    ? (auditedResolved._commit_flags as unknown[]).map(String)
                    : []),
                  "english_presentation_localized_v1",
                ],
              };
            } else {
              auditedResolved = {
                ...auditedResolved,
                narrative: "I pause at the edge of the scene and listen. The danger has not passed, so I need to choose my next move carefully.",
                options: [],
                decision_options: [],
                _commit_flags: [
                  ...(Array.isArray(auditedResolved._commit_flags)
                    ? (auditedResolved._commit_flags as unknown[]).map(String)
                    : []),
                  `english_presentation_fallback_v1:${localized.reason}`,
                ],
              };
            }
            finalizePayload = JSON.stringify(auditedResolved);
            moderationBody = finalizePayload;
          }

          if (outputAudit.verdict === "reject") {
            const reason = outputAudit.reasonCode || "output_reject";
            const blockedMessage = resolveVisibleSafetyMessageForTurn(
              visibleSafetyDegradeMessageFor(reason),
              Boolean(shouldApplyFirstActionConstraint),
              validated.language
            );

            recordHighRisk({ ip: clientIp, sessionId: sessionId, userId: userId }, `output_reject:${reason}`);
            writeAuditTrail({
              requestId: requestId,
              sessionId: sessionId,
              userId: userId,
              ip: clientIp,
              stage: "final_output",
              riskLevel: "black",
              action: "degrade",
              triggeredRule: reason,
              provider: outputAudit.providerRiskSummary?.providers?.join(",") ?? "none",
              summary: blockedAuditSummary,
            });

            if (blockedMessage) {
              await writer.write(
                sse(
                  safeBlockedDmJson(blockedMessage, {
                    action: "degrade",
                    stage: "final_output",
                    riskLevel: "black",
                    requestId: requestId,
                    reason,
                  })
                )
              );
              await writer.close();
              return true;
            }
            console.warn("[api/chat] non-visible output reject recorded without narrative fallback", {
              requestId: requestId,
              reason,
            });
          }
        } catch (e: unknown) {
          console.warn("[api/chat] output audit skipped due to error", e);
          // If output audit fails unexpectedly, keep the existing finalized payload.
          // Streaming chunks already passed local moderation.
        }
      }

      if (finalizePayload && isLikelyValidDMJson(finalizePayload)) {
        const guardedFinal = applyRegisteredMechanicsGuard({
          dmRecord: JSON.parse(finalizePayload) as Record<string, unknown>,
          latestUserInput,
          clientState,
        });
        finalizePayload = JSON.stringify(guardedFinal);
        moderationBody = finalizePayload;
      }

      if (finalizePayload) {
        const finalModeration = await finalOutputModeration({
          input: moderationBody,
          userId: userId,
          ip: clientIp,
          path: "/api/chat",
          requestId: requestId,
        });

        if (finalModeration.policy.blocked) {
          recordHighRisk(
            { ip: clientIp, sessionId: sessionId ?? undefined, userId: userId ?? undefined },
            finalModeration.result.reason
          );
          writeAuditTrail({
            requestId: requestId,
            sessionId: sessionId,
            userId: userId,
            ip: clientIp,
            stage: "final_output",
            riskLevel: "black",
            action: "degrade",
            triggeredRule: finalModeration.result.reason,
            provider: finalModeration.provider,
            summary: blockedAuditSummary,
          });

          const narrative = resolveVisibleSafetyMessageForTurn(
            visibleSafetyDegradeMessageFor(finalModeration.result.reason),
            Boolean(shouldApplyFirstActionConstraint),
            validated.language
          );
          if (narrative) {
            await writer.write(
              sse(
                safeBlockedDmJson(narrative, {
                  action: "degrade",
                  stage: "final_output",
                  riskLevel: "black",
                  requestId: requestId,
                  reason: finalModeration.result.reason,
                })
              )
            );
            await writer.close();
            return true;
          }
          console.warn("[api/chat] non-visible final moderation block recorded without narrative fallback", {
            requestId: requestId,
            reason: finalModeration.result.reason,
          });
        }
      }

      let finalDmRecordForBackground: Record<string, unknown> | null = null;
      if (finalizePayload) {
        try {
          const parsedForMetrics = JSON.parse(finalizePayload) as Record<string, unknown>;
          parsedForMetrics._eval_metrics = {
            input_tokens: latestStreamUsage?.promptTokens ?? null,
            output_tokens: latestStreamUsage?.completionTokens ?? null,
            cached_input_tokens: latestStreamUsage?.cachedPromptTokens ?? null,
            prompt_component_chars: promptComponentChars,
          };
          finalizePayload = JSON.stringify(parsedForMetrics);
          finalDmRecordForBackground = parsedForMetrics;
          const finalOptions = Array.isArray(parsedForMetrics.options)
            ? parsedForMetrics.options.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : [];
          finalOptionsCountTelemetry = finalOptions.length;
          finalOptionsQualityPassTelemetry = finalOptions.length === 4 && filterNarrativeActionOptions(finalOptions, 4).length === 4;
        } catch {
          finalOptionsCountTelemetry = 0;
          finalOptionsQualityPassTelemetry = false;
        }
        // Inject Langfuse trace ID into main path FINAL JSON (for calibration/score upload)
        try {
          const lfFinal = JSON.parse(finalizePayload);
          const lfTraceId = getLangfuseTraceId(requestId);
          if (lfTraceId) {
            lfFinal._langfuse_trace_id = lfTraceId;
            finalizePayload = JSON.stringify(lfFinal);
          }
        } catch { /* best-effort */ }
        // Bridge: inject server world-engine director state so the client
        // StoryDirector can reconcile its local beat/tension against the
        // server's computed pacing signals.
        if (sessionId && worldDirectorConfig.enabled) {
          try {
            const serverDirector = await loadDirectorState(sessionId);
            if (serverDirector) {
              const payloadObj = JSON.parse(finalizePayload) as Record<string, unknown>;
              payloadObj.server_director_state = {
                directorIntent: serverDirector.recentDirectorIntent,
                currentPhase: serverDirector.phase,
                pacingSummary: {
                  tension: serverDirector.pacing.tension,
                  mystery: serverDirector.pacing.mystery,
                  fatigue: serverDirector.pacing.fatigue,
                  progress: serverDirector.pacing.progress,
                  agency_health: serverDirector.pacing.agency_health,
                  reveal_pressure: serverDirector.pacing.reveal_pressure,
                },
                turnIndex: serverDirector.turnIndex,
              };
              finalizePayload = JSON.stringify(payloadObj);
            }
          } catch {
            // best-effort: never block the online turn on a director-state read
          }
        }
        await writer.write(sse(`${VERSECRAFT_FINAL_PREFIX}${finalizePayload}`));
        finalFrameWritten = true;
        const playerEchoFlags = getVerseCraftRolloutFlags();
        if (playerEchoFlags.enablePlayerEchoCanon && playerEchoFlags.enablePlayerEchoPersistence) {
          schedulePlayerEchoPersistFromTurn({
            flags: playerEchoFlags,
            userId: userId,
            runId: sessionId,
            dmRecord: finalDmRecordForBackground ?? dmRecord,
            runSnapshotV2: null,
            turnCommitSummary: commitSummaryForAnalytics,
            latestUserInput: latestUserInput,
            nowIso: new Date().toISOString(),
          });
        }
        if (sessionId && injectedDirectorAgendaIds.length > 0) {
          const capturedAgendaIds = [...injectedDirectorAgendaIds];
          void markDirectorAgendaInjected({
            sessionId: sessionId,
            agendaIds: capturedAgendaIds,
            turnIndex: totalRounds,
            requestId: requestId,
          })
            .then(() =>
              recordGenericAnalyticsEvent({
                eventId: `${requestId}:director_agenda_injected`,
                idempotencyKey: `${requestId}:director_agenda_injected`,
                userId: userId,
                guestId: userId ? null : chatGuestId,
                sessionId: sessionId,
                eventName: "director_agenda_injected",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform: platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId: requestId,
                  agendaIds: capturedAgendaIds,
                  agendaCount: capturedAgendaIds.length,
                  directorMode: worldDirectorConfig.mode,
                },
              })
            )
            .catch(() => {});
        }
        if (sessionId && dueDirectorAgendaForPrompt.length > 0 && typeof dmRecord.narrative === "string") {
          const adoption = detectDirectorHintAdoption(
            String(dmRecord.narrative),
            dueDirectorAgendaForPrompt
          );
          directorAdoptionTelemetry = {
            adoptedCount: adoption.adoptedCount,
            adoptionRate: adoption.adoptionRate,
            directorAgendaCount: dueDirectorAgendaForPrompt.length,
          };
          void recordGenericAnalyticsEvent({
            eventId: `${requestId}:director_hint_adoption`,
            idempotencyKey: `${requestId}:director_hint_adoption`,
            userId: userId,
            guestId: userId ? null : chatGuestId,
            sessionId: sessionId,
            eventName: "director_hint_adoption",
            eventTime: new Date(),
            page: "/play",
            source: "chat",
            platform: platform,
            tokenCost: 0,
            playDurationDeltaSec: 0,
            payload: {
              requestId: requestId,
              agendaCount: dueDirectorAgendaForPrompt.length,
              adoptedCount: adoption.adoptedCount,
              adoptionRate: adoption.adoptionRate,
              missedItems: adoption.missedItems,
              directorMode: worldDirectorConfig.mode,
            },
          }).catch(() => {});
        }
        if (sessionId && injectedSocialEventIds.length > 0) {
          const capturedSocialEventIds = [...injectedSocialEventIds];
          void markSocialEventsProjected(sessionId, capturedSocialEventIds)
            .then((projectedCount) =>
              recordGenericAnalyticsEvent({
                eventId: `${requestId}:social_world_hint_projected`,
                idempotencyKey: `${requestId}:social_world_hint_projected`,
                userId: userId,
                guestId: userId ? null : chatGuestId,
                sessionId: sessionId,
                eventName: "social_world_hint_projected",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform: platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId: requestId,
                  socialWorldMode: socialProjectionTelemetry.socialWorldMode,
                  socialHintCount: socialProjectionTelemetry.socialHintCount,
                  socialHintChars: socialProjectionTelemetry.socialHintChars,
                  socialPromptChars: socialProjectionTelemetry.socialPromptChars,
                  socialQueryLatencyMs: socialProjectionTelemetry.socialQueryLatencyMs,
                  socialHintVisibilityCounts: socialProjectionTelemetry.socialHintVisibilityCounts,
                  socialEventsProjected: projectedCount,
                  socialProjectionSkippedReason: socialProjectionTelemetry.socialProjectionSkippedReason,
                },
              })
            )
            .catch(() => {});
        }
        if (sessionId && worldDirectorConfig.enabled) {
          void expireStaleDirectorAgenda({ sessionId: sessionId, turnIndex: totalRounds }).catch(() => {});
        }
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
              .values({ userId: userId,
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
            requestId: requestId,
            latestUserInput: latestUserInput,
            dmRecord: dmForWriteback,
            sessionMemorySummary: sessionMemory?.plot_summary ?? null,
            ruleHits: preflightTurnMetrics.ran
              ? [`preflight:${preflightTurnMetrics.ok ? "ok" : "not_ok"}`]
              : ["preflight:skipped"],
            userId: userId,
            sessionId: sessionId,
            maxFacts: 10,
          })
            .then((writeback) => {
              logAiTelemetry({
                requestId: requestId,
                task: "PLAYER_CHAT",
                providerId: "oneapi",
                logicalRole: "control",
                phase: "success",
                userId: userId,
                factIngestionCount: writeback.extractedCount,
                factConflictCount: writeback.rejectedCount,
              });
            })
            .catch((error) => {
            const err = error as Error;
            console.warn("[api/chat] world writeback skipped", {
              requestId: requestId,
              userId: userId,
              sessionId: sessionId,
              message: err?.message,
            });
          });
        }
        if (dmRecord && sessionId && worldDirectorConfig.enabled) {
          // Phase-4: non-blocking background world tick. The wrapper decides
          // triggers + enqueue and NEVER awaits inside the hot path.
          const capturedSessionId = sessionId;
          const { pending } = scheduleBackgroundWorldTick({
            requestId: requestId,
            userId: userId,
            sessionId: sessionId,
            turnIndex: totalRounds,
            latestUserInput: latestUserInput,
            dmRecord,
            playerLocation:
              typeof dmRecord.player_location === "string" ? dmRecord.player_location : null,
            previousPlayerLocation: playerLocEarly,
            npcLocationUpdateCount: Array.isArray(dmRecord.npc_location_updates)
              ? dmRecord.npc_location_updates.length
              : 0,
            minTriggerGapTurns: worldDirectorConfig.minTriggerGapTurns,
            maxPendingAgenda: worldDirectorConfig.maxPendingAgendaPerSession,
            preflightRiskTags: pipelineControl?.risk_tags ?? [],
            dmNarrativePreview: String(dmRecord.narrative ?? ""),
            commitSummary: commitSummaryForAnalytics,
            enqueueFn: enqueueWorldEngineTick,
            onSettled: ({ decision, result }) => {
              if (!result.enqueued) return;
              void recordGenericAnalyticsEvent({
                eventId: `${requestId}:world_engine_enqueued`,
                idempotencyKey: `${requestId}:world_engine_enqueued`,
                userId: userId,
                guestId: userId ? null : chatGuestId,
                sessionId: capturedSessionId,
                eventName: "world_engine_enqueued",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform: platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId: requestId,
                  dedupKey: result.dedupKey,
                  triggers: [...decision.triggers],
                  directorMode: worldDirectorConfig.mode,
                  socialWorldMode: socialWorldConfig.mode,
                  socialTickEligible: socialWorldConfig.backgroundEnabled,
                },
              }).catch(() => {});
            },
          });
          // Intentionally do NOT await `pending`: online turn must not block
          // on background queue RTT.
          void pending;
        }
        // Phase-2.3: fire-and-forget register classification ledger write.
        // Runs after commit so it has the final narrative. Fail-open on DB.
        if (dmRecord && sessionId && typeof dmRecord.narrative === "string" && dmRecord.narrative.length > 0) {
          insertPacingLedgerRow({
            sessionId: sessionId,
            userId: userId,
            turnIndex: totalRounds,
            narrative: String(dmRecord.narrative),
            beatState: capturedBeatForLedger,
          });
        }
        // Phase-5: fire-and-forget foreshadow ledger write + expire scan.
        // Writes plant/payoff ops to DB; expires overdue entries. Fail-open on DB.
        if (dmRecord && sessionId && Array.isArray(dmRecord.foreshadow_ops) && dmRecord.foreshadow_ops.length > 0) {
          insertForeshadowLedgerRows({
            sessionId: sessionId,
            userId: userId,
            turnIndex: totalRounds,
            ops: dmRecord.foreshadow_ops as Array<Record<string, unknown>>,
          });
        }
        if (dmRecord && sessionId) {
          expireOverdueForeshadows(sessionId, totalRounds);
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
                userId: userId,
                guestId: userId ? null : chatGuestId,
                sessionId: sessionId ?? "unknown_session",
                eventName: "kg_cache_write",
                eventTime: new Date(),
                page: "/play",
                source: "chat",
                platform: platform,
                tokenCost: 0,
                playDurationDeltaSec: 0,
                payload: {
                  requestId: requestId,
                  scope: "global",
                  worldRevision: wr.toString(),
                },
              }).catch(() => {});
            })
            .catch(() => {});
        }
      }
      return true;
    };

    let streamTtftTelemetrySent = false;
    let streamStatusSent = false;
    let latestStreamUsage: TokenUsage | null = null;
    let latestStreamFinishReason: string | null = null;

    stream_pass: while (streamRound < MAX_STREAM_SOURCE_ROUNDS) {
      streamRound += 1;
      const logicalRole = streamSource.logicalRole;
      routingReport.actualLogicalRole = logicalRole;
      latestStreamUsage = null;
      latestStreamFinishReason = null;
      const reader = streamSource.response.body!.getReader();
      activeStreamReader = reader;
      const streamRoundDeadlineAt = Date.now() + streamHardCapMs;
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";
      let streamBlocked = false;
      let latestTotalTokens = 0;
      let firstChunkAt = 0;
      let lastStreamDeltaModAt = 0;
      const streamModThrottleMs = preflightEnv.streamModerationThrottleMs;
      const markFirstVisibleStreamChunk = async () => {
        if (ttftProfile.firstValidStreamChunkAt === null) {
          ttftProfile.firstValidStreamChunkAt = nowMs();
        }
        if (firstChunkAt !== 0) return;
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
      };

      const flushThisRound = () =>
        flushTokenUsage({
          streamRole: logicalRole,
          gatewayModel: streamSource.gatewayModel,
          accumulated,
          streamBlocked,
          firstChunkAt,
          latestTotalTokens,
          latestUsage: latestStreamUsage,
          latestFinishReason: latestStreamFinishReason,
        });

    try {
      while (true) {
        const { value, done } = await readUpstreamBounded(reader, streamRoundDeadlineAt);
        // Synchronous hard-cap check after every resolved read: under a
        // socket flood the event loop keeps prioritizing readable events and
        // setTimeout callbacks can be starved, so the timer-based bound alone
        // is not sufficient. Cancelling here throws into the stream catch
        // path, which reconnects once or closes with the fallback final.
        if (Date.now() > streamRoundDeadlineAt) {
          try { await reader.cancel(); } catch { /* best effort */ }
          throw new Error(`stream_hard_cap_${streamHardCapMs}ms`);
        }
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
            if (finalFrameWritten) {
              await writer.close();
            } else {
              await closeWithFallback();
            }
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
          if (data.length < 0 && ttftProfile.firstValidStreamChunkAt === null) {
            // 绗竴鏉℃湁鏁?chunk 鍒拌揪锛氬彲鐢ㄤ簬鍒ゆ柇涓婃父杩炴帴/鎺掗槦鏄惁鏄?TTFT 涓诲洜銆?            ttftProfile.firstValidStreamChunkAt = nowMs();
          }
          if (data.length < 0 && firstChunkAt === 0) {
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
              if (finalFrameWritten) {
                await writer.close();
              } else {
                await closeWithFallback();
              }
            }
            return;
          }

          let json: {
            choices?: Array<{
              delta?: { content?: string };
              message?: { content?: string };
              finish_reason?: string | null;
              finishReason?: string | null;
            }>;
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
            if (
              postChunkModeration.policy.blocked &&
              isVisibleSafetyDegradeReason(postChunkModeration.result.reason)
            ) {
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
            } else if (postChunkModeration.policy.blocked) {
              console.warn("[api/chat] non-visible post-model chunk block recorded without narrative fallback", {
                requestId,
                reason: postChunkModeration.result.reason,
              });
            }
            accumulated += data;
            await markFirstVisibleStreamChunk();
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
              if (
                postChunkModeration.policy.blocked &&
                isVisibleSafetyDegradeReason(postChunkModeration.result.reason)
              ) {
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
              } else if (postChunkModeration.policy.blocked) {
                console.warn("[api/chat] non-visible post-model delta block recorded without narrative fallback", {
                  requestId,
                  reason: postChunkModeration.result.reason,
                });
              }
            }
            accumulated += deltaContent;
            await markFirstVisibleStreamChunk();
            await writeToStream(deltaContent);
          }

          const finishReason = normalizeFinishReason(json);
          if (finishReason) {
            latestStreamFinishReason = finishReason;
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
      if (!readerAlreadyCancelled) {
        readerAlreadyCancelled = true;
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
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
    await closeWithFallback();
  }).finally(() => {
    clearTimeout(turnWatchdog);
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

  try {
    endTurnTrace({
      finalJsonParsed: true,
      turnCommitted: true,
      narrativeCharLen: 0,
      optionsCount: 0,
      fallbackUsed: false,
      degradedMode: false,
      validatorIssueCount: 0,
      npcConsistencyIssueCount: 0,
      firstStatusMs: undefined,
      firstVisibleTextMs: undefined,
      finalMs: undefined,
    });
  } catch { /* tracing is non-critical */ }

  try {
    uploadSelfHealingScores({
      requestId,
      loreSourceCount,
      loreFallbackPath: loreFallbackPath ?? "none",
      loreCacheHit,
      retrievalSourceCounts: { database: loreSourceCount },
      privateFactHitCount: 0,
      lorePacketChars: runtimePacketChars ?? 0,
      npcConsistencyIssueCount: epistemicPostValidatorTelemetry?.violationTypes?.length ?? 0,
      npcConsistencyViolationTypes: epistemicPostValidatorTelemetry?.violationTypes ?? [],
      narrativeRewriteTriggered: epistemicPostValidatorTelemetry?.rewriteTriggered ?? false,
      unsupportedFactCount: 0,
      validatorIssueCount: epistemicPostValidatorTelemetry?.validatorTriggered ? 1 : 0,
      validatorIssueCodes: epistemicPostValidatorTelemetry?.involvedFields ?? [],
      fallbackUsed: fallbackUsedTelemetry,
      turnCommitted: finalJsonParseSuccess,
      finalJsonParsed: finalJsonParseSuccess,
      optionsQualityPass: finalOptionsQualityPassTelemetry || undefined,
      narrativeCharLen: narrativeLengthTelemetry?.actualNarrativeChars ?? 0,
      optionsCount: finalOptionsCountTelemetry,
      firstStatusMs: ttftProfile.firstSseWriteAt != null
        ? Math.max(0, ttftProfile.firstSseWriteAt - requestStartedAt)
        : undefined,
      gameLanguage: validated.language,
      taskType: "PLAYER_CHAT",
      directorAgendaCount: directorAdoptionTelemetry?.directorAgendaCount ?? injectedDirectorAgendaIds.length,
      directorAgendaAdoptedCount: directorAdoptionTelemetry?.adoptedCount ?? 0,
      promptMetrics: totalSystemPromptChars != null
        ? { totalSystemPromptChars }
        : undefined,
    });
  } catch { /* self-healing scores are non-critical */ }

  return new Response(readable, {
    status: 200,
    headers: sseHeadersOut,
  });
}

async function loadPlayerEchoCanonForPrompt(
  userId: string,
  timeoutMs: number
): Promise<{ ok: true; value: PlayerEchoCanon | null } | { ok: false; value: null }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guarded = readPlayerEchoCanon(userId).then(
    (value) => ({ ok: true as const, value }),
    () => ({ ok: false as const, value: null })
  );
  const timeout = new Promise<{ ok: false; value: null }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, value: null }), Math.max(80, Math.min(120, timeoutMs)));
  });
  try {
    return await Promise.race([guarded, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  return new Response(sseText(`${VERSECRAFT_FINAL_PREFIX}${JSON.stringify(dmNorm)}`), {
    status: 200,
    headers,
  });
}
