// src/lib/playRealtime/promptAssembly.ts
// Extracted from src/app/api/chat/route.ts — prompt assembly section (formerly lines 1639–2413).
// Exports `buildPlayerChatMessages` which takes a context object and returns all
// prompt assembly outputs. This is NOT the same as `assemblePlayerChatPrompt`
// (which lives in `@/lib/turnEngine/promptAssembly`).

import type { AnalyticsPlatform } from "@/lib/analytics/types";
import type { ChatMessage } from "@/lib/ai/types/core";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { startStageSpan } from "@/lib/observability/langfuse";
import { envNumber } from "@/lib/config/envRaw";
import { resolveAiEnv } from "@/lib/ai/config/env";
import { resolvePlayerChatMaxTokensForNarrativeBudget } from "@/lib/ai/tasks/taskPolicy";
import { buildControlAugmentationBlock } from "@/lib/playRealtime/augmentation";
import { buildStyleGuidePacketBlock, buildDynamicPlayerDmSystemSuffix, estimatePromptTokens, getPlayerDmPromptVersion, stablePromptHash } from "@/lib/playRealtime/playerChatSystemPrompt";
import { buildNpcProactiveGrantNarrativeBlock } from "@/lib/tasks/taskV2";
import { build7FConspiracyNarrativeBlock } from "@/lib/revive/conspiracy";
import { resolveWorldDirectorConfig } from "@/lib/worldEngine/config";
import { loadDirectorDirectiveForWriter } from "@/lib/worldEngine/writerHintConsumer";
import {
  DARK_MOON_MAP_ID,
  DARK_MOON_WORLD_ID,
  QINGSHI_MAP_ID,
  XINGNI_WORLD_ID,
} from "@/lib/worlds/types";
import { resolveSocialWorldConfig } from "@/lib/socialWorld/config";
import { loadDueSocialEventsForPrompt } from "@/lib/socialWorld/persistence";
import { loadSocialWorldHintForPrompt } from "@/lib/socialWorld/prompt";
import { buildActorScopedEpistemicMemoryBlock } from "@/lib/epistemic/actorScopedMemoryBlock";
import { buildNpcEpistemicProfile } from "@/lib/epistemic/builders";
import { epistemicDebugLog, getEpistemicRolloutFlags } from "@/lib/epistemic/featureFlags";
import { loreFactsToKnowledgeFacts, mergeLorePacketSlices } from "@/lib/epistemic/loreFactBridge";
import { sessionMemoryRowToKnowledgeFacts } from "@/lib/epistemic/sessionFactBridge";
import { resolveEpistemicTargetNpcId } from "@/lib/epistemic/targetNpc";
import type {
  EpistemicAnomalyResult,
  KnowledgeFact,
  NpcEpistemicProfile,
} from "@/lib/epistemic/types";
import { PLAYER_ACTOR_ID } from "@/lib/epistemic/types";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import { buildEpistemicResiduePerformancePlan } from "@/lib/epistemic/residuePerformance";
import type { LorePacket } from "@/lib/worldKnowledge/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { computeMaxRevealRankFromSignals } from "@/lib/registry/revealRegistry";
import {
  buildNarrativeContinuityPacketBlock,
  buildNarrativeStyleBiblePacketBlock,
} from "@/lib/playRealtime/narrativeStylePackets";
import { buildPovPacketBlock, buildThirdPersonLimitedPovPacketBlock } from "@/lib/playRealtime/povPackets";
import { buildXingniRuntimePacket, getXingniPromptVersion } from "@/lib/worlds/xingni/narrative";
import { buildNpcGenderPronounPacketBlock } from "@/lib/playRealtime/npcGenderPackets";
import { buildProtagonistAnchorPacketBlock } from "@/lib/playRealtime/protagonistAnchorPackets";
import { resolveNarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";
import { buildRealityConstraintPacketBlock } from "@/lib/playRealtime/realityConstraintPackets";
import { buildNarrativeDirectiveBlock } from "@/lib/playRealtime/narrativeDirectivePackets";
import { computeNpcFirstEncounterEchoPlan } from "@/lib/playerEcho/npcFirstEncounter";
import { buildPlayerEchoPromptBlock } from "@/lib/playerEcho/prompt";
import { selectPlayerEchoFragments } from "@/lib/playerEcho/select";
import type { PlayerEchoCanon } from "@/lib/playerEcho/types";
import { buildNpcKnowledgePacket, inferNpcKnowledgeFloorId } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import { getFactsForFloor, getFactsForNpc, listWorldFacts } from "@/lib/worldFacts/worldFactRegistry";
import { extractLastAssistantNarrativeTail, inferPlannedTurnMode } from "@/lib/turnEngine/requestMetadata";
import { computeNpcTurnState, buildNpcTurnStatePacket, estimateNpcTurnStatePacketChars } from "@/lib/turnEngine/npcTurnState";
import {
  buildEpistemicInput,
  buildEpistemicPromptContext,
  type EpistemicFilterResult,
} from "@/lib/turnEngine/epistemic";
import {
  computePreNarrativeDelta,
} from "@/lib/turnEngine/computeStateDelta";
import { buildNpcConsistencyBoundaryCompactBlock } from "@/lib/playRealtime/npcConsistencyBoundaryPackets";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import { createDefaultB1ServiceState } from "@/lib/registry/serviceNodes";
import {
  guessPlayerLocationFromContext,
  buildB1ServiceContextBlock,
  extractPresentNpcIds,
} from "@/lib/playRealtime/b1Safety";
import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";
import { coerceRowToMemoryForDm, type SessionMemoryRow } from "@/lib/memoryCompress";
import { normalizeBeatState } from "@/lib/turnEngine/pacing";
import type {
  ChatPerfFlags,
  ChatTtftProfile,
  NormalizedPlayerIntent,
  StateDelta,
  TurnExecutionContext,
  TurnLaneDecision,
  TurnPreflightMetrics,
} from "@/lib/turnEngine/types";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

// ---------------------------------------------------------------------------
// Local helpers (moved from route.ts bottom helpers — formerly lines 5638–5692)
// ---------------------------------------------------------------------------

function asPlainRecordForEcho(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function looksLikeRunSnapshotForEcho(value: unknown): value is RunSnapshotV2 {
  const snapshot = asPlainRecordForEcho(value);
  return Boolean(
    snapshot &&
      snapshot.schemaVersion === 2 &&
      asPlainRecordForEcho(snapshot.player) &&
      asPlainRecordForEcho(snapshot.npcs)
  );
}

function extractRunSnapshotForEcho(clientState: unknown): RunSnapshotV2 | null {
  const state = asPlainRecordForEcho(clientState);
  if (!state) return null;
  if (looksLikeRunSnapshotForEcho(state.runSnapshotV2)) return state.runSnapshotV2;
  const slotId = typeof state.currentSaveSlot === "string" ? state.currentSaveSlot : null;
  const saveSlots = asPlainRecordForEcho(state.saveSlots);
  const currentSlot = slotId ? asPlainRecordForEcho(saveSlots?.[slotId]) : null;
  const slotSnapshot = currentSlot?.runSnapshotV2;
  return looksLikeRunSnapshotForEcho(slotSnapshot) ? slotSnapshot : null;
}

function buildNpcMemoryPrivilegeMapForEcho(
  npcIds: readonly string[]
): Record<string, ReturnType<typeof getNpcCanonicalIdentity>["memoryPrivilege"]> {
  const out: Record<string, ReturnType<typeof getNpcCanonicalIdentity>["memoryPrivilege"]> = {};
  for (const raw of npcIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || out[id]) continue;
    out[id] = getNpcCanonicalIdentity(id).memoryPrivilege;
  }
  return out;
}

function collectCurrentRunDiscoveredNpcIdsForEcho(clientState: unknown): string[] {
  const state = asPlainRecordForEcho(clientState);
  if (!state) return [];
  const out = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (/^N-\d{3}$/i.test(id)) out.add(id.toUpperCase());
  };
  for (const id of Object.keys(asPlainRecordForEcho(state.codex) ?? {})) add(id);
  for (const id of Object.keys(asPlainRecordForEcho(state.npcCodex) ?? {})) add(id);
  const snapshot = asPlainRecordForEcho(state.runSnapshotV2);
  const player = asPlainRecordForEcho(snapshot?.player);
  for (const id of Object.keys(asPlainRecordForEcho(player?.codex) ?? {})) add(id);
  const discovered = Array.isArray(state.discoveredNpcIds) ? state.discoveredNpcIds : [];
  for (const id of discovered) add(id);
  return [...out].slice(0, 80);
}

// ---------------------------------------------------------------------------
// `extractChapterNarrativeBudgetInput` (formerly lines 388–407 of route.ts)
// ---------------------------------------------------------------------------

function extractChapterNarrativeBudgetInput(clientState: unknown) {
  if (!clientState || typeof clientState !== "object" || Array.isArray(clientState)) return null;
  const chapter = (clientState as { chapterRuntime?: unknown }).chapterRuntime;
  if (!chapter || typeof chapter !== "object" || Array.isArray(chapter)) return null;
  const record = chapter as Record<string, unknown>;
  const target = Array.isArray(record.targetTextChars)
    ? record.targetTextChars.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : [];
  return {
    chapterId: typeof record.chapterId === "string" ? record.chapterId : null,
    narrativeCharCount:
      typeof record.narrativeCharCount === "number" && Number.isFinite(record.narrativeCharCount)
        ? record.narrativeCharCount
        : null,
    targetTextChars: target.length >= 2 ? ([target[0], target[1]] as [number, number]) : null,
    hardTextChars:
      typeof record.hardTextChars === "number" && Number.isFinite(record.hardTextChars)
        ? record.hardTextChars
        : null,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildPlayerChatMessagesContext {
  // Primitives / strings
  requestId: string;
  userId: string | null;
  sessionId: string | null;
  chatGuestId: string | null;
  platform: AnalyticsPlatform;
  latestUserInput: string;
  clientPurpose: TurnExecutionContext["clientPurpose"];
  languageInstruction: string;
  riskLane: TurnExecutionContext["riskLane"];
  totalRounds: number;
  shouldApplyFirstActionConstraint: boolean;
  playerContextForPrompt: string;
  contextMode: "minimal" | "full";
  useFastLaneCompactDynamicPackets: boolean;
  playerContext: string;
  loreFallbackPath: "none" | "db_partial" | "registry";
  loreSourceCount: number;
  loreCacheHit: boolean;
  loreBudgetHit: boolean;
  loreTokenEstimate: number;
  runtimeLoreCompact: string;
  loreRetrievalLatencyMs: number;
  runtimeLorePacket: LorePacket | null;
  runtimePacketChars: number;
  runtimePacketTokenEstimate: number;
  directorBeatHint: string | null;
  directorTension: number | null;
  isFirstAction: boolean;
  playerDmStablePrefix: string;
  requestStartedAt: number;

  // Objects / arrays
  clientState: ClientStructuredContextV1 | null;
  rawChatMessages: ChatMessage[];
  perfFlags: ChatPerfFlags;
  ttftProfile: ChatTtftProfile;
  laneSideEffectPlan: TurnLaneDecision["sideEffectPlan"];
  turnLaneDecision: TurnLaneDecision;
  pipelineControl: PlayerControlPlane | null;
  pipelineRule: PlayerRuleSnapshot;
  preflightTurnMetrics: TurnPreflightMetrics;
  sessionMemory: SessionMemoryRow | null;
  verseRollout: {
    enableNpcBeliefGraph: boolean;
    enableWorldFactRegistry: boolean;
    enablePlayerEchoCanon: boolean;
    enablePlayerEchoPromptPacket: boolean;
    enableStyleGuidePacket: boolean;
    enablePromptPacketDedupV1: boolean;
    enableNarrativeStyleBible: boolean;
    enableLongNarrativeMode: boolean;
    enableDecisionTurnMode: boolean;
    enableProtagonistAnchorPacket: boolean;
    enableRealityConstraintPacket: boolean;
    enableNarrativeDirective: boolean;
    [key: string]: unknown;
  };
  epistemicRolloutFlags: ReturnType<typeof getEpistemicRolloutFlags>;
  normalizedIntent: NormalizedPlayerIntent;
  pipelinePreflightFailed: boolean;
  controlPreflightBudgetHit: boolean;
  memoryBlock: string;
  messagesToSend: ChatMessage[];

  // Mutable refs (read within the section)
  inputSafety: { decision: string; userMessage?: string; narrativeFallback?: string; traceId?: string; debug?: unknown };
  antiCheat: { decision: string; rewritten?: string };
  turnRawAction: string | null;
  turnDice: number | null;

  // Async resources (awaited in the section)
  runControlPreflightP: Promise<unknown>;
  loreRetrievalP: Promise<void>;
  playerEchoCanonPromise: Promise<PlayerEchoCanon | null>;
  playerEchoReadFailed: boolean;
}

export interface BuildPlayerChatMessagesResult {
  // State assigned in this section (originally `let` vars in outer scope)
  runtimePacketChars: number;
  runtimePacketTokenEstimate: number;
  memoryBlock: string;

  // Prompt assembly outputs (used downstream in route.ts)
  safeMessages: ChatMessage[];
  stableCharLen: number;
  dynamicCharLen: number;
  promptVersion: string;
  promptStablePrefixHash: string;
  stableTokenEstimate: number;
  dynamicTokenEstimate: number;
  promptComponentChars: Record<string, number>;
  turnExecutionContext: TurnExecutionContext;
  preStateDelta: StateDelta;
  plannedTurnMode: ReturnType<typeof inferPlannedTurnMode>;
  epistemicPromptContext: ReturnType<typeof buildEpistemicPromptContext>;
  narrativeBudget: ReturnType<typeof resolveNarrativeBudget>;
  narrativeBudgetTier: string;
  narrativeBudgetTargetChars: number;
  playerChatMaxTokens: number;
  playerChatMaxTokensResolution: ReturnType<typeof resolvePlayerChatMaxTokensForNarrativeBudget>;
  actorEpistemicFilter: EpistemicFilterResult;
  dmEpistemicFilter: EpistemicFilterResult;
  npcConsistencyBoundaryFinal: ReturnType<typeof buildNpcConsistencyBoundaryCompactBlock>;
  npcKnowledgePacketForValidator: ReturnType<typeof buildNpcKnowledgePacket> | null;
  allowedWorldFactIdsForValidator: string[];
  playerEchoPacketChars: number;
  playerEchoSelectedFragments: ReturnType<typeof selectPlayerEchoFragments>;
  focusNpcForPrompt: string | null;
  aiEnvForSystem: ReturnType<typeof resolveAiEnv>;

  // Additional state needed by downstream code (flushTokenUsage, runStreamFinalHooks)
  epistemicPromptMetrics: ReturnType<typeof buildActorScopedEpistemicMemoryBlock>["metrics"];
  epistemicAnomalyResult: EpistemicAnomalyResult | null;
  epistemicResiduePlan: ReturnType<typeof buildEpistemicResiduePerformancePlan>;
  socialProjectionTelemetry: {
    socialWorldMode: string;
    socialHintCount: number;
    socialHintChars: number;
    socialPromptChars: number;
    socialQueryLatencyMs: number;
    socialHintVisibilityCounts: { ambient: number; rumor: number; directly_observable: number };
    socialEventsProjected: number;
    socialProjectionSkippedReason: string;
  };
  directorDirectiveIdsForReceipt: string[];
  injectedSocialEventIds: string[];
  playerEchoFirstEncounterPlan: ReturnType<typeof computeNpcFirstEncounterEchoPlan> | null;
  allEpistemicFactsForPrompt: KnowledgeFact[];
  presentNpcIdsForEpistemic: string[];
  nowIsoForEpistemic: string;
  maxRevealRankForMemory: number;
  epistemicProfileForPrompt: NpcEpistemicProfile | null;
  socialWorldConfig: ReturnType<typeof resolveSocialWorldConfig>;
  worldDirectorConfig: ReturnType<typeof resolveWorldDirectorConfig>;
  totalSystemPromptChars: number;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function buildPlayerChatMessages(
  ctx: BuildPlayerChatMessagesContext
): Promise<BuildPlayerChatMessagesResult> {
  const {
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
    runtimeLoreCompact,
    loreRetrievalLatencyMs,
    runtimeLorePacket,
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
    runControlPreflightP,
    loreRetrievalP,
    playerEchoCanonPromise,
    playerEchoReadFailed,
    inputSafety,
    antiCheat,
    turnRawAction,
    turnDice,
    messagesToSend,
  } = ctx;

  void runtimeLoreCompact;
  void requestStartedAt;
  void controlPreflightBudgetHit;
  void playerEchoReadFailed;

  let memoryBlock = ctx.memoryBlock;
  let runtimePacketChars = ctx.runtimePacketChars;
  let runtimePacketTokenEstimate = ctx.runtimePacketTokenEstimate;
  const clientStateRecord = asPlainRecordForEcho(clientState);
  const isXingni = clientStateRecord?.worldId === "xingni_taichu";

  const serviceState = (() => {
    const base = createDefaultB1ServiceState();
    const raw =
      clientState && typeof clientState === "object" && !Array.isArray(clientState)
        ? ((clientState as any).services ?? (clientState as any).serviceState ?? null)
        : null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    const o = raw as Record<string, unknown>;
    return {
      shopUnlocked: typeof o.shopUnlocked === "boolean" ? o.shopUnlocked : base.shopUnlocked,
      forgeUnlocked: typeof o.forgeUnlocked === "boolean" ? o.forgeUnlocked : base.forgeUnlocked,
      anchorUnlocked: typeof o.anchorUnlocked === "boolean" ? o.anchorUnlocked : base.anchorUnlocked,
      unlockFlags:
        o.unlockFlags && typeof o.unlockFlags === "object" && !Array.isArray(o.unlockFlags)
          ? (o.unlockFlags as Record<string, boolean>)
          : base.unlockFlags,
    };
  })();

  const serviceContextBlock = isXingni ? "" : buildB1ServiceContextBlock({
    playerLocation: guessPlayerLocationFromContext(playerContext),
    playerContext,
    serviceState,
  });
  // When NPC belief graph validation is active, the code-level validators
  // (applyNpcProactiveGrantGuard, ensure7FConspiracyTask) already enforce
  // NPC task grant and conspiracy constraints post-generation, so the
  // narrative prompt blocks can be slimmed.
  const npcTaskNarrativeBlock =
    !laneSideEffectPlan.compactPrompt && !verseRollout.enableNpcBeliefGraph
      ? buildNpcProactiveGrantNarrativeBlock({
          playerContext,
          latestUserInput,
        })
      : "";
  const conspiracyNarrativeBlock =
    !laneSideEffectPlan.compactPrompt && !verseRollout.enableNpcBeliefGraph
      ? build7FConspiracyNarrativeBlock({
          playerContext,
          latestUserInput,
        })
      : "";
  const worldDirectorConfig = resolveWorldDirectorConfig();
  const socialWorldConfig = resolveSocialWorldConfig();
  const runtimeScope = {
    worldId: isXingni ? XINGNI_WORLD_ID : DARK_MOON_WORLD_ID,
    mapId: isXingni ? QINGSHI_MAP_ID : DARK_MOON_MAP_ID,
    sessionId: sessionId ?? "",
  } as const;
  const writerDirectorDirectivePromise = sessionId && worldDirectorConfig.directiveInjectionEnabled
    ? loadDirectorDirectiveForWriter({
        scope: runtimeScope,
        turnIndex: totalRounds,
        timeoutMs: worldDirectorConfig.eventQueryTimeoutMs,
      }).catch(() => null)
    : Promise.resolve(null);
  const socialWorldHintPromise = loadSocialWorldHintForPrompt({
    sessionId,
    nowTurn: totalRounds,
    loadDueSocialEventsForPrompt,
    enabled: !isXingni && socialWorldConfig.promptInjectionEnabled,
    timeoutMs: socialWorldConfig.queryTimeoutMs,
    budget: socialWorldConfig.budget,
  });
  const [, , writerDirectorDirective, socialWorldHintForPrompt] = await Promise.all([
    runControlPreflightP,
    loreRetrievalP,
    writerDirectorDirectivePromise,
    socialWorldHintPromise,
  ]);
  const directorDirective = writerDirectorDirective?.directive ?? null;
  const socialWorldHintBlock = socialWorldHintForPrompt?.block ?? "";
  const injectedSocialEventIds = socialWorldHintForPrompt?.projectedEventIds ?? [];
  const socialProjectionTelemetry = {
    socialWorldMode: socialWorldConfig.mode,
    socialHintCount: socialWorldHintForPrompt?.socialHintCount ?? 0,
    socialHintChars: socialWorldHintForPrompt?.socialHintChars ?? 0,
    socialPromptChars: socialWorldHintForPrompt?.socialHintChars ?? 0,
    socialQueryLatencyMs: socialWorldHintForPrompt?.socialQueryLatencyMs ?? 0,
    socialHintVisibilityCounts: socialWorldHintForPrompt?.socialHintVisibilityCounts ?? {
      ambient: 0,
      rumor: 0,
      directly_observable: 0,
    },
    socialEventsProjected: injectedSocialEventIds.length,
    socialProjectionSkippedReason:
      socialWorldHintForPrompt?.socialProjectionSkippedReason ??
      (socialWorldConfig.promptInjectionEnabled ? "query_failed" : "disabled"),
  };
  const directorDirectiveBlock = writerDirectorDirective?.block ?? "";
  ttftProfile.controlPreflightMs =
    typeof preflightTurnMetrics.latencyMs === "number" ? Math.max(0, preflightTurnMetrics.latencyMs) : 0;
  ttftProfile.loreRetrievalMs = Math.max(0, loreRetrievalLatencyMs);

  const nowIsoForEpistemic = new Date().toISOString();
  const playerLocForEpistemic = isXingni
    ? String(clientStateRecord?.playerLocation ?? "QS_GUOYAN_INN")
    : guessPlayerLocationFromContext(playerContext);
  const presentNpcIdsForEpistemic = isXingni
    ? (Array.isArray(clientStateRecord?.presentNpcIds) ? clientStateRecord.presentNpcIds.filter((id): id is string => typeof id === "string").slice(0, 32) : [])
    : extractPresentNpcIds(playerContext, playerLocForEpistemic);
  const signalsForEpistemicReveal = parsePlayerWorldSignals(playerContext, playerLocForEpistemic);
  const maxRevealRankForMemory = computeMaxRevealRankFromSignals(signalsForEpistemicReveal);

  let focusNpcForPrompt: string | null = null;
  let epistemicAnomalyResult: EpistemicAnomalyResult | null = null;
  let epistemicProfileForPrompt: NpcEpistemicProfile | null = null;
  let allEpistemicFactsForPrompt: KnowledgeFact[] = [];
  let epistemicAlertAugmentation = "";

  /**
   * Epistemic 体系属于"质量增强层"而非"首字正确性底线"：
   * - fast lane 首字优先：禁止进入该重计算分支，避免把普通回合拖慢到慢车道 TTFT
   * - slow lane 可启用：用于 NPC 记忆/认知异常等一致性增强
   *
   * 为什么不会破坏安全/玩法？
   * - 输入安全、协议守卫、npcConsistencyBoundary（compact）仍在 core prompt 里
   * - 该分支主要影响"叙事一致性/记忆精度"，不负责内容安全与硬裁决
   */
  const shouldResolveFocusNpcForPrompt = !isXingni &&
    !shouldApplyFirstActionConstraint && (!laneSideEffectPlan.compactPrompt || laneSideEffectPlan.requireFullEpistemic);
  const shouldRunFullEpistemicForPrompt =
    shouldResolveFocusNpcForPrompt &&
    (laneSideEffectPlan.requireFullEpistemic || epistemicRolloutFlags.enableEpistemicGuard);

  if (shouldRunFullEpistemicForPrompt) {
    const loreSlice = runtimeLorePacket ? mergeLorePacketSlices(runtimeLorePacket) : [];
    const fromLore = loreFactsToKnowledgeFacts(loreSlice.slice(0, 96), nowIsoForEpistemic);
    const fromSession = isXingni ? [] : sessionMemoryRowToKnowledgeFacts(sessionMemory, nowIsoForEpistemic);
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
      epistemicProfileForPrompt = buildNpcEpistemicProfile(focusNpcId, {
        overrides:
          pipelineRule.in_dialogue_hint && focusNpcId !== XINLAN_NPC_ID
            ? { remembersPlayerIdentity: "vague" }
            : undefined,
      });
      // epistemic anomaly detection (detectCognitiveAnomaly) deferred to
      // post-generation (final hooks) to save 10-50 ms pre-TTFT CPU.
      // The 5-bucket classification still runs here unchanged.
    }
  } else if (shouldResolveFocusNpcForPrompt) {
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
   * narrative rendering / post-generation validators consume. The final DM
   * prompt is assembled from `buildEpistemicPromptContext` below; legacy
   * string-layer memory is now telemetry-only for this route.
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
    maxRevealRank: maxRevealRankForMemory,
    profile: null,
    nowIso: nowIsoForEpistemic,
  });
  const npcKnowledgePacketForValidator = verseRollout.enableNpcBeliefGraph && focusNpcForPrompt
    ? buildNpcKnowledgePacket({
        speakerNpcId: focusNpcForPrompt,
        presentNpcIds: presentNpcIdsForEpistemic,
        location: playerLocForEpistemic,
        floorId: null,
        maxRevealRank: maxRevealRankForMemory,
        playerKnownFactIds: actorEpistemicFilter.playerOnlyFacts.map((fact) => fact.id),
        scenePublicFactIds: actorEpistemicFilter.scenePublicFacts.map((fact) => fact.id),
        activeTaskIds: [],
      })
    : null;
  const factAuditFloorId = inferNpcKnowledgeFloorId(playerLocForEpistemic, null);
  const allowedWorldFactIdsForValidator = verseRollout.enableWorldFactRegistry
    ? [
        ...new Set([
          ...listWorldFacts(maxRevealRankForMemory).map((fact) => fact.factId),
          ...(factAuditFloorId ? getFactsForFloor(factAuditFloorId, maxRevealRankForMemory).map((fact) => fact.factId) : []),
          ...(focusNpcForPrompt ? getFactsForNpc(focusNpcForPrompt, maxRevealRankForMemory).map((fact) => fact.factId) : []),
          ...actorEpistemicFilter.scenePublicFacts.map((fact) => fact.id),
          ...actorEpistemicFilter.actorScopedFacts.map((fact) => fact.id),
          ...(npcKnowledgePacketForValidator?.can_know_fact_ids ?? []),
          ...(npcKnowledgePacketForValidator?.can_hint_fact_ids ?? []),
        ]),
      ]
    : [];
  const playerEchoCanonForPrompt = await playerEchoCanonPromise;
  const playerEchoSelectedFragments = playerEchoCanonForPrompt
    ? selectPlayerEchoFragments(playerEchoCanonForPrompt, {
        activeNpcId: focusNpcForPrompt,
        presentNpcIds: presentNpcIdsForEpistemic,
        locationId: playerLocForEpistemic,
        floorId: factAuditFloorId,
        latestUserInput,
        revealTier: maxRevealRankForMemory,
        npcMemoryPrivilegeById: buildNpcMemoryPrivilegeMapForEcho([
          ...(focusNpcForPrompt ? [focusNpcForPrompt] : []),
          ...presentNpcIdsForEpistemic,
        ]),
      })
    : [];
  const playerEchoFirstEncounterPlan =
    playerEchoCanonForPrompt && focusNpcForPrompt
      ? computeNpcFirstEncounterEchoPlan({
          canonIdentity: getNpcCanonicalIdentity(focusNpcForPrompt),
          echoCanon: playerEchoCanonForPrompt,
          activeNpcId: focusNpcForPrompt,
          snapshot: extractRunSnapshotForEcho(clientState),
          currentRunDiscovered: collectCurrentRunDiscoveredNpcIdsForEcho(clientState),
          revealTier: maxRevealRankForMemory,
        })
      : null;
  const playerEchoPromptBlock =
    !isXingni && verseRollout.enablePlayerEchoCanon && verseRollout.enablePlayerEchoPromptPacket
      ? buildPlayerEchoPromptBlock(playerEchoSelectedFragments, playerEchoFirstEncounterPlan)
      : "";
  const playerEchoPacketChars = playerEchoPromptBlock.length;
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
          summaryMaxChars: 120,
          playerStatusMaxChars: 80,
          npcRelationsMaxChars: 60,
          layerMaxChars: 80,
          npcSnapshotsMaxChars: 60,
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
    detectorRan: Boolean(focusNpcForPrompt && shouldRunFullEpistemicForPrompt),
    options: memoryCapsFinal,
    nowIso: nowIsoForEpistemic,
    maxRevealRank: maxRevealRankForMemory,
    runtimeCrossRefNote: epistemicRuntimeCrossRef,
    actorCanonOneLiner: actorCanonOneLinerForMemory,
    actorScopedEpistemicEnabled: epistemicRolloutFlags.enableActorScopedEpistemic,
  });
  const epistemicPromptMetrics = scopedFinal.metrics;
  memoryBlock = "";

  const controlAugmentation = buildControlAugmentationBlock({
    control: pipelineControl,
    rule: pipelineRule,
    preflightFailed: pipelinePreflightFailed,
  });

  // When both epistemic alert augmentation and residue augmentation are empty,
  // skip both lines entirely — saves ~100–300 chars per turn with no epistemic issues.
  const hasEpistemicAugmentation =
    Boolean(epistemicAlertAugmentation) || Boolean(epistemicResiduePlan.augmentationBlock);

  const controlAndLoreAugmentation = isXingni ? "" : [
    contextMode === "minimal" ? "" : controlAugmentation,
    contextMode === "minimal" ? "" : serviceContextBlock,
    directorDirectiveBlock,
    contextMode === "minimal" ? "" : npcTaskNarrativeBlock,
    conspiracyNarrativeBlock,
    ...(hasEpistemicAugmentation
      ? [contextMode === "minimal" ? "" : epistemicAlertAugmentation, epistemicResiduePlan.augmentationBlock]
      : []),
    // When social events have been loaded (code-validated at creation) and
    // the narrative safety hard gate runs post-generation, the social world
    // constraint enforcement is already covered by code — skip this block.
    contextMode === "minimal" || (injectedSocialEventIds.length > 0 && laneSideEffectPlan.requireNarrativeSafetyHardGate)
      ? ""
      : socialWorldHintBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const shouldSkipRuntimePacketsForFastLane =
    perfFlags.enableLightweightFastPath &&
    perfFlags.fastLaneSkipRuntimePackets &&
    laneSideEffectPlan.compactPrompt;
  const runtimePacketMaxChars = contextMode === "minimal"
    ? 900
    : Math.max(2_400, Math.min(4_000, Math.trunc(envNumber("AI_CHAT_RUNTIME_PACKET_MAX_CHARS", 3_200))));

  const runtimePackets = isXingni
    ? [
        buildXingniRuntimePacket({
          playerLocation: playerLocForEpistemic ?? "QS_GUOYAN_INN",
          worldStateDigest: clientStateRecord?.worldStateDigest,
          presentNpcIds: presentNpcIdsForEpistemic,
          directorPacing: null,
        }),
        directorDirectiveBlock,
      ].filter(Boolean).join("\n\n")
    : shouldSkipRuntimePacketsForFastLane
    ? ""
    : buildRuntimeContextPackets({
        playerContext,
        latestUserInput,
        playerLocation: guessPlayerLocationFromContext(playerContext),
        serviceState,
        runtimeLoreCompact: "",
        contextMode,
        maxChars: runtimePacketMaxChars,
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
    maxChars: contextMode === "minimal" ? 280 : 800,
    microSceneActorGate: contextMode === "minimal",
    rollout: {
      enableNpcCanonGuard: epistemicRolloutFlags.enableNpcCanonGuard,
      enableNpcBaselineAttitude: epistemicRolloutFlags.enableNpcBaselineAttitude,
      enableNpcSceneAuthority: epistemicRolloutFlags.enableNpcSceneAuthority,
    },
  });
  const legacyStyleGuideBlock = !isXingni &&
    verseRollout.enableStyleGuidePacket &&
    !(verseRollout.enablePromptPacketDedupV1 && verseRollout.enableNarrativeStyleBible) &&
    !useFastLaneCompactDynamicPackets
      ? buildStyleGuidePacketBlock()
      : "";
  // Minimal context mode: the compact stable prompt already covers style and continuity
  // guidance, so skip the heavier narrative style bible and continuity block buildup.
  const narrativeStyleBibleBlock =
    !isXingni && verseRollout.enableNarrativeStyleBible && !useFastLaneCompactDynamicPackets && contextMode !== "minimal"
      ? buildNarrativeStyleBiblePacketBlock({
          rawAction: turnRawAction ?? latestUserInput,
          maxChars: 1200,
          includeExamples: true,
        })
      : "";
  // worldFactAuditBlock removed: redundant with validateNarrative + unsupportedFactDetector.
  const styleGuideBlock = legacyStyleGuideBlock;
  const narrativeContinuityBlock = isXingni || contextMode === "minimal"
    ? ""
    : buildNarrativeContinuityPacketBlock({
        previousTail: extractLastAssistantNarrativeTail(rawChatMessages),
        rawAction: turnRawAction ?? latestUserInput,
        dice: turnDice,
        maxChars: 900,
      });
  const povBlock = isXingni
    ? buildThirdPersonLimitedPovPacketBlock({ maxChars: contextMode === "minimal" ? 220 : 420 })
    : buildPovPacketBlock({ maxChars: contextMode === "minimal" ? 180 : 420 });
  const npcGenderPronounBlock = buildNpcGenderPronounPacketBlock({
    focusNpcId: focusNpcForPrompt,
    presentNpcIds: presentNpcIdsForEpistemic,
    maxChars: contextMode === "minimal" ? 280 : 760,
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
  const epistemicPromptContext = buildEpistemicPromptContext(
    actorEpistemicFilter,
    focusNpcForPrompt ?? PLAYER_ACTOR_ID,
    turnLaneDecision.lane,
    {
      compact: laneSideEffectPlan.requireFullEpistemic ? false : laneSideEffectPlan.compactPrompt || contextMode === "minimal",
      maxPromptChars: laneSideEffectPlan.requireFullEpistemic ? 3200 : contextMode === "minimal" ? 900 : 1800,
      maxFactChars: laneSideEffectPlan.requireFullEpistemic ? 180 : contextMode === "minimal" ? 80 : 120,
    }
  );
  const narrativeBudget = resolveNarrativeBudget({
    plannedTurnMode: `${plannedTurnMode.mode}:${plannedTurnMode.reason}`,
    riskLane,
    latestUserInput,
    playerContext: playerContextForPrompt,
    clientState,
    isFirstAction: shouldApplyFirstActionConstraint,
    currentLocation: playerLocForEpistemic,
    presentNpcIds: presentNpcIdsForEpistemic,
    recentNarrativeTail: extractLastAssistantNarrativeTail(rawChatMessages),
    isEndgame: plannedTurnMode.reason.startsWith("time_endgame"),
    isChapterClimax: directorBeatHint === "peak" || directorBeatHint === "climax" || (directorTension ?? 0) >= 95,
    chapter: extractChapterNarrativeBudgetInput(clientState),
  });
  // narrativeBudgetBlock trimmed to budget caps only (tier, chars, stopRule). Prose instructions dropped.
  const narrativeBudgetBlock = laneSideEffectPlan.requirePacingValidation
    ? (() => {
        const caps: Record<string, unknown> = {
          schema: "narrative_budget_v2",
          tier: narrativeBudget.tier,
          minChars: narrativeBudget.minChars,
          targetChars: narrativeBudget.targetChars,
          maxChars: narrativeBudget.maxChars,
          stopRule: narrativeBudget.stopRule,
        };
        if (narrativeBudget.chapter) {
          caps.chapter = {
            remainingHardChars: narrativeBudget.chapter.remainingHardChars,
            shouldClose: narrativeBudget.chapter.shouldClose,
          };
        }
        return `## 【narrative_budget_packet】\n${JSON.stringify(caps)}`;
      })()
    : "";
  const narrativeBudgetTier = narrativeBudget.tier;
  const narrativeBudgetTargetChars = narrativeBudget.targetChars;
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

  // Phase-5: emit lane decision and applied side-effect plan as formal
  // analytics events. Non-blocking.
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
        sideEffectPlan: laneSideEffectPlan,
        epistemicPromptContext: epistemicPromptContext.telemetry,
      },
    }).catch(() => {});
    void recordGenericAnalyticsEvent({
      eventId: `${requestId}:lane_side_effect_applied`,
      idempotencyKey: `${requestId}:lane_side_effect_applied`,
      userId,
      guestId: userId ? null : chatGuestId,
      sessionId: capturedSessionIdLane,
      eventName: "lane_side_effect_applied",
      eventTime: new Date(),
      page: "/play",
      source: "chat",
      platform,
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        requestId,
        lane: turnLaneDecision.lane,
        riskLane,
        reasons: [...turnLaneDecision.reasons],
        sideEffectPlan: laneSideEffectPlan,
        skipped_runtime_lore: laneSideEffectPlan.skipRuntimeLore,
        full_epistemic_required: laneSideEffectPlan.requireFullEpistemic,
        compactPrompt: laneSideEffectPlan.compactPrompt,
        requireNarrativeSafetyHardGate: laneSideEffectPlan.requireNarrativeSafetyHardGate,
      },
    }).catch(() => {});
  }

  // turnModePolicyBlock removed: code controls maxTokens; narrative length is governed by narrativeBudgetBlock.
  const protagonistAnchorBlock = !isXingni && verseRollout.enableProtagonistAnchorPacket && !useFastLaneCompactDynamicPackets
    ? buildProtagonistAnchorPacketBlock({
        playerContext: playerContextForPrompt,
        clientState,
        maxChars: contextMode === "minimal" ? 420 : 980,
      })
    : "";
  // realityConstraintBlock trimmed to 2-3 essential lines: resolveDmTurn + validateNarrative are the real guardrails.
  const realityConstraintBlock = !isXingni && verseRollout.enableRealityConstraintPacket && !useFastLaneCompactDynamicPackets
    ? buildRealityConstraintPacketBlock({
        playerContext: playerContextForPrompt,
        latestUserInput,
        playerLocationFallback: guessPlayerLocationFromContext(playerContext),
        clientState,
        maxChars: contextMode === "minimal" ? 240 : 400,
        dedupeStableRules: true,
      })
    : "";
  // Phase-5: read due foreshadow entries for directive injection (fail-open, non-blocking)
  let dueForeshadowEntries: Array<Record<string, unknown>> = [];
  if (sessionId && verseRollout.enableNarrativeDirective) {
    try {
      const { readDueForeshadowEntries } = await import("@/lib/narrativeGovernance/foreshadowLedger");
      dueForeshadowEntries = await readDueForeshadowEntries(sessionId, totalRounds);
    } catch {
      // fail-open: 指令中伏笔提示降级为空
    }
  }
  const narrativeDirectiveBlock =
    !isXingni && verseRollout.enableNarrativeDirective && !useFastLaneCompactDynamicPackets && directorBeatHint
      ? buildNarrativeDirectiveBlock({
          lane: turnLaneDecision.lane,
          beatState: normalizeBeatState(directorBeatHint),
          recentRegisters: undefined, // 账本读取留给未来优化
          directorAgendaHint: null,
          dueForeshadow: dueForeshadowEntries as any,
        })
      : "";
  // NPC 回合状态：基于场景和对话历史计算每个在场 NPC 的对话阶段
  const npcTurnState = computeNpcTurnState(playerContext, rawChatMessages);
  const npcTurnStateBlock = isXingni ? "" : buildNpcTurnStatePacket(npcTurnState);
  const dynamicSuffixFull = buildDynamicPlayerDmSystemSuffix({
    languageInstruction,
    memoryBlock,
    epistemicPromptContextBlock: epistemicPromptContext.promptBlock,
    playerContext: playerContextForPrompt,
    isFirstAction: shouldApplyFirstActionConstraint,
    runtimePackets,
    controlAugmentation: controlAndLoreAugmentation,
    protagonistAnchorBlock,
    narrativeStyleBibleBlock: useFastLaneCompactDynamicPackets ? "" : narrativeStyleBibleBlock,
    narrativeBudgetBlock,
    playerEchoBlock: playerEchoPromptBlock,
    realityConstraintBlock,
    npcConsistencyBoundaryBlock: isXingni || useFastLaneCompactDynamicPackets ? "" : npcConsistencyBoundaryFinal.text,
    narrativeContinuityBlock: useFastLaneCompactDynamicPackets ? "" : narrativeContinuityBlock,
    povBlock: useFastLaneCompactDynamicPackets ? "" : povBlock,
    npcGenderPronounBlock: isXingni || useFastLaneCompactDynamicPackets ? "" : npcGenderPronounBlock,
    styleGuideBlock,
    narrativeDirectiveBlock,
    npcTurnStateBlock,
    latestUserInput,
  });
  const aiEnvForSystem = resolveAiEnv();
  const playerChatMaxTokensResolution = resolvePlayerChatMaxTokensForNarrativeBudget(
    narrativeBudgetTier,
    aiEnvForSystem.playerChatMaxTokensOverride
  );

  // === 计算 prompt 组装产物中被意外截断的字段（修复 promptAssembly.ts 截断） ===
  // compose system message
  const systemContent = playerDmStablePrefix + dynamicSuffixFull;
  const safeMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...messagesToSend,
  ];

  // character / token estimates (chars / 4 是仓内统一约定)
  const stableCharLen = playerDmStablePrefix.length;
  const dynamicCharLen = dynamicSuffixFull.length;
  const promptVersion = isXingni ? getXingniPromptVersion() : getPlayerDmPromptVersion();
  const promptStablePrefixHash = stablePromptHash(playerDmStablePrefix);
  const stableTokenEstimate = Math.ceil(stableCharLen / 4);
  const dynamicTokenEstimate = Math.ceil(dynamicCharLen / 4);
  const totalSystemPromptChars = systemContent.length;
  const totalSystemPromptTokens = estimatePromptTokens(systemContent);

  // Langfuse stage span: track prompt token reduction metrics
  const promptAssemblySpan = startStageSpan({
    name: "prompt.assembly",
    status: "ok",
    resultSummary: {
      stablePrefixChars: stableCharLen,
      dynamicSuffixChars: dynamicCharLen,
      totalSystemPromptChars,
      estimatedTokens: totalSystemPromptTokens,
    },
  });
  promptAssemblySpan.end();

  // Telemetry: fire-and-forget prompt assembly metrics
  if (sessionId) {
    void recordGenericAnalyticsEvent({
      eventId: `${requestId}:prompt_assembly_completed`,
      idempotencyKey: `${requestId}:prompt_assembly_completed`,
      userId,
      guestId: userId ? null : chatGuestId,
      sessionId,
      eventName: "prompt_assembly_completed",
      eventTime: new Date(),
      page: "/play",
      source: "chat",
      platform,
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        requestId,
        stablePrefixChars: stableCharLen,
        dynamicSuffixChars: dynamicCharLen,
        totalSystemPromptChars,
        estimatedTokens: totalSystemPromptTokens,
        promptVersion,
        promptStablePrefixHash,
      },
    }).catch(() => {});
  }

  // per-component character counts (analytics telemetry)
  const promptComponentChars: Record<string, number> = {
    stable: stableCharLen,
    dynamic: dynamicCharLen,
    memory: memoryBlock.length,
    npcTurnState: estimateNpcTurnStatePacketChars(npcTurnState),
  };

  // player chat max tokens (extracted from resolution)
  const playerChatMaxTokens = playerChatMaxTokensResolution.maxTokens;

  return {
    runtimePacketChars,
    runtimePacketTokenEstimate,
    memoryBlock,
    safeMessages,
    stableCharLen,
    dynamicCharLen,
    promptVersion,
    promptStablePrefixHash,
    stableTokenEstimate,
    dynamicTokenEstimate,
    promptComponentChars,
    turnExecutionContext,
    preStateDelta,
    plannedTurnMode,
    epistemicPromptContext,
    narrativeBudget,
    narrativeBudgetTier,
    narrativeBudgetTargetChars,
    playerChatMaxTokens,
    playerChatMaxTokensResolution,
    actorEpistemicFilter,
    dmEpistemicFilter,
    npcConsistencyBoundaryFinal,
    npcKnowledgePacketForValidator,
    allowedWorldFactIdsForValidator,
    playerEchoPacketChars,
    playerEchoSelectedFragments,
    focusNpcForPrompt,
    aiEnvForSystem,
    epistemicPromptMetrics,
    epistemicAnomalyResult,
    epistemicResiduePlan,
    socialProjectionTelemetry,
    directorDirectiveIdsForReceipt: directorDirective ? [directorDirective.directiveId] : [],
    injectedSocialEventIds,
    playerEchoFirstEncounterPlan,
    allEpistemicFactsForPrompt,
    presentNpcIdsForEpistemic,
    nowIsoForEpistemic,
    maxRevealRankForMemory,
    epistemicProfileForPrompt,
    socialWorldConfig,
    worldDirectorConfig,
    totalSystemPromptChars,
  };
}
