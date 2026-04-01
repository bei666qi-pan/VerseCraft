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
  type EpistemicResidueRecentEntry,
  type SessionMemoryRow,
} from "@/lib/memoryCompress";
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
import { buildPlayerContextDigest, inferWeaponizationAttempted } from "@/lib/analytics/playerContextDigest";
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
  generateDecisionOptionsOnlyFallback,
  generateOptionsOnlyFallback,
  parsePlayerIntent,
  type EnhanceAfterMainStreamResult,
} from "@/lib/ai/logicalTasks";
import { buildControlAugmentationBlock } from "@/lib/playRealtime/augmentation";
import {
  buildDynamicPlayerDmSystemSuffix,
  buildStyleGuidePacketBlock,
  composePlayerChatSystemMessages,
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
import { getRuntimeLore } from "@/lib/worldKnowledge/runtime/getRuntimeLore";
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
import { hasStrongAcquireSemantics } from "@/features/play/turnCommit/semanticGuards";
import {
  hasProtocolLeakSignature,
  sanitizeNarrativeLeakageForFinal,
} from "@/lib/playRealtime/protocolGuard";
import { isOpeningSystemUserMessage } from "@/features/play/opening/openingCopy";
import { buildRuleSnapshot } from "@/lib/playRealtime/ruleSnapshot";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import {
  loadVerseCraftEnvFilesOnce,
  reloadVerseCraftProcessEnv,
  resolveVerseCraftProjectRoot,
} from "@/lib/config/loadVerseCraftEnv";
import { envBoolean, envNumber } from "@/lib/config/envRaw";
import { isKgLayerEnabled } from "@/lib/config/kgEnv";
import { moderationTextForPrivateStoryChat, validateChatRequest } from "@/lib/security/chatValidation";
import { classifyChatRiskLane } from "@/lib/security/chatRiskLane";
import { createRequestId, getClientIpFromHeaders } from "@/lib/security/helpers";
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
import { detectWorldEngineTriggers } from "@/lib/worldEngine/contracts";
import { enqueueWorldEngineTick } from "@/lib/worldEngine/queue";
import {
  isSafeVerseCraftRequestId,
  VERSECRAFT_REQUEST_ID_HEADER,
  VERSECRAFT_REQUEST_ID_RESPONSE_HEADER,
} from "@/lib/telemetry/requestId";
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
import type { TurnMode } from "@/features/play/turnCommit/turnEnvelope";
import { buildRealityConstraintPacketBlock } from "@/lib/playRealtime/realityConstraintPackets";
import { assessAndRewriteAntiCheatInput } from "@/lib/playRealtime/antiCheatInput";
import { buildOptionsRegenResponse } from "./optionsRegenPayload";
import { getPostResolveOptionsRegenSkipReason, shouldSkipPostResolveOptionsRegen } from "./postResolveOptionsRegenSkip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUNDS_THRESHOLD = 10;
const SHORT_TERM_ROUNDS = 5;
// 首字优化硬预算：即使 env 配置更大，也不允许这些步骤长期阻塞 TTFT。
const TTFT_HARD_CAP_CONTROL_PREFLIGHT_MS = 260;
const TTFT_HARD_CAP_LORE_MS = 220;
const TTFT_HARD_CAP_SESSION_MEMORY_MS = 140;

type ChatPerfFlags = {
  enableRiskLaneSplit: boolean;
  enableLightweightFastPath: boolean;
  enablePromptSlimming: boolean;
  fastLaneSkipRuntimePackets: boolean;
  tieredContextBuild: boolean;
  controlPreflightBudgetMsCap: number;
  loreRetrievalBudgetMsCap: number;
};

type TtftAggregatePoint = {
  t: number;
  totalTTFT: number;
  slowestStage: string;
  slowestMs: number;
};

const ttftAggregateRing: TtftAggregatePoint[] = [];
const TTFT_AGGREGATE_RING_MAX = 120;

function resolveChatPerfFlags(): ChatPerfFlags {
  return {
    enableRiskLaneSplit: envBoolean("AI_CHAT_ENABLE_RISK_LANE_SPLIT", true),
    enableLightweightFastPath: envBoolean("AI_CHAT_ENABLE_LIGHTWEIGHT_FAST_PATH", true),
    enablePromptSlimming: envBoolean("AI_CHAT_ENABLE_PROMPT_SLIMMING", true),
    fastLaneSkipRuntimePackets: envBoolean("AI_CHAT_FASTLANE_SKIP_RUNTIME_PACKETS", true),
    tieredContextBuild: envBoolean("AI_CHAT_TIERED_CONTEXT_BUILD", true),
    controlPreflightBudgetMsCap: Math.max(
      0,
      Math.min(2000, envNumber("AI_CHAT_CONTROL_PREFLIGHT_BUDGET_MS_CAP", TTFT_HARD_CAP_CONTROL_PREFLIGHT_MS))
    ),
    loreRetrievalBudgetMsCap: Math.max(
      0,
      Math.min(2000, envNumber("AI_CHAT_LORE_RETRIEVAL_BUDGET_MS_CAP", TTFT_HARD_CAP_LORE_MS))
    ),
  };
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[idx] ?? 0;
}

function pushAndSummarizeTtft(point: TtftAggregatePoint): {
  avg: number;
  p95: number;
  slowestStageTop: string;
  sampleCount: number;
} {
  ttftAggregateRing.push(point);
  if (ttftAggregateRing.length > TTFT_AGGREGATE_RING_MAX) {
    ttftAggregateRing.splice(0, ttftAggregateRing.length - TTFT_AGGREGATE_RING_MAX);
  }
  const totals = ttftAggregateRing.map((x) => x.totalTTFT);
  const avg = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const p95v = p95(totals);
  const stageCount = new Map<string, number>();
  for (const x of ttftAggregateRing) {
    stageCount.set(x.slowestStage, (stageCount.get(x.slowestStage) ?? 0) + 1);
  }
  const slowestStageTop =
    [...stageCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  return { avg, p95: p95v, slowestStageTop, sampleCount: ttftAggregateRing.length };
}

type ChatTtftProfile = {
  requestReceivedAt: number;
  jsonParseMs: number | null;
  authSessionMs: number | null;
  validateChatRequestMs: number | null;
  moderateInputOnServerMs: number | null;
  preInputModerationMs: number | null;
  quotaCheckMs: number | null;
  sessionMemoryReadMs: number | null;
  controlPreflightMs: number | null;
  loreRetrievalMs: number | null;
  promptBuildMs: number | null;
  generateMainReplyStartedAt: number | null;
  firstValidStreamChunkAt: number | null;
  firstSseWriteAt: number | null;
  lane: "fast" | "slow";
};

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startAt: number): number {
  return Math.max(0, nowMs() - startAt);
}

function buildMinimalPlayerContextSnapshot(playerContext: string): string {
  const src = String(playerContext ?? "");
  if (!src) return "";
  const picks: string[] = [];
  const patterns = [
    /用户位置\[[^\]]+\]/,
    /游戏时间\[[^\]]+\]/,
    /任务追踪：[^。]+。/,
    /NPC当前位置：[^。]+。/,
    /主威胁状态：[^。]+。/,
    /职业状态：[^。]+。/,
    /图鉴已解锁：[^。]+。/,
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m?.[0]) picks.push(m[0]);
  }
  if (picks.length > 0) return picks.join("\n");
  return src.slice(0, 420);
}

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

function clampText(s: string, maxChars: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= maxChars ? t : t.slice(0, maxChars);
}

/**
 * 将玩家输入做“低可复写”的模型输入整形：
 * - 去掉强标签（避免模型把它当待翻译/待复述材料）
 * - 去掉显式写作要求（放到 system prompt 的 continuity packet 中）
 * - 保留玩家意图（行动/对白）但避免逐字复刻
 */
function shapeUserActionForModel(rawAction: string): string {
  // Backward-compatible wrapper: keep the name stable for callsites,
  // but upgrade implementation to structured intent shaping.
  return shapeUserActionForModelV2(rawAction);
}

function extractLastAssistantNarrativeTail(chatMsgs: Array<{ role: string; content: string }>): string | null {
  for (let i = chatMsgs.length - 1; i >= 0; i--) {
    const m = chatMsgs[i];
    if (!m || m.role !== "assistant") continue;
    const c = String(m.content ?? "");
    try {
      const j = JSON.parse(c) as { narrative?: unknown };
      const nar = typeof j?.narrative === "string" ? j.narrative : "";
      const t = nar.replace(/\s+/g, " ").trim();
      if (t) return t.slice(Math.max(0, t.length - 180));
    } catch {
      const t = c.replace(/\s+/g, " ").trim();
      if (t) return t.slice(Math.max(0, t.length - 180));
    }
  }
  return null;
}

function extractRecentEntities(latestUserInput: string): string[] {
  const out = new Set<string>();
  for (const m of latestUserInput.matchAll(ENTITY_CODE_RE)) out.add(m[1].toUpperCase());
  return [...out];
}

function normalizeOptionText(s: string): string {
  return String(s ?? "")
    .replace(/[【】\[\]（）()]/g, " ")
    .replace(/[，,。！？!?:：；;、“”"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = normalizeOptionText(a).split(" ").filter(Boolean);
  const tb = normalizeOptionText(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union <= 0 ? 0 : inter / union;
}

function dedupeDecisionOptions(raw: unknown, max = 4): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const x of src) {
    if (out.length >= max) break;
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s) continue;
    // Drop ultra-short fillers
    if (s.length < 2) continue;
    const dup = out.some((y) => y === s || jaccardSimilarity(y, s) >= 0.82);
    if (dup) continue;
    out.push(s);
  }
  return out;
}

function inferPlannedTurnMode(args: {
  latestUserInput: string;
  shouldApplyFirstActionConstraint: boolean;
  clientState: unknown;
  pipelineControl: PlayerControlPlane | null;
}): { mode: TurnMode; reason: string } {
  if (args.shouldApplyFirstActionConstraint) {
    return { mode: "decision_required", reason: "opening_first_action_constraint" };
  }
  // System transitions should be explicit and stable:
  // settlement/endgame/revive flows should not accidentally fall back to "options missing => regen".
  const cs = args.clientState as any;
  const day = Number(cs?.time?.day ?? NaN);
  const hour = Number(cs?.time?.hour ?? NaN);
  if (Number.isFinite(day) && Number.isFinite(hour) && day >= 10 && hour <= 0) {
    return { mode: "system_transition", reason: `time_endgame(day=${Math.trunc(day)},hour=${Math.trunc(hour)})` };
  }
  const raw = String(args.latestUserInput ?? "").trim();
  // Only treat highly specific short commands as transitions to avoid false positives in normal roleplay.
  if (raw.length <= 16 && /^(迎接终焉|进入结算|查看结算|复活|确认复活)$/.test(raw)) {
    return { mode: "system_transition", reason: "input_transition_command" };
  }
  // Prefer existing director digest hints (cheap, client-provided structured state).
  const beat = typeof cs?.directorDigest?.beatModeHint === "string" ? cs.directorDigest.beatModeHint : "";
  const tension = Number(cs?.directorDigest?.tension ?? NaN);
  const pendingIncCount = Array.isArray(cs?.directorDigest?.pendingIncidentCodes) ? cs.directorDigest.pendingIncidentCodes.length : 0;
  if (beat === "collision" || beat === "countdown" || beat === "peak") {
    return { mode: "decision_required", reason: `directorDigest.beat=${beat}` };
  }
  if (Number.isFinite(tension) && tension >= 85) {
    return { mode: "decision_required", reason: `directorDigest.tension=${Math.trunc(tension)}` };
  }
  if (pendingIncCount >= 2 && (beat === "pressure" || beat === "aftershock")) {
    return { mode: "decision_required", reason: `directorDigest.pending=${pendingIncCount}` };
  }
  // Default product strategy: narrative first, choices only at true junctions.
  void args.latestUserInput;
  void args.pipelineControl;
  return { mode: "narrative_only", reason: "default_narrative" };
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
  // TTFT 起点：从服务端收到请求开始计时，避免遗漏首字前阻塞步骤。
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

  const ttftProfile: ChatTtftProfile = {
    requestReceivedAt,
    jsonParseMs,
    authSessionMs: null,
    validateChatRequestMs: null,
    moderateInputOnServerMs: null,
    preInputModerationMs: null,
    quotaCheckMs: null,
    sessionMemoryReadMs: null,
    controlPreflightMs: null,
    loreRetrievalMs: null,
    promptBuildMs: null,
    generateMainReplyStartedAt: null,
    firstValidStreamChunkAt: null,
    firstSseWriteAt: null,
    lane: "slow",
  };
  // 性能分层（首字前真实阻塞）：
  // - validate/auth/safety/quota/db/preflight/lore/prompt_build 均属于“首字前阻塞链路”
  // - writeToStream() 第一次写入才是服务端视角的“首个可感知响应”（不等于正文首字可见）
  // 请求验证是首字前同步阻塞段，必须单独量化。
  const validateStartAt = nowMs();
  const validated = validateChatRequest(body);
  ttftProfile.validateChatRequestMs = elapsedMs(validateStartAt);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const messages = validated.messages;
  const playerContext = validated.playerContext;
  const clientState = validated.clientState;
  let latestUserInput = validated.latestUserInput;
  const sessionId = validated.sessionId;
  const clientPurpose = validated.clientPurpose;
  const clientIp = getClientIpFromHeaders(req.headers);
  const inboundRid = req.headers.get(VERSECRAFT_REQUEST_ID_HEADER);
  const requestId = isSafeVerseCraftRequestId(inboundRid) ? inboundRid : createRequestId("chat");
  const platform = derivePlatformFromUserAgent(req.headers.get("user-agent"));
  const requestStartedAt = requestReceivedAt;
  const perfFlags = resolveChatPerfFlags();

  const isFirstAction = !messages.some((m) => m.role === "assistant");
  const lastUserMessageTrimmed = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "user" && typeof m.content === "string") return m.content.trim();
    }
    return "";
  })();
  const shouldApplyFirstActionConstraint = Boolean(
    isFirstAction && isOpeningSystemUserMessage(lastUserMessageTrimmed)
  );
  const authStartAt = nowMs();
  const session = await auth();
  ttftProfile.authSessionMs = elapsedMs(authStartAt);
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
          [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
        },
      }
    );
  }

  // Phase3: input moderation for private story action.
  // Important: do not feed unsafe raw input to control/main model.
  // 输入安全审核：模型前必经步骤，通常是 TTFT 的第一层阻塞来源。
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
    return new Response(
      sseText(
        safeBlockedDmJson(inputSafety.narrativeFallback ?? inputSafety.userMessage, {
          action: "degrade",
          stage: "pre_input",
          riskLevel: "gray",
          requestId,
          reason: "input_reject",
        })
      ),
      {
        status: 403,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
        },
      }
    );
  }
  if (clientPurpose === "options_regen_only") {
    // 审核入参为固定短句；禁止用 rewrite/fallback 覆盖真实 options 刷新 prompt。
    latestUserInput = dmLatestUserInput;
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

  // --- Options-only fast path (never mutates world state) ---
  if (clientPurpose === "options_regen_only") {
    const rollout = getVerseCraftRolloutFlags();
    incrOptionsOnlyRegenPathHitCount(1);
    const snapshot = buildMinimalPlayerContextSnapshot(playerContext);
    const lastAssistant =
      validated.messages
        .slice()
        .reverse()
        .find((m) => m.role === "assistant")?.content ?? "";
    const clientReason =
      typeof (validated as { clientReason?: unknown }).clientReason === "string"
        ? String((validated as { clientReason?: string }).clientReason)
        : "";
    const clientTurnModeHint = (validated as { clientTurnModeHint?: unknown }).clientTurnModeHint;
    const lastUserReason =
      validated.messages
        .slice()
        .reverse()
        .find((m) => m.role === "user")?.content ?? "";
    const reason = (clientReason.trim() || lastUserReason.trim() || "用户请求重新整理选项").trim();

    const packet = rollout.enableOptionsOnlyRegenPathV2
      ? buildOptionsOnlyUserPacket({
          reason,
          lastNarrative: lastAssistant,
          playerContextSnapshot: snapshot,
          clientState: validated.clientState,
        })
      : reason;
    const regen = await generateOptionsOnlyFallback({
      narrative: lastAssistant,
      latestUserInput: packet,
      playerContext: snapshot,
      ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { clientPurpose: "options_regen_only" } },
      systemExtra: rollout.enableOptionsOnlyRegenPathV2 ? buildOptionsOnlySystemPrompt() : "",
    });
    const shaped = buildOptionsRegenResponse({
      clientTurnModeHint,
      options: regen.options,
      generatorOk: regen.ok,
    });
    const ok = shaped.ok;
    const payload = JSON.stringify(shaped);
    const isAuto =
      /主回合|options\s*缺失|auto_missing_main/i.test(reason) ||
      /auto/i.test(clientReason);
    if (isAuto) recordOptionsAutoRegenOutcome(ok);
    else recordOptionsManualRegenOutcome(ok);
    return new Response(sseText(payload), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
      },
    });
  }

  /**
   * 快慢车道判定（仅工程规则，零额外模型开销）：
   * - fast：普通叙事动作，保留基础安全入口后尽快进主模型；
   * - slow：灰区/高风险/复杂系统指令，走完整重链路。
   */
  const laneDecision = perfFlags.enableRiskLaneSplit
    ? classifyChatRiskLane(latestUserInput)
    : { lane: "slow" as const, reasons: ["multi_clause_complex_action" as const] };
  const riskLane = laneDecision.lane;
  ttftProfile.lane = riskLane;
  const shouldRunHeavyPreInput = riskLane === "slow";

  // 深度 preInputModeration 仅在慢车道首字前阻塞，避免普通请求双重安全阻塞。
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
            [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
          },
        }
      );
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
  // session memory 可提升质量，但不应无限阻塞首字；超预算时先按无记忆继续。
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
      content: shapeUserActionForModel(rawAction),
    };
    /**
     * 将“暗骰/承接规则”从 user message 挪出：
     * - user：仅保留玩家本回合自然语言输入（低可复写）
     * - system：由 continuity packet + augmentation 引导 DM 做“后果先行”的小说续写（避免解释腔）
     *
     * 注意：dice 数值仍可供模型决定成败倾向，但必须只作为 system-side 隐性提示，
     * 禁止在 narrative 暴露“骰子/roll/数值/检定”等元机制词。
     */
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

  // 首字前等待 session memory 设置硬上限；超时则降级为 null，避免 DB 抖动放大 TTFT。
  const sessionMemoryBudgetMs = TTFT_HARD_CAP_SESSION_MEMORY_MS;
  const sessionMemory: SessionMemoryRow | null = await Promise.race([
    sessionMemoryPromise,
    new Promise<SessionMemoryRow | null>((resolve) => setTimeout(() => resolve(null), sessionMemoryBudgetMs)),
  ]);
  if (ttftProfile.sessionMemoryReadMs === null) {
    ttftProfile.sessionMemoryReadMs = elapsedMs(sessionMemoryStartAt);
  }
  // 上下文分层：快车道只保留首字必需信息，慢车道保留更完整增强信息。
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
              [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
            },
          }
        );
      }
    } catch (quotaErr) {
      console.error("[api/chat] quota check failed, proceeding without quota", quotaErr);
      if (ttftProfile.quotaCheckMs === null) ttftProfile.quotaCheckMs = 0;
    }
  } else if (userId) {
    /**
     * 单机叙事过程分层策略：
     * - 快车道不做“重型配额 DB 校验”首字前阻塞，避免把普通回合当成高价值对外提交处理；
     * - 基础限流（riskControl）与内容安全（moderateInputOnServer）仍然保留；
     * - 实际 token 记账与额度消耗仍在首字后 flush 阶段执行；
     * - 企业化强校验应聚焦在云同步/排行榜/成就上传等“外部可见结果”节点。
     */
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
  // 首字前不等待清理动作：这是维护性步骤，不影响本回合首字正确性。
  void deleteSessionMemoryP;

  const preflightEnv = resolveAiEnv();
  const runControlPreflightP = (async (): Promise<void> => {
    // 快车道跳过 control preflight：保留安全底线同时减少首字前重计算。
    if (perfFlags.enableLightweightFastPath && riskLane === "fast") {
      preflightTurnMetrics = {
        ran: false,
        skippedReason: "fast_lane",
        cacheHit: null,
        latencyMs: 0,
        ok: false,
        budgetHit: false,
      };
      return;
    }
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
    // 慢车道也必须硬限时：预算化降级而不是让 preflight 无上限拖慢首字。
    const budgetMs = Math.max(
      0,
      Math.min(preflightEnv.controlPreflightBudgetMs, perfFlags.controlPreflightBudgetMsCap)
    );
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
        // Budget must be stricter than task timeout: once hit, abandon preflight immediately.
        budgetMs: budgetMs > 0 ? Math.min(budgetMs, 10_000) : 0,
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
  let runtimeLorePacket: LorePacket | null = null;

  const loreRetrievalP = (async (): Promise<void> => {
    // 快车道跳过重型 lore retrieval，慢车道保留完整知识检索能力。
    if (perfFlags.enableLightweightFastPath && riskLane === "fast") {
      loreRetrievalLatencyMs = 0;
      loreFallbackPath = "none";
      return;
    }
    try {
      const loreT0 = Date.now();
      // lore 属于“可预算化降级”步骤：超时直接降级为无 lore，不允许长期挡首字。
      const loreBudgetMs = Math.max(
        0,
        Math.min(preflightEnv.loreRetrievalBudgetMs, perfFlags.loreRetrievalBudgetMsCap)
      );
      const lorePromise = getRuntimeLore({
        latestUserInput,
        userId,
        sessionId: sessionId ?? null,
        worldRevision: BigInt(0),
        playerLocation: guessPlayerLocationFromContext(playerContext),
        playerContext,
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
      runtimeLorePacket = runtimeLore;
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

  // Prompt/runtime packet 组装：纯本地执行但在首字前，复杂字符串拼装会拖慢 TTFT。
  // Phase-1 优化：把“等待 preflight/lore 完成”与“本地 prompt 拼装”并行重叠（不改变语义，只减少墙钟）。
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
  // 快车道优先首字：可延后质量增强块（任务主动发放叙事/阴谋叙事）不参与首字前拼装。
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

  // Tier0 先行：先构造不依赖 preflight/lore 的部分（让 CPU 拼装与网络/LLM 并行步骤重叠）
  // 注意：Tier0 不改变最终消息形状；Tier1 仍会在首字前拼回 control/lore/runtimePackets（语义保持一致）。
  const serviceState = {
    shopUnlocked: true,
    forgeUnlocked: true,
    anchorUnlocked: true,
    unlockFlags: {},
  };

  // 等待可预算链路完成（它们早已启动），并把等待与上方字符串构造重叠。
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
   * Epistemic 体系属于“质量增强层”而非“首字正确性底线”：
   * - fast lane 首字优先：禁止进入该重计算分支，避免把普通回合拖慢到慢车道 TTFT
   * - slow lane 可启用：用于 NPC 记忆/认知异常等一致性增强
   *
   * 为什么不会破坏安全/玩法：
   * - 输入安全、协议守卫、npcConsistencyBoundary（compact）仍在 core prompt 里
   * - 该分支主要影响“叙事一致性/记忆精度”，不负责内容安全与硬裁决
   */
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
  const epistemicRuntimeCrossRef =
    "同条 system：npc_player_baseline_packet、npc_scene_authority_packet、key_npc_lore_packet、worldLorePacketsCompact（reveal_tier）";
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

  // Runtime JSON：full 含完整 lore 子包；minimal 仍含 worldLorePacketsCompact（reveal_tier、school_cycle_arc、major_npc_arc、cycle_loop、school_source、team_relink、major_npc_relink、cycle_time、school_cycle_experience 等缩写），与 stable 中 packet 名及「四条边界」一致。
  // 快车道在 fastLaneSkipRuntimePackets 下可能得到空字符串：stable「学制/高魅力·四条边界」末条仍禁止六人初见即全盘相熟。
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
  const systemChatMessages = composePlayerChatSystemMessages(
    playerDmStablePrefix,
    dynamicSuffixFull,
    aiEnvForSystem.splitPlayerChatDualSystem
  );
  const stableCharLen = playerDmStablePrefix.length;
  const dynamicCharLen = dynamicSuffixFull.length;
  recordPromptCharDelta(dynamicCharLen);

  const safeMessages = sanitizeMessagesForUpstream([...systemChatMessages, ...messagesToSend]);
  ttftProfile.promptBuildMs = elapsedMs(promptBuildStartAt);

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

  /** 供终帧写入 global cache 时对齐 world_revision（方案 B：preflight 后读取）。Pool max=10，仅短查询。 */
  const kgCacheWorldRevision: { current: bigint | null } = { current: null };
  /**
   * KG 全局语义缓存命中时可以直接返回（真实延迟优化）。
   * 但 miss/慢查询不应成为 TTFT 的首字前阻塞项（首字优先）。
   */
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
          [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
        },
      }
    );
  }

  const FALLBACK_NARRATIVE =
    "游戏主脑暂时离线，请稍后再试。";
  const enableStatusFrames = envBoolean("AI_CHAT_ENABLE_STATUS_FRAMES", true);
  const SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    [VERSECRAFT_REQUEST_ID_RESPONSE_HEADER]: requestId,
  } as const;

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
    // 结构化首字画像：用于快速定位“首字前阻塞”与“首字后耗时”边界。
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
      // 开发态统一汇总：用于“优化前/后”横向对比（avg / p95 / 最慢阶段）。
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
      // 首字写入 SSE：这是玩家实际感知到“开始响应”的时刻。
      ttftProfile.firstSseWriteAt = nowMs();
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
    return writeControlToStream(
      `__VERSECRAFT_STATUS__:${JSON.stringify({
        stage,
        message,
        requestId,
        at: Date.now(),
      })}`
    );
  };
  const closeWithFallback = async () => {
    try {
      await writeToStream(fallbackPayload);
    } finally {
      await writer.close();
    }
  };

  const MIN_STREAM_OUTPUT_CHARS = 24;
  // Phase-5：reconnect 是必要兜底，但容易放大极端等待；限制总轮数，优先快速 fallback。
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
    // Phase-2：先把 SSE 通道建立起来，再连接上游（减少“服务器无响应”窗口）。
    await writeStatusFrame("request_sent", "行动已送出");
    await writeStatusFrame("routing", "正在连接深渊");

    const TIMEOUT_MS = 60000;
    const callUpstreamOnce = async (args: { skipRoles?: readonly AiLogicalRole[]; markStart?: boolean }) => {
      const ac = new AbortController();
      const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        if (args.markStart) {
          // 上游主模型调用起点：用于计算 upstream connect 到首包的纯网络/上游等待耗时。
          ttftProfile.generateMainReplyStartedAt = nowMs();
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
        // 快车道即使跳过了首字前配额校验，这里仍会在首字后进行真实额度扣减与留痕。
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
        guestId: userId ? null : (sessionId ?? null),
        page: "/play",
        source: "chat",
        platform,

        tokenCost: toPersist,
        playDurationDeltaSec: toPersist > 0 ? PLAY_TIME_PER_ACTION_SEC : 0,

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
      // 终帧阶段（首字后）耗时画像：用于与首字前阻塞拆分，避免误把后处理当 TTFT 问题。
      emitTtftProfileSummary("stream_end", finishedAt);
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
      const parsedRoot = parseAccumulatedPlayerDmJson(accumulatedText);
      let dmRecord =
        parsedRoot !== null ? normalizePlayerDmJson(parsedRoot) : null;
      finalJsonParseSuccess = dmRecord !== null;

      let moderationBody = accumulatedText;
      let finalizePayload: string | null = null;

      if (dmRecord) {
        dmRecord = applyDmChangeSetToDmRecord(dmRecord, {
          clientState,
          requestId,
        });
        dmRecord = applyB1ServiceExecutionGuard({
          dmRecord,
          latestUserInput,
          playerContext,
          clientState,
        });
        dmRecord = applyEquipmentExecutionGuard({
          dmRecord,
          latestUserInput,
          playerContext,
          clientState,
        });
        dmRecord = applyB1SafetyGuard({
          dmRecord,
          fallbackLocation: guessPlayerLocationFromContext(playerContext),
        });
        dmRecord = applyMainThreatUpdateGuard({
          dmRecord,
          playerContext,
        });
        dmRecord = applyWeaponTacticalAdjudication({
          dmRecord,
          playerContext,
          latestUserInput,
          requestId,
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
            signal: pipelineAbort.signal,
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
        dmRecord = applyStage2SettlementGuard(dmRecord);
        /**
         * 最终输出强裁决层（服务端）：
         * - 任何发送到前端的 narrative 必须先过净化；
         * - 结构字段（inventory/task/location 等）只信 JSON 结构，不信 narrative 文本；
         * - 命中泄漏并无法净化时直接降级，不把协议片段透传给玩家。
         */
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
              role: routingReport.actualLogicalRole ?? args.streamRole,
            });
            void recordGenericAnalyticsEvent({
              eventId: `${requestId}:narrative_protocol_leak`,
              idempotencyKey: `${requestId}:narrative_protocol_leak`,
              userId,
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
                role: routingReport.actualLogicalRole ?? args.streamRole,
              },
            }).catch(() => {});
          } else {
            dmRecord.narrative = sanitized.narrative;
          }
        } catch (e) {
          console.warn("[api/chat] protocol guard skipped", e);
        }

        // 补救：主笔回合若未生成 options，则快速二次生成仅 options（非硬编码、不沿用旧选项）。
        try {
          const opts = Array.isArray((dmRecord as { options?: unknown }).options)
            ? ((dmRecord as { options?: unknown }).options as unknown[])
                .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : [];
          const preResolveGuard =
            dmRecord.security_meta && typeof dmRecord.security_meta === "object" && !Array.isArray(dmRecord.security_meta)
              ? (dmRecord.security_meta as Record<string, unknown>)
              : null;
          const preResolveFreeze = preResolveGuard?.settlement_guard === "stage2_freeze_on_illegal_or_death";
          // 与后置 resolve 一致：仅 1 条或 0 条时补足，避免前端长期只有「半套」旧选项。
          if (opts.length < 2 && !preResolveFreeze) {
            const regen = await generateOptionsOnlyFallback({
              narrative: String(dmRecord.narrative ?? ""),
              latestUserInput,
              playerContext,
              ctx: { requestId, userId, sessionId, path: "/api/chat", tags: { phase: "final_hooks" } },
              signal: pipelineAbort.signal,
              budgetMs: 2200,
            });
            if (regen.ok) {
              (dmRecord as Record<string, unknown>).options = regen.options;
            }
          }
        } catch (e) {
          console.warn("[api/chat] options regen skipped", e);
        }

        // Phase-1 一致性收口在最终 envelope 中统一裁决（含 acquire 语义降级），此处不再仅打 warning。

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

        // Phase-2: 回合模式校正（轻量、无额外重型 preflight）
        // - decision_required：若模型未给出可用 options，则仅补决策选项（低成本）。
        // - narrative_only：若模型给了 options，则优先降级为无强制选项回合，避免前端误以为必须选择。
        try {
          const rollout = getVerseCraftRolloutFlags();
          if (!rollout.enableLongNarrativeMode && !rollout.enableDecisionTurnMode) {
            throw new Error("turn_mode_rollout_disabled");
          }
          const dm = dmRecord as Record<string, unknown>;
          const opts = Array.isArray(dm.options) ? dm.options : [];
          const optCount = opts.filter((x): x is string => typeof x === "string" && x.trim().length > 0).length;
          if (plannedTurnMode.mode === "narrative_only") {
            if (optCount > 0) {
              dm.turn_mode = "narrative_only";
              dm.options = [];
              dm.decision_options = [];
              dm.decision_required = false;
              dm.auto_continue_hint = typeof dm.auto_continue_hint === "string" && dm.auto_continue_hint.trim()
                ? dm.auto_continue_hint
                : "（继续）";
            } else {
              dm.turn_mode = typeof dm.turn_mode === "string" ? dm.turn_mode : "narrative_only";
              dm.decision_required = false;
            }
          } else if (plannedTurnMode.mode === "decision_required") {
            const decision = Array.isArray((dm as any).decision_options) ? ((dm as any).decision_options as unknown[]) : [];
            const decCount = decision.filter((x): x is string => typeof x === "string" && x.trim().length > 0).length;
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

        // Phase-1: 统一收口为“服务端最终裁决后的可提交对象”，避免前端从零散字段脑补。
        // 顺序约束：options fallback 必须先发生；然后再做一致性收口与最终 stringify。
        let resolved = resolveDmTurn(dmRecord);
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
        // Goal: avoid "换皮同义选项" causing fake decisions, while keeping 2-4 options.
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

        // 二次补救：即便 dmRecord.options 非空，也可能在 resolver 裁剪/去重后变成空或不足 2 条。
        // 为避免前端进入“无 options”死胡同：对正常主笔回合补齐一次 options（仍不沿用旧选项）。
        // 重要：不影响开场 options-only round / 结算守卫 / 终局唯一选项等路径。
        try {
          const rollout = getVerseCraftRolloutFlags();
          // settlement_guard 在合法回合也会写入 stage2_ordered_resolution；仅非法/死亡冻结应跳过后置补选项。
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
              budgetMs: 2200,
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
        // Finalize payload candidate first; output moderation must inspect the complete DM narrative.
        let resolvedForClient: ResolvedDmTurn = resolved;
        if (!shouldSkipItemOptionInjection({ resolved, clientPurpose: validated.clientPurpose })) {
          resolvedForClient = applyItemGameplayOptionInjection(resolved, clientState);
        }
        finalizePayload = JSON.stringify(resolvedForClient);
        moderationBody = finalizePayload;
      } else {
        // 当上游返回非严格 JSON 或重复拼接对象时，强制回落到标准 DM JSON 形状，保证 SSE 契约稳定。
        finalizePayload = sanitizeAssistantContent(accumulatedText);
        moderationBody = finalizePayload;
      }

      // Output audit: external provider only once per candidate DM (and never skip on malformed DM fallback).
      if (finalizePayload && isLikelyValidDMJson(finalizePayload)) {
        // 审核应基于“最终候选输出”（已经过 phase-1 resolver 收口），避免审核对象与实际发送对象不一致。
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
          // 输出审核可能改写 narrative/security_meta；改写后必须再次进入 phase-1 resolver
          // 以保证数组缺省、裁剪、task 规范化、acquire 降级等不变式仍成立。
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

      // 最终兜底：保留原产品的“本地规则最终合规拦截”（不调用百度，避免破坏既有产品能力）。
      // 这里必须在输出审核之后，确保安全策略改写/fallback 后仍接受最后一刀规则检查。
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
          // 结果外化节点（可影响企业化资产）：在这里保留更强写回链路与冲突处理，不放到首字前阻塞。
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
            // 第一条有效 chunk 到达：可用于判断上游连接/排队是否是 TTFT 主因。
            ttftProfile.firstValidStreamChunkAt = nowMs();
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
      // Phase-2：Response 在上游连接前就返回，因此这里不承诺“首个连接的 role”。
      // 后续可从 SSE status frames / ai.telemetry / chat_request_finished 事件中回溯。
      httpFallbackCount: routingReport.fallbackCount,
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

