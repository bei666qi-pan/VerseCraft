// src/lib/playRealtime/promptAssembly.ts
// Extracted from src/app/api/chat/route.ts — prompt assembly section (formerly lines 1639–2413).
// Exports `buildPlayerChatMessages` which takes a context object and returns all
// prompt assembly outputs. This is NOT the same as `assemblePlayerChatPrompt`
// (which lives in `@/lib/turnEngine/promptAssembly`).

import type { AnalyticsPlatform } from "@/lib/analytics/types";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { envNumber } from "@/lib/config/envRaw";
import { resolveAiEnv } from "@/lib/ai/config/env";
import { resolvePlayerChatMaxTokensForNarrativeBudget } from "@/lib/ai/tasks/taskPolicy";
import { buildControlAugmentationBlock } from "@/lib/playRealtime/augmentation";
import { buildStyleGuidePacketBlock, buildDynamicPlayerDmSystemSuffix, getPlayerDmPromptVersion, stablePromptHash } from "@/lib/playRealtime/playerChatSystemPrompt";
import { buildNpcProactiveGrantNarrativeBlock } from "@/lib/tasks/taskV2";
import { build7FConspiracyNarrativeBlock } from "@/lib/revive/conspiracy";
import { buildServerDirectorHintBlock } from "@/lib/storyDirector/serverHint";
import { loadDueDirectorAgenda } from "@/lib/worldEngine/agenda";
import { resolveWorldDirectorConfig } from "@/lib/worldEngine/config";
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
import { buildPovPacketBlock } from "@/lib/playRealtime/povPackets";
import { buildNpcGenderPronounPacketBlock } from "@/lib/playRealtime/npcGenderPackets";
import { buildProtagonistAnchorPacketBlock } from "@/lib/playRealtime/protagonistAnchorPackets";
import { buildTurnModePolicyPacketBlock } from "@/lib/playRealtime/turnModePackets";
import { buildNarrativeBudgetPacketBlock, resolveNarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";
import { buildRealityConstraintPacketBlock } from "@/lib/playRealtime/realityConstraintPackets";
import { buildNarrativeDirectiveBlock } from "@/lib/playRealtime/narrativeDirectivePackets";
import { computeNpcFirstEncounterEchoPlan } from "@/lib/playerEcho/npcFirstEncounter";
import { buildPlayerEchoPromptBlock } from "@/lib/playerEcho/prompt";
import { selectPlayerEchoFragments } from "@/lib/playerEcho/select";
import type { PlayerEchoCanon } from "@/lib/playerEcho/types";
import { buildNpcKnowledgePacket, inferNpcKnowledgeFloorId } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import { getFactsForFloor, getFactsForNpc, listWorldFacts } from "@/lib/worldFacts/worldFactRegistry";
import { extractLastAssistantNarrativeTail, inferPlannedTurnMode } from "@/lib/turnEngine/requestMetadata";
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
  ChatTtftProfile,
  NormalizedPlayerIntent,
  StateDelta,
  TurnExecutionContext,
  TurnLaneDecision,
} from "@/lib/turnEngine/types";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";

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
  clientPurpose: string;
  languageInstruction: string;
  riskLane: string;
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
  clientState: unknown;
  rawChatMessages: Array<{ role: string; content: string }>;
  perfFlags: Record<string, boolean>;
  ttftProfile: ChatTtftProfile;
  laneSideEffectPlan: TurnLaneDecision["sideEffectPlan"];
  turnLaneDecision: TurnLaneDecision;
  pipelineControl: PlayerControlPlane | null;
  pipelineRule: { in_dialogue_hint?: boolean };
  preflightTurnMetrics: {
    ran: boolean;
    skippedReason: string | null;
    cacheHit: boolean;
    latencyMs: number | null;
    ok: boolean;
  };
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
  messagesToSend: Array<{ role: string; content: string }>;

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
  safeMessages: Array<{ role: string; content: string }>;
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
  npcKnowledgePacketForValidator: ReturnType<typeof buildNpcKnowledgePacket>;
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
  injectedDirectorAgendaIds: number[];
  injectedSocialEventIds: string[];
  dueDirectorAgendaForPrompt: ReturnType<typeof loadDueDirectorAgenda> extends Promise<infer T> ? T : never;
  playerEchoFirstEncounterPlan: ReturnType<typeof computeNpcFirstEncounterEchoPlan>;
  allEpistemicFactsForPrompt: KnowledgeFact[];
  presentNpcIdsForEpistemic: string[];
  nowIsoForEpistemic: string;
  maxRevealRankForMemory: number;
  epistemicProfileForPrompt: NpcEpistemicProfile | null;
  directorDigestForPrompt: unknown;
  socialWorldConfig: ReturnType<typeof resolveSocialWorldConfig>;
  worldDirectorConfig: ReturnType<typeof resolveWorldDirectorConfig>;
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

  const serviceContextBlock = buildB1ServiceContextBlock({
    playerLocation: guessPlayerLocationFromContext(playerContext),
    playerContext,
    serviceState,
  });
  const npcTaskNarrativeBlock =
    !laneSideEffectPlan.compactPrompt
      ? buildNpcProactiveGrantNarrativeBlock({
          playerContext,
          latestUserInput,
        })
      : "";
  const conspiracyNarrativeBlock =
    !laneSideEffectPlan.compactPrompt
      ? build7FConspiracyNarrativeBlock({
          playerContext,
          latestUserInput,
        })
      : "";
  const worldDirectorConfig = resolveWorldDirectorConfig();
  const socialWorldConfig = resolveSocialWorldConfig();
  const directorDigestForPrompt =
    clientState && typeof clientState === "object" && !Array.isArray(clientState)
      ? ((clientState as any).directorDigest ?? null)
      : null;
  const dueDirectorAgendaPromise =
    sessionId && worldDirectorConfig.hintInjectionEnabled
      ? loadDueDirectorAgenda({
          sessionId,
          turnIndex: totalRounds,
          limit: worldDirectorConfig.maxDueHints,
          timeoutMs: worldDirectorConfig.agendaQueryTimeoutMs,
        }).catch(() => [])
      : Promise.resolve([]);
  const socialWorldHintPromise = loadSocialWorldHintForPrompt({
    sessionId,
    nowTurn: totalRounds,
    loadDueSocialEventsForPrompt,
    enabled: socialWorldConfig.promptInjectionEnabled,
    timeoutMs: socialWorldConfig.queryTimeoutMs,
    budget: socialWorldConfig.budget,
  });
  let dueDirectorAgendaForPrompt: Awaited<typeof dueDirectorAgendaPromise> = [];
  let injectedDirectorAgendaIds: number[] = [];

  const [, , dueDirectorAgendaItems, socialWorldHintForPrompt] = await Promise.all([
    runControlPreflightP,
    loreRetrievalP,
    dueDirectorAgendaPromise,
    socialWorldHintPromise,
  ]);
  dueDirectorAgendaForPrompt = dueDirectorAgendaItems;
  injectedDirectorAgendaIds = dueDirectorAgendaItems.map((item) => item.id).filter((id) => Number.isFinite(id));
  void injectedDirectorAgendaIds; // used downstream by external callers after returning
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
  const directorHintBlock = (() => {
    try {
      return buildServerDirectorHintBlock(
        directorDigestForPrompt,
        dueDirectorAgendaForPrompt.map((item) => ({
          id: item.id,
          eventCode: item.eventCode,
          title: item.title,
          injectionHint: item.injectionHint,
          triggerConditions: [],
          agencyConstraints: item.agencyConstraints,
          forbiddenOutcomes: item.forbiddenOutcomes,
          salience: item.salience,
          revealPolicy: item.revealPolicy,
        }))
      );
    } catch {
      return "";
    }
  })();
  ttftProfile.controlPreflightMs =
    typeof preflightTurnMetrics.latencyMs === "number" ? Math.max(0, preflightTurnMetrics.latencyMs) : 0;
  ttftProfile.loreRetrievalMs = Math.max(0, loreRetrievalLatencyMs);

  const nowIsoForEpistemic = new Date().toISOString();
  const playerLocForEpistemic = guessPlayerLocationFromContext(playerContext);
  const presentNpcIdsForEpistemic = extractPresentNpcIds(playerContext, playerLocForEpistemic);
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
  const shouldResolveFocusNpcForPrompt =
    !shouldApplyFirstActionConstraint && (!laneSideEffectPlan.compactPrompt || laneSideEffectPlan.requireFullEpistemic);
  const shouldRunFullEpistemicForPrompt =
    shouldResolveFocusNpcForPrompt &&
    (laneSideEffectPlan.requireFullEpistemic || epistemicRolloutFlags.enableEpistemicGuard);

  if (shouldRunFullEpistemicForPrompt) {
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
    verseRollout.enablePlayerEchoCanon && verseRollout.enablePlayerEchoPromptPacket
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

  const controlAndLoreAugmentation = [
    contextMode === "minimal" ? "" : controlAugmentation,
    contextMode === "minimal" ? "" : serviceContextBlock,
    contextMode === "minimal" ? "" : directorHintBlock,
    npcTaskNarrativeBlock,
    conspiracyNarrativeBlock,
    epistemicAlertAugmentation,
    epistemicResiduePlan.augmentationBlock,
    socialWorldHintBlock,
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

  const runtimePackets = shouldSkipRuntimePacketsForFastLane
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
    maxChars: contextMode === "minimal" ? 560 : 1600,
    rollout: {
      enableNpcCanonGuard: epistemicRolloutFlags.enableNpcCanonGuard,
      enableNpcBaselineAttitude: epistemicRolloutFlags.enableNpcBaselineAttitude,
      enableNpcSceneAuthority: epistemicRolloutFlags.enableNpcSceneAuthority,
    },
  });
  const legacyStyleGuideBlock =
    verseRollout.enableStyleGuidePacket &&
    !(verseRollout.enablePromptPacketDedupV1 && verseRollout.enableNarrativeStyleBible) &&
    !useFastLaneCompactDynamicPackets
      ? buildStyleGuidePacketBlock()
      : "";
  const narrativeStyleBibleBlock =
    verseRollout.enableNarrativeStyleBible && !useFastLaneCompactDynamicPackets
      ? buildNarrativeStyleBiblePacketBlock({
          rawAction: turnRawAction ?? latestUserInput,
          maxChars: contextMode === "minimal" ? 720 : 1200,
          includeExamples: contextMode !== "minimal",
        })
      : "";
  const worldFactAuditBlock = !useFastLaneCompactDynamicPackets
    && verseRollout.enableWorldFactRegistry
    ? [
        "## 【world_fact_audit_v1】",
        JSON.stringify({
          required_when_claiming_world_facts: ["factId", "source", "truthLevel", "revealTier"],
          strong_fact_categories: [
            "root_cause",
            "relationship",
            "location_transition",
            "event_stage",
            "item_acquisition",
            "npc_identity_or_deep_role",
            "task_completion",
          ],
          output_required_when_claiming_strong_facts: {
            _narrative_audit: {
              used_fact_ids: ["fact:..."],
              mentioned_entity_ids: ["N-001", "location_or_item_id"],
              speaker_npc_id: focusNpcForPrompt ?? undefined,
              candidate_new_facts: [
                {
                  text: "未证实候选事实，不得写成确定世界事实",
                  category: "root_cause|relationship|location_transition|event_stage|item_acquisition|npc_identity|task_completion",
                  confidence: 0.2,
                  proposed_source: "player_observed|npc_belief|world_engine",
                },
              ],
            },
          },
          hard_rule: "Do not state apartment root, NPC relation, event stage, item ownership, floor anomaly, or key history as fact unless backed by a listed factId.",
        }),
      ].join("\n")
    : "";
  const styleGuideBlock = legacyStyleGuideBlock;
  const narrativeContinuityBlock = buildNarrativeContinuityPacketBlock({
    previousTail: extractLastAssistantNarrativeTail(rawChatMessages),
    rawAction: turnRawAction ?? latestUserInput,
    dice: turnDice,
    maxChars: contextMode === "minimal" ? 180 : 900,
  });
  const povBlock = buildPovPacketBlock({ maxChars: contextMode === "minimal" ? 180 : 420 });
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
  const narrativeBudgetBlock = laneSideEffectPlan.requirePacingValidation
    ? buildNarrativeBudgetPacketBlock(narrativeBudget)
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

  const turnModePolicyBlock =
    !useFastLaneCompactDynamicPackets && (verseRollout.enableLongNarrativeMode || verseRollout.enableDecisionTurnMode)
      ? buildTurnModePolicyPacketBlock({
          plannedMode: plannedTurnMode.mode,
          reason: plannedTurnMode.reason,
          maxChars: contextMode === "minimal" ? 420 : 860,
        })
      : "";
  const protagonistAnchorBlock = verseRollout.enableProtagonistAnchorPacket && !useFastLaneCompactDynamicPackets
    ? buildProtagonistAnchorPacketBlock({
        playerContext: playerContextForPrompt,
        clientState,
        maxChars: contextMode === "minimal" ? 420 : 980,
      })
    : "";
  const realityConstraintBlock = verseRollout.enableRealityConstraintPacket && !useFastLaneCompactDynamicPackets
    ? buildRealityConstraintPacketBlock({
        playerContext: playerContextForPrompt,
        latestUserInput,
        playerLocationFallback: guessPlayerLocationFromContext(playerContext),
        clientState,
        maxChars: contextMode === "minimal" ? 520 : 1400,
        dedupeStableRules: verseRollout.enablePromptPacketDedupV1,
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
    verseRollout.enableNarrativeDirective && !useFastLaneCompactDynamicPackets && directorBeatHint
      ? buildNarrativeDirectiveBlock({
          lane: turnLaneDecision.lane,
          beatState: normalizeBeatState(directorBeatHint),
          recentRegisters: undefined, // 账本读取留给未来优化
          directorAgendaHint: null,
          dueForeshadow: dueForeshadowEntries as any,
        })
      : "";
  const dynamicSuffixFull = buildDynamicPlayerDmSystemSuffix({
    languageInstruction,
    memoryBlock,
    epistemicPromptContextBlock: epistemicPromptContext.promptBlock,
    playerContext: playerContextForPrompt,
    isFirstAction: shouldApplyFirstActionConstraint,
    runtimePackets,
    controlAugmentation: controlAndLoreAugmentation,
    protagonistAnchorBlock,
    turnModePolicyBlock,
    narrativeStyleBibleBlock: useFastLaneCompactDynamicPackets ? "" : narrativeStyleBibleBlock,
    narrativeBudgetBlock,
    playerEchoBlock: playerEchoPromptBlock,
    worldFactAuditBlock,
    realityConstraintBlock,
    npcConsistencyBoundaryBlock: useFastLaneCompactDynamicPackets ? "" : npcConsistencyBoundaryFinal.text,
    narrativeContinuityBlock: useFastLaneCompactDynamicPackets ? "" : narrativeContinuityBlock,
    povBlock: useFastLaneCompactDynamicPackets ? "" : povBlock,
    npcGenderPronounBlock: useFastLaneCompactDynamicPackets ? "" : npcGenderPronounBlock,
    styleGuideBlock,
    narrativeDirectiveBlock,
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
  const safeMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemContent },
    ...messagesToSend,
  ];

  // character / token estimates (chars / 4 是仓内统一约定)
  const stableCharLen = playerDmStablePrefix.length;
  const dynamicCharLen = dynamicSuffixFull.length;
  const promptVersion = getPlayerDmPromptVersion();
  const promptStablePrefixHash = stablePromptHash(playerDmStablePrefix);
  const stableTokenEstimate = Math.ceil(stableCharLen / 4);
  const dynamicTokenEstimate = Math.ceil(dynamicCharLen / 4);

  // per-component character counts (analytics telemetry)
  const promptComponentChars: Record<string, number> = {
    stable: stableCharLen,
    dynamic: dynamicCharLen,
    memory: memoryBlock.length,
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
  };
}
