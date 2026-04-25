"use client";

import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toggleMute, isMuted, updateSanityFilter, setDarkMoonMode, playUIClick, setMasterVolume } from "@/lib/audioEngine";
import type { StatType } from "@/lib/registry/types";
import { useGameStore, type CodexEntry, type EchoTalent } from "@/store/useGameStore";
import { useSmoothStreamFromRef, type SmoothStreamTailDrainConfig } from "@/hooks/useSmoothStream";
import { usePlayWaitUx } from "@/hooks/usePlayWaitUx";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { UnifiedMenuModal } from "@/components/UnifiedMenuModal";
import { isValidBgmTrack } from "@/config/audio";
import { PlayAmbientOverlays } from "@/features/play/components/PlayAmbientOverlays";
import { PlayBlockingModals } from "@/features/play/components/PlayBlockingModals";
import { PlayComplianceToast } from "@/features/play/components/PlayComplianceToast";
import { PlayStoryScroll } from "@/features/play/components/PlayStoryScroll";
import {
  MobileActionDock,
  MobileBottomNav,
  MobileOptionsDropdown,
  MobileReadingHeader,
  MobileReadingShell,
  MobileStoryViewport,
} from "@/features/play/mobileReading";
import {
  computeOpeningBusyUi,
  shouldRecoverStaleSendActionFlight,
} from "@/features/play/opening/openingStreamUi";
import {
  FIXED_OPENING_NARRATIVE,
  OPENING_SYSTEM_PROMPT,
} from "@/features/play/opening/openingCopy";
import { isColdPlayOpening } from "@/features/play/opening/coldOpening";
import { FALLBACK_STATS, MAX_INPUT, STAT_ORDER } from "@/features/play/playConstants";
import { PROFESSION_IDS } from "@/lib/profession/registry";
import type { ProfessionId } from "@/lib/profession/types";
import { clampInt, localInputSafetyCheck, safeNumber } from "@/features/play/render/inputGuards";
import { deriveTaskConsequences } from "@/lib/tasks/taskConsequences";
import { applyBloodErase, extractGreenTips } from "@/features/play/render/narrative";
import {
  sanitizeDisplayedNarrative,
  sanitizeDisplayedOptionText,
} from "@/features/play/render/sanitizeDisplayedNarrative";
import {
  doesChatPhaseLockInteraction,
  doesPhaseBlockOptionsRegen,
  isStreamVisualActivePhase,
} from "@/features/play/stream/chatPhase";
import { extractNarrative, extractRegenOptionsFromRaw, tryParseDM } from "@/features/play/stream/dmParse";
import { extractCodexMentionsFromNarrative } from "@/lib/registry/codexAutoCapture";
import { buildClientOptionsRegenContext } from "@/lib/play/optionsRegenContext";
import { evaluateOptionsSemanticQuality } from "@/lib/play/optionsSemanticGuards";
import { buildOptionsRepairReason, getRepairMissingCount } from "@/lib/play/optionsRepair";
import { formatOptionsRegenDebugHint, mapOptionRejectReasonToCodes, type OptionsRegenReasonCode } from "@/lib/play/optionsRegenObservability";
import {
  accumulateDmFromSseEvent,
  extractFinalPayloadFromSseDocument,
  extractStatusFrameFromSseEvent,
  foldSseTextToDmRaw,
  normalizeSseNewlines,
  takeCompleteSseEvents,
} from "@/features/play/stream/sseFrame";
import { resolveTurnFromSse } from "@/features/play/stream/turnResolve";
import { getCommitFailureRecovery } from "./commitFailureRecovery";
import {
  backfillAcceptedOptionsFromModel,
  getOptionsOnlyDeadlineMs,
  getOptionsRegenSuccessHint,
} from "./optionsRegenUx";
import { parseBackendWaitStage, type PlayWaitUxStage } from "@/features/play/waitUx/waitUxStages";
import type { ChatMessage, ChatRole, ChatStreamPhase } from "@/features/play/stream/types";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";
import type { PlaySemanticWaitingKind } from "@/features/play/components/PlaySemanticWaitingHint";
import { ENDGAME_ONLY_OPTION, ensureMinChars, isEndgameMoment, shouldAllowDoomline } from "@/features/play/endgame/endgame";
import {
  normalizeRegeneratedOptions,
  shouldAutoRegenerateOptionsOnModeSwitch,
  shouldWarnAcquireMismatch,
} from "@/features/play/turnCommit/phaseRegressionGuards";
import { pickTurnOptionsFromResolvedDm } from "@/features/play/turnCommit/pickDecisionOptions";
import { decideModelOptionsDelivery } from "@/features/play/turnCommit/modelOptionsDelivery";
import {
  extractFilteredHintsFromTrace,
  isNarrativeSystemsDebugEnabled,
  pushNarrativeSystemsDebugEvent,
} from "@/lib/debug/narrativeSystemsDebugRing";
import { applyNarrativeFeatureEvent } from "@/features/play/narrativeFeatureTriggers";
import { NarrativeSystemsDebugPanel } from "@/features/play/components/NarrativeSystemsDebugPanel";
import {
  getClientOptionsAutoRegenOnEmptyEnabled,
  getClientOptionsOnlyRegenPathV2Enabled,
  getClientOptionsRegenRepairPassEnabled,
  getClientOptionsRegenSemanticGateEnabled,
  getClientHiddenCombatV1Enabled,
  getClientProfessionChoiceInterruptV1Enabled,
  getClientCombatSummaryV1Enabled,
  getClientConflictFeedbackV1Enabled,
} from "@/lib/rollout/versecraftClientRollout";
import { normalizeConflictOutcome } from "@/features/play/turnCommit/resolveDmTurn";
import { buildConflictFeedbackViewModel } from "@/lib/play/conflictFeedbackPresentation";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import { getHiddenNpcCombatProfile } from "@/lib/combat/npcCombatProfiles";
import {
  buildNpcCombatPowerDisplay,
  dangerTierToPlayerText,
  styleTagsToPlayerHint,
} from "@/lib/combat/combatPresentation";
import { VC_PERF_FLAGS, VC_WAITING } from "@/lib/perf/waitingConfig";
import { createVerseCraftRequestId, VERSECRAFT_REQUEST_ID_HEADER, isSafeVerseCraftRequestId } from "@/lib/telemetry/requestId";
import type { SnapshotMainThreatPhase } from "@/lib/state/snapshot/types";

type ClientTurnMode = "narrative_only" | "decision_required" | "system_transition";

function normalizeMainThreatPhase(raw: unknown): SnapshotMainThreatPhase | undefined {
  return raw === "idle" || raw === "active" || raw === "suppressed" || raw === "breached" ? raw : undefined;
}

/** Max idle time between SSE chunks after the first payload (avoids infinite “正在生成…”). */
const STREAM_CHUNK_STALL_MS = VC_WAITING.playStreamChunkStallMs;
/** Stricter timeout until first non-empty `data:` payload (connection open but no DM bytes). */
const STREAM_FIRST_CHUNK_STALL_MS = VC_WAITING.playStreamFirstChunkStallMs;
/**
 * Max wait for the **first byte / response headers** from our own `/api/chat`.
 * The handler runs moderation + DB + control preflight (≤~11s) before calling upstream; `resilientFetch`
 * may retry several times with `AI_TIMEOUT_MS` (~60s) each — 95s was too low and caused false timeouts.
 */
const FETCH_CHAT_RESPONSE_DEADLINE_MS = VC_WAITING.playFetchChatResponseDeadlineMs;
/** 距底部小于此像素视为「贴底」，流式更新时才自动滚动。 */
const SCROLL_STICKY_BOTTOM_PX = 96;
/**
 * UI-only heuristic for waiting-upstream semantic hints.
 * Must remain conservative and stable; it must not affect server control-plane decisions.
 */
function guessSemanticWaitingKind(action: string): PlaySemanticWaitingKind {
  const t = String(action ?? "").trim();
  if (!t) return "unknown";
  const s = t.replace(/\s+/g, "");
  if (/^(保存|读档|回档|设置|帮助|退出|重开|暂停|继续)$/.test(s) || /(背包|任务|属性|菜单|静音|音量)/.test(s)) {
    return "meta";
  }
  if (/^(我)?使用了道具[:：]/.test(s) || /^(我)?(使用|服用|喝下|喝|吃下|吃|装备|点燃|注射)/.test(s)) {
    return "use_item";
  }
  if (/^(查看|观察|调查|搜索|检查|翻找)/.test(s)) return "investigate";
  if (/^(我)?对.+(说|问|喊|解释|回答|道歉|打招呼)/.test(s) || /^(我)?(询问|请求|交谈|沟通)/.test(s)) {
    return "dialogue";
  }
  if (/(攻击|砍|刺|射击|开火|格挡|闪避|躲开|反击)/.test(s)) return "combat";
  if (/^(我)?(去|前往|走向|进入|回到|返回)/.test(s) || /^(探索|移动到)/.test(s)) return "explore";
  return "unknown";
}

const OPTIONS_REGEN_SYSTEM_PROMPT =
  "你是互动叙事平台的行动选项主笔助手。你必须只输出一个 JSON 对象，且只包含 options 键：" +
  '{"options":["...","...","...","..."]}。' +
  "强制：options 恰好 4 条、简体中文、第一人称、5–20字、互不重复且差异明显；" +
  "必须承接正文之后的当前剧情，生成下一步可执行行动；" +
  "必须避免复用当前与最近选项（含换说法的近似动作），至少 2 条直接锚定最近叙事中的实体或场景；" +
  "禁止灵感手记/背包/任务/仓库/成就/武器栏/游戏指南/属性/菜单等 UI 或资料簿选项，禁止泛化的“使用道具”；" +
  "禁止解释、禁止 markdown、禁止额外字段、禁止推进剧情结论、禁止修改世界状态。";

function PlayContent() {
  const router = useRouter();
  const pathname = usePathname();
  const lastAutoSaveRef = useRef(0);

  const isHydrated = useGameStore((s) => s.isHydrated);

  const rawStats = useGameStore((s) => s.stats) ?? FALLBACK_STATS;
  const stats = useMemo(() => {
    const base = rawStats ?? FALLBACK_STATS;
    const safe: Record<StatType, number> = { ...FALLBACK_STATS };
    for (const key of STAT_ORDER) {
      const v = (base as Record<StatType, number> | undefined)?.[key];
      safe[key] = Number.isFinite(v as number) ? (v as number) : FALLBACK_STATS[key];
    }
    return safe;
  }, [rawStats]);
  const inventory = useGameStore((s) => s.inventory ?? []);
  const talent = useGameStore((s) => s.talent);
  const talentCooldowns = useGameStore((s) => s.talentCooldowns ?? {});
  const logs = useGameStore((s) => s.logs ?? []);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const setStats = useGameStore((s) => s.setStats);
  const rewindTime = useGameStore((s) => s.rewindTime);
  const popLastNLogs = useGameStore((s) => s.popLastNLogs);
  const mergeCodex = useGameStore((s) => s.mergeCodex);
  const currentOptionsFromStore = useGameStore((s) => s.currentOptions ?? []);
  const recentOptions = useGameStore((s) => s.recentOptions ?? []);
  const setCurrentOptions = useGameStore((s) => s.setCurrentOptions);
  const writeResumeShadow = useGameStore((s) => s.writeResumeShadow);
  const inputMode = useGameStore((s) => s.inputMode ?? "options");
  const currentOptions = useMemo(
    () => filterNarrativeActionOptions(currentOptionsFromStore, 4),
    [currentOptionsFromStore]
  );
  const addOriginium = useGameStore((s) => s.addOriginium);
  const tasks = useGameStore((s) => s.tasks ?? []);
  const addTask = useGameStore((s) => s.addTask);
  const updateTaskStatus = useGameStore((s) => s.updateTaskStatus);
  const updateTask = useGameStore((s) => s.updateTask);
  const setPlayerLocation = useGameStore((s) => s.setPlayerLocation);
  const setBgm = useGameStore((s) => s.setBgm);
  const updateNpcLocation = useGameStore((s) => s.updateNpcLocation);
  const applyMainThreatUpdates = useGameStore((s) => s.applyMainThreatUpdates);
  const applyWeaponUpdates = useGameStore((s) => s.applyWeaponUpdates);
  const applyWeaponBagUpdates = useGameStore((s) => s.applyWeaponBagUpdates);
  const intrusionFlashUntil = useGameStore((s) => s.intrusionFlashUntil ?? 0);
  const isGameStarted = useGameStore((s) => s.isGameStarted ?? false);
  const isGuest = useGameStore((s) => s.isGuest ?? false);
  const guestId = useGameStore((s) => s.guestId ?? null);
  const dialogueCount = useGameStore((s) => s.dialogueCount ?? 0);
  const incrementDialogueCount = useGameStore((s) => s.incrementDialogueCount);
  const activeMenu = useGameStore((s) => s.activeMenu);
  const setActiveMenu = useGameStore((s) => s.setActiveMenu);
  const professionState = useGameStore((s) => s.professionState);
  const hasMetProfessionCertifier = useGameStore((s) => s.hasMetProfessionCertifier);
  const markMetProfessionCertifier = useGameStore((s) => s.markMetProfessionCertifier);
  const certifyProfession = useGameStore((s) => s.certifyProfession);
  const pendingClientAction = useGameStore((s) => s.pendingClientAction ?? null);
  const consumeClientAction = useGameStore((s) => s.consumeClientAction);
  const [showIntrusionFlash, setShowIntrusionFlash] = useState(false);

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  /** See `ChatStreamPhase` — drives `isChatBusy` (interaction) vs `isStreamVisualActive` (typewriter strip). */
  const [streamPhase, setStreamPhase] = useState<ChatStreamPhase>("idle");
  const [liveNarrative, setLiveNarrative] = useState("");
  const narrativeRef = useRef("");
  const [showDarkMoonOverlay, setShowDarkMoonOverlay] = useState(false);
  const [showApocalypseOverlay, setShowApocalypseOverlay] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const volume = useGameStore((s) => s.volume ?? 50);
  const [pendingHallucinationCheck, setPendingHallucinationCheck] = useState(false);
  const [hitEffectUntil, setHitEffectUntil] = useState(0);
  const [talentEffectUntil, setTalentEffectUntil] = useState(0);
  const [talentEffectType, setTalentEffectType] = useState<EchoTalent | null>(null);
  const [firstTimeHint, setFirstTimeHint] = useState<string | null>(null);
  const [showDialoguePaywall, setShowDialoguePaywall] = useState(false);
  const [showComplianceHint, setShowComplianceHint] = useState(false);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  /** 开局仅请求 options 时：隐藏流式条，正文由前端静态块展示 */
  const [openingAiBusy, setOpeningAiBusy] = useState(false);
  /** waiting_upstream 阶段的语义化过渡提示：在发起请求时一次性确定，避免渲染过程闪烁/跳变。 */
  const [waitingHintKind, setWaitingHintKind] = useState<PlaySemanticWaitingKind | null>(null);
  const [optionsRegenBusy, setOptionsRegenBusy] = useState(false);
  const [endgameState, setEndgameState] = useState<{ active: boolean; awaitingEnding: boolean }>({
    active: false,
    awaitingEnding: false,
  });
  const endgameTriggeredRef = useRef(false);
  const ENDGAME_SYSTEM_PROMPT =
    '【系统强制干预：终局】当前已是第10日0时。请直接输出本局最终结局，narrative 必须≥600字，风格克制但压迫，收束所有悬念并给出“终焉”的不可逆结论。' +
    '严格输出合法 DM JSON：is_action_legal=true，sanity_damage=0，is_death=false，consumes_time=false，options 只能是 ["迎接终焉"]。' +
    "禁止发放/消耗任何道具、禁止新增/更新任务、禁止修改 player_location、禁止 relationship_updates/codex_updates/npc_location_updates/main_threat_updates/weapon_updates 等写回。";
  /** 单职业认证：当满足触发条件时，用下一次 options 强制让玩家选择职业 */
  const [pendingProfessionChoice, setPendingProfessionChoice] = useState<{
    enabled: boolean;
    options: string[];
    mapping: Record<string, ProfessionId>;
  }>({ enabled: false, options: [], mapping: {} });
  const hasModelChoiceOptions = currentOptions.length === 4;
  const hasVisibleChoiceOptions = hasModelChoiceOptions || pendingProfessionChoice.enabled;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredOpening = useRef(false);
  const hasTriggeredResume = useRef(false);
  const hasShownManualInputComplianceHintRef = useRef(false);
  const hasShownProfessionEligibleHintRef = useRef(false);
  const complianceHintTimerRef = useRef<number | null>(null);
  const userScrolledUpRef = useRef(false);
  /**
   * 冷开场首次进入：默认停在开场白第一段（顶部），不要自动贴底。
   * 一旦玩家做出第一次“继续执笔式”的真实行动（非 system action），解除锁并允许后续自动贴底。
   */
  const openingInitialScrollLockRef = useRef(false);
  const openingInitialScrollLockArmedRef = useRef(false);
  const tailDrainTargetRef = useRef<string | null>(null);
  const parsedPostDrainRef = useRef<{ isDeath: boolean } | null>(null);
  const [tailAlignKey, setTailAlignKey] = useState(0);
  const autoScrollRafRef = useRef<number | null>(null);
  const lastAutoScrollAtRef = useRef(0);
  const streamLogsBaselineRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  // Prevent duplicate /api/chat requests before React finishes re-rendering.
  const sendActionInFlightRef = useRef(false);
  const sendActionRef = useRef<
    (action: string, bypassLengthCheck?: boolean, isResume?: boolean, isSystemAction?: boolean) => Promise<void>
  >(async () => {});
  const streamPhaseRef = useRef<ChatStreamPhase>("idle");
  /** 主链路开场已发起、且首条助手叙事尚未落库；超时降级仅在 `streamPhaseRef` 为 idle 时注入本地开场，避免与 SSE 抢写。 */
  const openingAwaitingAssistantRef = useRef(false);
  const openingStartedAtRef = useRef(0);
  /** 开场首段等待超时后是否已自动重试过一次拉取 options */
  const openingTimeoutRetryRef = useRef(false);
  /** 开局回合：叙事固定为本地文案，不从 SSE 的 narrative 字段增量覆盖 */
  const optionsRegenInFlightRef = useRef(false);
  const modeSwitchByUserRef = useRef(false);
  /** SSE `__VERSECRAFT_STATUS__` 最新阶段（仅展示层） */
  const waitUxBackendStageRef = useRef<PlayWaitUxStage | null>(null);
  const [waitUxStartedAt, setWaitUxStartedAt] = useState<number | null>(null);
  const waitUxSignalsRef = useRef<{
    requestId: string | null;
    requestStartedAt: number | null;
    responseHeadersAt: number | null;
    firstSseDataAt: number | null;
    firstVisibleTextAt: number | null;
    lastSseDataAt: number | null;
    maxInterChunkGapMs: number;
    longGapCount: number;
    sentPerf: boolean;
  }>({
    requestId: null,
    requestStartedAt: null,
    responseHeadersAt: null,
    firstSseDataAt: null,
    firstVisibleTextAt: null,
    lastSseDataAt: null,
    maxInterChunkGapMs: 0,
    longGapCount: 0,
    sentPerf: false,
  });

  useEffect(() => {
    streamPhaseRef.current = streamPhase;
  }, [streamPhase]);

  // Phase-3: 面板快捷行动（插入输入框 / 一键发送），不改变权威裁决链路。
  useEffect(() => {
    if (!pendingClientAction) return;
    const act = consumeClientAction();
    if (!act) return;
    setInput(act.text);
    setInputError("");
    if (act.autoSend) {
      // bypassLengthCheck=true：面板生成的指令应短且结构化，但仍要过 localInputSafetyCheck。
      void sendActionRef.current(act.text, true);
      setInput("");
    }
  }, [consumeClientAction, pendingClientAction]);

  useEffect(() => {
    if (streamPhase === "idle" || streamPhase === "error") {
      setWaitUxStartedAt(null);
      waitUxBackendStageRef.current = null;
    }
  }, [streamPhase]);

  /** True while the live narrative strip / typewriter should run (covers upstream wait + token drain + commit tick). */
  const isStreamVisualActive = isStreamVisualActivePhase(streamPhase);
  const isChatBusy = doesChatPhaseLockInteraction(streamPhase);
  useEffect(() => {
    if (isChatBusy) setOptionsExpanded(false);
  }, [isChatBusy]);
  const optionsRegenPhaseBlocked = useMemo(
    () => doesPhaseBlockOptionsRegen(streamPhase),
    [streamPhase]
  );
  /** 开局嵌入区提示 / 流式抑制：与 `streamPhase` 交叉校验，避免单项状态卡住导致文案悬挂 */
  const openingBusyUi = useMemo(
    () => computeOpeningBusyUi(openingAiBusy, streamPhase),
    [openingAiBusy, streamPhase]
  );

  const hasAssistantMessage = useMemo(
    () => (logs ?? []).some((l) => l && l.role === "assistant"),
    [logs]
  );
  const coldPlayOpening = useMemo(
    () => isColdPlayOpening({ logs, time }),
    [logs, time]
  );
  const showEmbeddedOpening = isHydrated && isGameStarted && coldPlayOpening;
  const openingNarrativePinned = useGameStore((s) => (s as any).openingNarrativePinned ?? false);
  const showPinnedOpeningNarrative = isHydrated && isGameStarted && openingNarrativePinned;
  /** 首屏选项已就绪时仍隐藏「正在生成」：嵌入式开场 + 任意会话忙（含开局 API 飞行中）均不驱动 typewriter 思考态 */
  const suppressEmbeddedOpeningStreamUi = useMemo(() => openingBusyUi, [openingBusyUi]);
  const streamVisualForTypewriter = isStreamVisualActive && !suppressEmbeddedOpeningStreamUi;

  const onTailDrainComplete = useCallback(() => {
    if (streamPhaseRef.current !== "tail_draining") return;
    tailDrainTargetRef.current = null;
    setStreamPhase("idle");
    const sanityAfter = useGameStore.getState().stats?.sanity ?? 0;
    const pending = parsedPostDrainRef.current;
    parsedPostDrainRef.current = null;
    if (pending?.isDeath || sanityAfter <= 0) {
      setTimeout(() => router.push("/settlement"), 2000);
      return;
    }
    // After every turn completes, auto-generate options if fewer than four model actions survived.
    // Use a slightly longer delay (500ms) to allow any in-flight options regen
    // (e.g., opening_fallback triggered during turn commit) to complete first.
    // If that regen succeeded, currentOptions will have exactly four entries and we skip.
    const currentOpts = filterNarrativeActionOptions(useGameStore.getState().currentOptions ?? [], 4);
    if (currentOpts.length < 4 && !endgameState.active && !pendingProfessionChoice.enabled) {
      setTimeout(() => {
        // Re-check after delay — the in-flight regen may have completed.
        const rechecked = filterNarrativeActionOptions(useGameStore.getState().currentOptions ?? [], 4);
        if (rechecked.length < 4 && !optionsRegenInFlightRef.current && !pendingProfessionChoice.enabled) {
          void requestFreshOptions("auto_missing_main");
        }
      }, 500);
    }
  }, [router, endgameState.active, pendingProfessionChoice.enabled]);

  const streamTailDrain = useMemo<SmoothStreamTailDrainConfig | null>(() => {
    if (streamPhase !== "tail_draining") return null;
    return {
      targetRef: tailDrainTargetRef,
      alignKey: tailAlignKey,
      onReached: onTailDrainComplete,
    };
  }, [streamPhase, tailAlignKey, onTailDrainComplete]);

  const day = time.day ?? 0;
  const isDarkMoon = day >= 3 && day < 10;
  const isLowSanity = (stats?.sanity ?? 0) < 20;
  useHeartbeat(isHydrated && isGameStarted, guestId ?? "guest_play", "/play");
  usePresenceHeartbeat({
    enabled: isHydrated && isGameStarted,
    sessionId: guestId ?? "browser_session",
    page: "/play",
    guestId: isGuest ? (guestId ?? "browser_session") : null,
  });
  const hasEnteredGameEventRef = useRef(false);
  const hasFirstEffectiveActionRef = useRef(false);

  const isGuestDialogueExhausted = isGuest && dialogueCount >= 50;
  const endgameLocked = endgameState.active && !endgameState.awaitingEnding;

  const sanity = stats?.sanity ?? 0;
  /** 已移除羊皮纸强制引导，不再阻塞对话 */
  const hasAnyGate = false;
  const gateMessage = "";

  const talentCdLeft = useMemo(() => {
    if (!talent) return 0;
    return safeNumber(talentCooldowns?.[talent], 0);
  }, [talent, talentCooldowns]);
  const eligibleProfessionCount = useMemo(
    () => PROFESSION_IDS.filter((id) => professionState?.eligibilityByProfession?.[id]).length,
    [professionState]
  );

  useEffect(() => {
    if (!isHydrated || !isGameStarted) return;
    if (hasShownProfessionEligibleHintRef.current) return;
    // 单职业 V2：未遇到 1F 认证NPC 前，不提示“可认证”（避免误导）
    if (!hasMetProfessionCertifier) return;
    if (eligibleProfessionCount <= 0) return;
    hasShownProfessionEligibleHintRef.current = true;
    setFirstTimeHint(`你已满足职业认证条件，可在一楼完成认证。`);
  }, [eligibleProfessionCount, hasMetProfessionCertifier, isGameStarted, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !isGameStarted) return;
    if (hasEnteredGameEventRef.current) return;
    hasEnteredGameEventRef.current = true;
    void trackGameplayEvent({
      eventName: "enter_main_game",
      sessionId: guestId ?? "guest_play",
      page: "/play",
      source: "play_page",
      idempotencyKey: `enter_main_game:${guestId ?? "guest"}:${Date.now()}`,
      payload: { isGuest },
    }).catch(() => {});
  }, [guestId, isGameStarted, isGuest, isHydrated]);

  useEffect(() => {
    if (!firstTimeHint) return;
    const t = setTimeout(() => setFirstTimeHint(null), 3000);
    return () => clearTimeout(t);
  }, [firstTimeHint]);

  const triggerComplianceHint = useCallback(() => {
    if (complianceHintTimerRef.current) {
      window.clearTimeout(complianceHintTimerRef.current);
    }
    setShowComplianceHint(true);
    complianceHintTimerRef.current = window.setTimeout(() => {
      setShowComplianceHint(false);
      complianceHintTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (complianceHintTimerRef.current) {
        window.clearTimeout(complianceHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isGuestDialogueExhausted) {
      setShowRegisterPrompt(false);
      return;
    }
    setShowRegisterPrompt(true);
    const timer = window.setTimeout(() => {
      setShowRegisterPrompt(false);
      setShowDialoguePaywall(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [isGuestDialogueExhausted, showDialoguePaywall]);

  useEffect(() => {
    if (!isGameStarted || !inventory.length || logs.length > 0) return;
  }, [isGameStarted, inventory, logs.length]);

  useEffect(() => {
    if (!isHydrated) return;
    // 终局不再自动扣理智/跳结算：仅作为氛围层，在终局态展示。
    if (endgameState.active && !showApocalypseOverlay) setShowApocalypseOverlay(true);
    if (!endgameState.active && showApocalypseOverlay) setShowApocalypseOverlay(false);
  }, [isHydrated, showApocalypseOverlay]);

  useEffect(() => {
    if (streamPhase === "idle") {
      setOpeningAiBusy(false);
      setWaitingHintKind(null);
    }
  }, [streamPhase]);

  useEffect(() => {
    if (!isHydrated || !isGameStarted) return;
    if (!showEmbeddedOpening) return;
    // 仅第一次进入冷开场且尚无助手正文时锁定顶部阅读视角
    if (hasAssistantMessage) return;
    if (openingInitialScrollLockArmedRef.current) return;
    openingInitialScrollLockArmedRef.current = true;
    openingInitialScrollLockRef.current = true;
    userScrolledUpRef.current = true; // 阻止任何 scheduleAutoScrollIfPinned 贴底
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = 0;
    });
  }, [hasAssistantMessage, isGameStarted, isHydrated, showEmbeddedOpening]);

  const scheduleAutoScroll = useCallback((smooth = false) => {
    if (!scrollRef.current) return;
    if (autoScrollRafRef.current != null) return;
    autoScrollRafRef.current = requestAnimationFrame(() => {
      autoScrollRafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const now = performance.now();
      if (!smooth && now - lastAutoScrollAtRef.current < 48) return;
      lastAutoScrollAtRef.current = now;
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

  const scheduleAutoScrollIfPinned = useCallback(
    (smooth = false) => {
      if (openingInitialScrollLockRef.current) return;
      if (userScrolledUpRef.current) return;
      scheduleAutoScroll(smooth);
    },
    [scheduleAutoScroll]
  );

  const smoothStreamOptions = useMemo(() => {
    if (!VC_PERF_FLAGS.clientSmoothStreamV2) {
      return { uniformPacing: true, uniformTickMs: 42 };
    }
    return {
      // Phase-4：放弃“纯匀速打字机”，使用语义分块 + 标点停顿（经收敛）+ backlog catch-up，
      // 目标是更像自然稳定吐字而非机械卡顿。
      uniformPacing: false,
      minTickMs: 18,
      maxTickMs: 110,
      initialBurstWindowMs: 320,
      initialBurstMaxLen: 54,
      steadyMaxLen: 22,
      backlogThreshold: 140,
      backlogMaxLen: 44,
    };
  }, []);

  const { text: smoothNarrative, isComplete: smoothComplete, isThinking: smoothThinking } = useSmoothStreamFromRef(
    narrativeRef,
    streamVisualForTypewriter,
    () => {
      scheduleAutoScrollIfPinned(false);
      const p = waitUxSignalsRef.current;
      if (p.requestStartedAt != null && p.firstVisibleTextAt == null) {
        // Approximate "first visible text" by first typewriter commit callback.
        p.firstVisibleTextAt = performance.now();
      }
    },
    smoothStreamOptions,
    streamTailDrain
  );

  const waitUxSignals = useMemo(() => {
    if (!VC_PERF_FLAGS.clientWaitUxTimelineV2) return undefined;
    return {
      hasResponseHeaders: waitUxSignalsRef.current.responseHeadersAt != null,
      hasAnySseData: waitUxSignalsRef.current.firstSseDataAt != null,
      hasVisibleText: waitUxSignalsRef.current.firstVisibleTextAt != null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPhase, smoothNarrative]);

  const { primaryLine: waitUxPrimaryLine, secondaryLine: waitUxSecondaryLine, displayStage: waitUxDisplayStage } =
    usePlayWaitUx({
    thinking: smoothThinking && streamVisualForTypewriter,
    requestStartedAt: waitUxStartedAt,
    backendStageRef: waitUxBackendStageRef,
    semanticKind: waitingHintKind,
    signals: waitUxSignals,
  });

  // Best-effort client perf event (no behavior changes).
  useEffect(() => {
    const p = waitUxSignalsRef.current;
    if (p.sentPerf) return;
    if (!p.requestId || p.requestStartedAt == null) return;
    // Send when we either saw visible text, or we already exited visual stream (committed/errored).
    if (p.firstVisibleTextAt == null && streamPhase !== "idle" && streamPhase !== "error") return;
    p.sentPerf = true;
    const firstStatusShownMs = 0; // stage is set at request start on client
    const responseHeadersMs =
      p.responseHeadersAt != null ? Math.max(0, p.responseHeadersAt - p.requestStartedAt) : null;
    const firstChunkReceivedMs =
      p.firstSseDataAt != null ? Math.max(0, p.firstSseDataAt - p.requestStartedAt) : null;
    const firstVisibleTextMs =
      p.firstVisibleTextAt != null ? Math.max(0, p.firstVisibleTextAt - p.requestStartedAt) : null;
    const firstPerceivedFeedbackMs = Math.min(
      ...[0, firstChunkReceivedMs ?? Infinity, firstVisibleTextMs ?? Infinity, responseHeadersMs ?? Infinity].filter(
        (x) => Number.isFinite(x)
      )
    );
    void trackGameplayEvent({
      eventName: "chat_client_perf",
      sessionId: guestId ?? "guest_play",
      page: "/play",
      source: "play_page",
      idempotencyKey: `${p.requestId}:chat_client_perf`,
      payload: {
        requestId: p.requestId,
        waitUxDisplayStage: waitUxDisplayStage,
        firstStatusShownMs,
        responseHeadersMs,
        firstChunkReceivedMs,
        firstVisibleTextMs,
        firstPerceivedFeedbackMs,
        maxInterChunkGapMs: p.maxInterChunkGapMs,
        longGapCount: p.longGapCount,
      },
    }).catch(() => {});
  }, [guestId, streamPhase, waitUxDisplayStage]);

  const displayEntries = useMemo(() => {
    const baseLogs = logs ?? [];
    const cutoff = isStreamVisualActive ? streamLogsBaselineRef.current : baseLogs.length;
    return baseLogs
      .map((l, idx) => ({ l, idx }))
      .filter(({ idx }) => idx < cutoff)
      .filter(({ l }) => l && (l.role === "assistant" || l.role === "user") && typeof l.content === "string")
      .map(({ l, idx }) => ({ role: l!.role as "assistant" | "user", content: String(l!.content), logIndex: idx }));
  }, [logs, isStreamVisualActive]);

  // 仅保留助手叙事日志，供绿字提取与最新助手文本推断使用
  const assistantOnlyMessages = useMemo(() => {
    return (logs ?? [])
      .filter((l) => l && l.role === "assistant" && typeof l.content === "string")
      .map((l) => String(l.content));
  }, [logs]);

  const latestAssistantRaw = useMemo(() => {
    if (streamVisualForTypewriter) {
      return typeof smoothNarrative === "string" && smoothNarrative.length > 0
        ? smoothNarrative
        : narrativeRef.current ?? "";
    }
    if (liveNarrative) return liveNarrative;
    if (assistantOnlyMessages.length > 0) return assistantOnlyMessages[assistantOnlyMessages.length - 1] ?? "";
    return "";
  }, [streamVisualForTypewriter, smoothNarrative, liveNarrative, assistantOnlyMessages]);

  const greenTips = useMemo(() => extractGreenTips(latestAssistantRaw), [latestAssistantRaw]);

  const prevIsStreamVisualActiveRef = useRef(false);
  const onScrollContainer = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = gap > SCROLL_STICKY_BOTTOM_PX;
  }, []);

  useEffect(() => {
    if (!scrollRef.current || userScrolledUpRef.current) return;
    if (openingInitialScrollLockRef.current) return;
    if (isStreamVisualActive) scheduleAutoScrollIfPinned(false);
    else if (prevIsStreamVisualActiveRef.current) scheduleAutoScrollIfPinned(true);
    else scheduleAutoScrollIfPinned(false);
    prevIsStreamVisualActiveRef.current = isStreamVisualActive;
  }, [smoothNarrative, isStreamVisualActive, scheduleAutoScrollIfPinned]);

  useLayoutEffect(() => {
    if (userScrolledUpRef.current) return;
    if (openingInitialScrollLockRef.current) return;
    scheduleAutoScrollIfPinned(false);
  }, [displayEntries.length, liveNarrative, scheduleAutoScrollIfPinned]);

  useEffect(() => {
    return () => {
      if (autoScrollRafRef.current != null) {
        cancelAnimationFrame(autoScrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (intrusionFlashUntil <= Date.now()) {
      setShowIntrusionFlash(false);
      return;
    }
    setShowIntrusionFlash(true);
    const t = setTimeout(() => setShowIntrusionFlash(false), intrusionFlashUntil - Date.now());
    return () => clearTimeout(t);
  }, [intrusionFlashUntil]);

  useEffect(() => {
    if (hitEffectUntil <= Date.now()) return;
    const t = setTimeout(() => setHitEffectUntil(0), Math.max(0, hitEffectUntil - Date.now()));
    return () => clearTimeout(t);
  }, [hitEffectUntil]);

  useEffect(() => {
    if (talentEffectUntil <= Date.now()) return;
    const t = setTimeout(() => {
      setTalentEffectUntil(0);
      setTalentEffectType(null);
    }, Math.max(0, talentEffectUntil - Date.now()));
    return () => clearTimeout(t);
  }, [talentEffectUntil]);

  useEffect(() => {
    setAudioMuted(isMuted());
  }, []);

  useEffect(() => {
    setMasterVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!audioMuted) updateSanityFilter(sanity);
  }, [sanity, audioMuted]);

  useEffect(() => {
    if (!audioMuted) setDarkMoonMode(isDarkMoon);
  }, [isDarkMoon, audioMuted]);

  useEffect(() => {
    if (sanity <= 0) {
      setTimeout(() => router.push("/settlement"), 2000);
    }
  }, [sanity, router]);

  useEffect(() => {
    if (!showDarkMoonOverlay) return;
    const t = setTimeout(() => setShowDarkMoonOverlay(false), 3000);
    return () => clearTimeout(t);
  }, [showDarkMoonOverlay]);

  useEffect(() => {
    // 终局态不再通过 overlay 强制结算；结算由玩家点击“迎接终焉”触发。
  }, []);

  useEffect(() => {
    if (!endgameState.active) return;
    // 终局态：强制关闭菜单，避免任何分支交互入口残留
    if (useGameStore.getState().activeMenu !== null) {
      useGameStore.getState().setActiveMenu(null);
    }
  }, [endgameState.active]);

  // 终局触发后：等待当前回合完全结束，再发起一次系统回合请求生成结局文案。
  useEffect(() => {
    if (!endgameState.awaitingEnding) return;
    if (streamPhase !== "idle") return;
    if (sendActionInFlightRef.current) return;
    void sendActionRef.current(ENDGAME_SYSTEM_PROMPT, true, false, true);
  }, [endgameState.awaitingEnding, streamPhase]);

  useEffect(() => {
    if (!isHydrated) return;
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      const confirmLeave = window.confirm(
        "深渊的凝视正在干扰你的认知。连接被切断时，本回合记录可能来不及落地。仍要离开吗？"
      );
      if (confirmLeave) {
        window.location.href = "/";
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || isChatBusy || hasTriggeredOpening.current) return;
    const currentLogs = useGameStore.getState().logs ?? [];
    const turn = currentLogs.length;
    // 仅在还没有任何助手叙事时触发一次主链路开场（单一真相源；本地叙事仅作下方超时降级）
    if (turn > 0) return;
    hasTriggeredOpening.current = true;
    openingAwaitingAssistantRef.current = true;
    openingStartedAtRef.current = Date.now();
    void sendActionRef.current(OPENING_SYSTEM_PROMPT, true, false, true);
  }, [isHydrated, isChatBusy]);

  /** 成功拿到选项后清掉【开局】类提示，避免与正常对局并存 */
  useEffect(() => {
    if (!hasVisibleChoiceOptions && !endgameState.active) return;
    setLiveNarrative((prev) => (typeof prev === "string" && prev.startsWith("【开局】") ? "" : prev));
  }, [endgameState.active, hasVisibleChoiceOptions]);

  // 开场超时：须避免请求仍在飞行时误判；先静默自动重试一次拉 options，仍失败再提示（不重复 push 开场正文）
  useEffect(() => {
    if (!isHydrated) return;
    // Phase-5：开场要么尽快成功，要么尽快进入低成本兜底，避免“等很久→再重试→再补选项”的累加等待。
    const OPENING_STALL_MS = 14_000;
    const tick = window.setInterval(() => {
      if (shouldRecoverStaleSendActionFlight(sendActionInFlightRef.current, streamPhaseRef.current)) {
        sendActionInFlightRef.current = false;
        setOpeningAiBusy(false);
      }
      const logs = useGameStore.getState().logs ?? [];
      if (logs.some((l) => l && l.role === "assistant")) {
        openingAwaitingAssistantRef.current = false;
        openingTimeoutRetryRef.current = false;
        return;
      }
      if (!openingAwaitingAssistantRef.current) return;
      if (sendActionInFlightRef.current) return;
      const phase = streamPhaseRef.current;
      if (
        phase === "waiting_upstream" ||
        phase === "streaming_body" ||
        phase === "turn_committing" ||
        phase === "tail_draining"
      ) {
        return;
      }
      if (Date.now() - openingStartedAtRef.current < OPENING_STALL_MS) return;

      if (!openingTimeoutRetryRef.current) {
        openingTimeoutRetryRef.current = true;
        openingStartedAtRef.current = Date.now();
        if (VC_PERF_FLAGS.clientOpeningFastFallback) {
          // 不再重复触发主链路开场（重链路 + 潜在长等待）。改为走低成本 options-only 补齐。
          openingAwaitingAssistantRef.current = false;
          void requestFreshOptions("opening_fallback");
        } else {
          void sendActionRef.current(OPENING_SYSTEM_PROMPT, true, false, true);
        }
        return;
      }

      openingAwaitingAssistantRef.current = false;
      openingTimeoutRetryRef.current = false;
      // 不再注入本地预置选项池：若上游无法生成 options，应保持为空并引导玩家切换手动输入。
      setCurrentOptions([]);
      setOpeningAiBusy(false);
      setLiveNarrative("【开局】仍无法获取选项，请检查网络或刷新页面；也可切换为手动输入后重试。");
    }, 400);
    return () => clearInterval(tick);
  }, [isHydrated]);

  // 兜底：仅在「冷开场」从存档恢复 options。对局中主笔若本轮未返回 options，内存已清空，
  // 但 saveSlots 可能尚未 autosave，若此处读 slot 会误把上一回合既定选项填回，导致不出现「让主笔给出选项」。
  const hasSeededOpeningOptions = useRef(false);
  useEffect(() => {
    if (!isHydrated || !isGameStarted || isChatBusy) return;
    if (currentOptions.length > 0) return;
    if (!coldPlayOpening) return;
    const state = useGameStore.getState();
    const slot =
      state.saveSlots?.[state.currentSaveSlot] ??
      state.saveSlots?.["main_slot"] ??
      null;
    const savedOptions = Array.isArray(slot?.currentOptions)
      ? filterNarrativeActionOptions(
          slot.currentOptions.filter((x) => typeof x === "string" && x.trim().length > 0),
          4
        )
      : [];
    if (savedOptions.length === 4) {
      setCurrentOptions([...savedOptions]);
      return;
    }
  }, [
    currentOptions.length,
    coldPlayOpening,
    inputMode,
    isChatBusy,
    isGameStarted,
    isHydrated,
    setCurrentOptions,
  ]);

  useEffect(() => {
    if (!isHydrated || isChatBusy) return;
    if (!coldPlayOpening) {
      hasSeededOpeningOptions.current = true;
      return;
    }
    if (hasSeededOpeningOptions.current) return;
    if (inputMode !== "options") return;
    if (currentOptions.length > 0) return;

    hasSeededOpeningOptions.current = true;
    // 更严格：开场白之后的预置四选项只出现一次。
    // 后续回合若没有 options，就保持为空，引导玩家切换到手动输入继续。
    setFirstTimeHint("本回合未生成可用选项，可切换为手动输入继续。");
  }, [coldPlayOpening, currentOptions.length, inputMode, isHydrated, isChatBusy, setCurrentOptions]);

  const prevInputModeRef = useRef<"options" | "text">(inputMode);
  const lastAutoSwitchOptionsRegenAtRef = useRef(0);
  useEffect(() => {
    const prev = prevInputModeRef.current;
    prevInputModeRef.current = inputMode;
    if (!isHydrated) return;
    // 自动触发场景：玩家从 text -> options，且当前没有可用 options，且当前不 busy。
    if (prev === "text" && inputMode === "options") {
      const switchedByUser = modeSwitchByUserRef.current;
      modeSwitchByUserRef.current = false;
      if (!switchedByUser) return;
      if (shouldAutoRegenerateOptionsOnModeSwitch({
        prevMode: prev,
        nextMode: inputMode,
        switchedByUser,
        currentOptionsLength: hasModelChoiceOptions ? currentOptions.length : 0,
        blocksOptionsRegen: optionsRegenPhaseBlocked,
        optionsRegenBusy,
        endgameActive: endgameState.active,
        showEmbeddedOpening,
        isGuestDialogueExhausted,
      }) && lastCommittedTurnModeRef.current === "decision_required") {
        // Phase-5：避免“用户只是切回 options 就被拖进一次额外等待”。
        // 自动补选项应严格限频：30s 内最多触发一次（可回滚开关）。
        if (VC_PERF_FLAGS.clientModeSwitchCooldown) {
          const now = Date.now();
          if (now - lastAutoSwitchOptionsRegenAtRef.current < 30_000) return;
          lastAutoSwitchOptionsRegenAtRef.current = now;
        }
        void requestFreshOptions("auto_switch");
      }
    }
  }, [
    currentOptions.length,
    hasModelChoiceOptions,
    endgameState.active,
    inputMode,
    isGuestDialogueExhausted,
    isHydrated,
    optionsRegenBusy,
    optionsRegenPhaseBlocked,
    showEmbeddedOpening,
  ]);

  useEffect(() => {
    if (
      !isHydrated ||
      !isGameStarted ||
      isChatBusy ||
      hasTriggeredResume.current
    )
      return;
    const logs = useGameStore.getState().logs ?? [];
    if (logs.length === 0) return;
    const last = logs[logs.length - 1];
    if (!last || last.role !== "user") return;
    if (hasTriggeredOpening.current && logs.length === 1) return;
    hasTriggeredResume.current = true;
    void sendActionRef.current(last.content, true, true);
  }, [isHydrated, isGameStarted, isChatBusy]);

  const autoSaveProgress = useCallback(() => {
    if (!isHydrated || !isGameStarted) return;
    const now = Date.now();
    if (now - lastAutoSaveRef.current < 800) return;
    lastAutoSaveRef.current = now;
    useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
  }, [isGameStarted, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !isGameStarted) return;
    const timer = window.setInterval(() => {
      autoSaveProgress();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [autoSaveProgress, isGameStarted, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !isGameStarted) return;
    const handlePageHide = () => {
      autoSaveProgress();
      // 同步 shadow：不依赖异步防抖持久化，确保突然关闭时仍有“继续执笔”兜底。
      writeResumeShadow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        autoSaveProgress();
        writeResumeShadow();
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      autoSaveProgress();
      writeResumeShadow();
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoSaveProgress, isGameStarted, isHydrated, writeResumeShadow]);

  const prevPathnameForAbortRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPathnameForAbortRef.current;
    if (prev !== null && prev === "/play" && pathname !== "/play") {
      streamAbortRef.current?.abort();
      void streamReaderRef.current?.cancel().catch(() => {});
    }
    prevPathnameForAbortRef.current = pathname;
  }, [pathname]);

  const autoMissingOptionsAttemptedRef = useRef(false);
  // 已移除「长叙事自动续写」UI 功能：UI 不再基于 turn_mode 切换分支，
  // 因此只保留 ref 供 requestFreshOptions 读取最近一次的 turn_mode（用于 telemetry/success hint）。
  const lastCommittedTurnModeRef = useRef<ClientTurnMode>("decision_required");

  async function requestFreshOptions(
    trigger: "auto_switch" | "manual_button" | "opening_fallback" | "auto_missing_main",
    seedOptions: string[] = []
  ) {
    // 以前这里仅做 UI 视图切换；现在升级为能力切换：空 options 时发起一次“仅生成选项”请求。
    const manual = trigger === "manual_button";

    if (shouldRecoverStaleSendActionFlight(sendActionInFlightRef.current, streamPhaseRef.current)) {
      sendActionInFlightRef.current = false;
      setOpeningAiBusy(false);
    }

    if (optionsRegenInFlightRef.current) {
      if (manual) setFirstTimeHint("正在整理可选行动，请稍候再试。");
      return;
    }
    const isAutoTrigger = trigger === "auto_missing_main" || trigger === "opening_fallback";
    if (doesPhaseBlockOptionsRegen(streamPhaseRef.current) && !isAutoTrigger) {
      if (manual) setFirstTimeHint("主笔仍在生成本回合内容，请稍后再刷新选项。");
      return;
    }
    if (sendActionInFlightRef.current && !isAutoTrigger) {
      if (manual) setFirstTimeHint("上一回合请求仍在处理中，请稍后再刷新选项。");
      return;
    }
    if (endgameState.active) {
      if (manual) setFirstTimeHint("终局阶段请使用终局选项推进，无法在此刷新。");
      return;
    }
    // Always allow options generation regardless of turn_mode.
    // Players should always have clickable options available after each turn.
    if (isGuestDialogueExhausted) {
      setFirstTimeHint("当前无法生成可用行动，请继续手动输入或稍后重试");
      return;
    }

    optionsRegenInFlightRef.current = true;
    setOptionsRegenBusy(true);
    if (trigger === "opening_fallback") {
      setFirstTimeHint("主笔正在补全首轮可选行动…");
    } else if (trigger === "auto_switch") {
      setFirstTimeHint("主笔正在整理可选行动…");
    } else if (trigger === "auto_missing_main") {
      setFirstTimeHint(seedOptions.length > 0 ? "本回合选项不足，正在补全…" : "本回合没有可选行动，正在补全…");
    } else {
      setFirstTimeHint("主笔正在按当前剧情重新整理可选行动…");
    }
    try {
      const logsNow = useGameStore.getState().logs ?? [];
      const lastAssistant = logsNow
        .slice()
        .reverse()
        .find((l) => l?.role === "assistant")?.content ?? "";
      const lastUser = logsNow
        .slice()
        .reverse()
        .find((l) => l?.role === "user")?.content ?? "";

      const modelSeedOptions = filterNarrativeActionOptions(seedOptions, 4).slice(0, 3);
      const reason =
        trigger === "opening_fallback"
          ? "冷开场首轮未返回 options"
          : trigger === "auto_switch"
            ? "用户切回选项模式且当前无可用项"
            : trigger === "auto_missing_main"
              ? modelSeedOptions.length > 0
                ? `主回合只返回 ${modelSeedOptions.length} 条有效模型选项，需要补齐到 4 条`
                : "主回合 narrative 正常但 options 缺失"
              : "用户手动点击刷新选项按钮";
      const regenCurrentOptions = Array.isArray(currentOptionsFromStore) ? currentOptionsFromStore : [];
      const regenRecentOptions = Array.isArray(recentOptions) ? recentOptions : [];
      const playerContext = useGameStore.getState().getPromptContext();
      const clientState = useGameStore.getState().getStructuredClientStateForServer();
      const inventoryHints = (Array.isArray(inventory) ? inventory : [])
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const name = typeof item.name === "string" ? item.name : "";
          const id = typeof item.id === "string" ? item.id : "";
          return String(name || id).trim();
        })
        .filter((x): x is string => x.length > 0)
        .slice(0, 3);
      const optionsRegenContext = buildClientOptionsRegenContext({
        latestPlayerAction: String(lastUser ?? ""),
        latestNarrativeExcerpt: String(lastAssistant ?? ""),
        currentOptions: regenCurrentOptions,
        recentOptions: regenRecentOptions,
        inventoryHints,
        tasks: tasks
          .filter((t) => t?.status === "active" || t?.status === "available")
          .map((t) => ({ title: t?.title, status: t?.status })),
        repairNeedCount: modelSeedOptions.length > 0 ? 4 - modelSeedOptions.length : undefined,
        repairLockedOptions: modelSeedOptions,
      });
      const reasonCodes = new Set<OptionsRegenReasonCode>();
      const semanticGateEnabled = getClientOptionsRegenSemanticGateEnabled();
      const repairPassEnabled = getClientOptionsRegenRepairPassEnabled();
      const runSemanticQualityGate = (
        candidateOptions: string[],
        extraBlocked: string[] = []
      ): { accepted: string[]; rejectCodes: OptionsRegenReasonCode[] } => {
        if (!semanticGateEnabled) {
          return { accepted: candidateOptions.slice(0, 4), rejectCodes: [] };
        }
        const quality = evaluateOptionsSemanticQuality({
          options: candidateOptions,
          currentOptions: [...regenCurrentOptions, ...extraBlocked],
          recentOptions: regenRecentOptions,
          latestNarrative: optionsRegenContext.latestNarrativeExcerpt,
          playerLocation: clientState?.playerLocation,
        });
        return {
          accepted: backfillAcceptedOptionsFromModel({
            accepted: quality.accepted,
            candidates: candidateOptions,
          }),
          rejectCodes: mapOptionRejectReasonToCodes(quality.rejected.map((r) => r.reason)),
        };
      };

      const useOptionsOnlyPath = getClientOptionsOnlyRegenPathV2Enabled();
      const assistantContextMessages: ChatMessage[] = lastAssistant
        ? [{ role: "assistant", content: lastAssistant }]
        : [];
      const userContextMessages: ChatMessage[] = lastUser
        ? [{ role: "user", content: lastUser }]
        : [];
      // Phase-5：options-only 补齐是“低成本工具”，不允许无上限等待。
      const optionsOnlyDeadlineMs = getOptionsOnlyDeadlineMs(trigger);
      const ac = new AbortController();
      const tid = VC_PERF_FLAGS.clientOptionsOnlyDeadline
        ? window.setTimeout(() => ac.abort(), optionsOnlyDeadlineMs)
        : undefined;
      const parseOptionsFromSsePayload = (
        payloadText: string,
        extraBlocked: string[] = []
      ): { options: string[]; parseFailed: boolean; rejectCodes: OptionsRegenReasonCode[] } => {
        const finalPayload = extractFinalPayloadFromSseDocument(payloadText);
        const dmRaw = finalPayload.found ? finalPayload.payload : foldSseTextToDmRaw(payloadText);
        let rejectCodes: OptionsRegenReasonCode[] = [];
        let parseFailed = false;
        try {
          const directParsed = JSON.parse(dmRaw) as Record<string, unknown>;
          const serverDebugCodes = Array.isArray(directParsed.debug_reason_codes)
            ? directParsed.debug_reason_codes
                .filter((x): x is string => typeof x === "string")
                .filter(
                  (x): x is OptionsRegenReasonCode =>
                    x === "parse_failed" ||
                    x === "duplicated_rejected" ||
                    x === "anchor_miss_rejected" ||
                    x === "generic_rejected" ||
                    x === "homogeneity_rejected" ||
                    x === "repair_pass_used"
                )
            : [];
          const directOpts = (
            Array.isArray(directParsed.decision_options) ? directParsed.decision_options :
            Array.isArray(directParsed.options) ? directParsed.options : []
          ) as unknown[];
          const q = runSemanticQualityGate(
            normalizeRegeneratedOptions(directOpts, regenRecentOptions, regenCurrentOptions),
            extraBlocked
          );
          rejectCodes = [...serverDebugCodes, ...q.rejectCodes];
          if (directOpts.length > 0) {
            return { options: q.accepted, parseFailed: false, rejectCodes };
          }
        } catch {
          parseFailed = true;
        }
        const parsed = tryParseDM(dmRaw) as any;
        const picked = pickTurnOptionsFromResolvedDm(parsed);
        let rawOpts: unknown = picked.options;
        if (!Array.isArray(rawOpts) || rawOpts.length === 0) {
          const loose = extractRegenOptionsFromRaw(dmRaw);
          if (loose && loose.length > 0) rawOpts = loose;
          else parseFailed = true;
        }
        const q = runSemanticQualityGate(
          normalizeRegeneratedOptions(rawOpts, regenRecentOptions, regenCurrentOptions),
          extraBlocked
        );
        return { options: q.accepted, parseFailed, rejectCodes: [...rejectCodes, ...q.rejectCodes] };
      };
      const runOptionsOnlyAttempt = async (
        attemptReason: string,
        attemptContext = optionsRegenContext,
        extraBlocked: string[] = []
      ): Promise<{ options: string[]; parseFailed: boolean; rejectCodes: OptionsRegenReasonCode[] } | null> => {
        const attemptMessages: ChatMessage[] = useOptionsOnlyPath
          ? [
              ...assistantContextMessages,
              ...userContextMessages,
            ]
          : [
              { role: "system", content: OPTIONS_REGEN_SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  `【为何需要整理选项】${attemptReason}`,
                  `【最近玩家动作】${String(lastUser ?? "").slice(0, 260)}`,
                  `【最近叙事片段】${String(lastAssistant ?? "").slice(0, 900)}`,
                ].join("\n"),
              },
            ];
        const attemptRes = await fetch("/api/chat", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: attemptMessages,
            playerContext,
            clientState,
            sessionId: guestId ?? "browser_session",
            openingOptionsOnlyRound: false,
            clientPurpose: "options_regen_only",
            clientReason: `【为何需要整理选项】${attemptReason}`,
            optionsRegenContext: attemptContext,
            clientTurnModeHint: "decision_required",
          }),
          signal: ac.signal,
        });
        if (!attemptRes.ok || !attemptRes.body) return null;
        const reader = attemptRes.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let text = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
        }
        return parseOptionsFromSsePayload(text, extraBlocked);
      };
      const firstPass = await runOptionsOnlyAttempt(reason, optionsRegenContext, []);
      if (tid !== undefined) window.clearTimeout(tid);
      if (firstPass === null) {
        setCurrentOptions([]);
        setFirstTimeHint("当前无法生成可用行动，请继续手动输入或稍后重试");
        return;
      }
      if (firstPass.parseFailed) reasonCodes.add("parse_failed");
      for (const code of firstPass.rejectCodes) reasonCodes.add(code);
      const mergeModelOptions = (...groups: string[][]): string[] =>
        normalizeRegeneratedOptions(groups.flat(), regenRecentOptions, regenCurrentOptions);
      let finalOptions = mergeModelOptions(modelSeedOptions, firstPass.options);

      // 修复：原来的 `shouldTriggerOptionsRepairPass` 只在 0<accepted<4 时触发 repair；
      // 当 firstPass 完全失败（accepted=0）或返回 3 条时，应一视同仁继续请求模型补齐到 4。
      // 这里把 repair/retry 合并成一个“直到 4 条或达到上限”的循环，避免“生成 3 个/生成 0 个”失败静默。
      const MAX_EXTRA_ROUNDS = 2;
      for (let round = 0; round < MAX_EXTRA_ROUNDS && finalOptions.length < 4; round += 1) {
        if (repairPassEnabled) reasonCodes.add("repair_pass_used");
        const missingCount = getRepairMissingCount({ acceptedOptions: finalOptions, targetCount: 4 });
        const repairReason = buildOptionsRepairReason({
          baseReason: reason,
          acceptedOptions: finalOptions,
          missingCount,
        });
        const repairContext = buildClientOptionsRegenContext({
          latestPlayerAction: optionsRegenContext.latestPlayerAction,
          latestNarrativeExcerpt: optionsRegenContext.latestNarrativeExcerpt,
          currentOptions: optionsRegenContext.currentOptions,
          recentOptions: optionsRegenContext.recentOptions,
          inventoryHints,
          tasks: tasks
            .filter((t) => t?.status === "active" || t?.status === "available")
            .map((t) => ({ title: t?.title, status: t?.status })),
          repairNeedCount: missingCount,
          repairLockedOptions: finalOptions,
        });
        const repaired = await runOptionsOnlyAttempt(repairReason, repairContext, finalOptions);
        if (repaired) {
          if (repaired.parseFailed) reasonCodes.add("parse_failed");
          for (const code of repaired.rejectCodes) reasonCodes.add(code);
        }
        if (repaired && Array.isArray(repaired.options) && repaired.options.length > 0) {
          const merged = mergeModelOptions(finalOptions, repaired.options);
          if (merged.length === finalOptions.length) {
            // 本轮没有新贡献，避免无意义再发请求。
            break;
          }
          finalOptions = merged;
        } else {
          // 本轮没有可用返回：停止继续请求，避免反复空转。
          break;
        }
      }

      if (finalOptions.length !== 4) {
        setCurrentOptions([]);
        setFirstTimeHint("当前无法补全可选行动，可切换为手动输入继续，或稍后再试一次。");
        return;
      }
      // 只刷新 currentOptions：不写 user/assistant logs、不增 dialogueCount、不提交世界状态。
      setCurrentOptions(finalOptions);
      if (process.env.NODE_ENV === "development") {
        const debugHint = formatOptionsRegenDebugHint(Array.from(reasonCodes));
        if (debugHint) console.debug("[play][options_regen]", debugHint, { trigger, finalLen: finalOptions.length });
      }
      const successHint = getOptionsRegenSuccessHint({ trigger, turnMode: lastCommittedTurnModeRef.current });
      if (successHint) setFirstTimeHint(successHint);
      setLiveNarrative((prev) =>
        typeof prev === "string" && prev.includes("当前无法生成可用行动") ? "" : prev
      );
    } catch {
      setCurrentOptions([]);
      setFirstTimeHint("当前无法补全可选行动，可切换为手动输入继续，或稍后再试一次。");
    } finally {
      setOptionsRegenBusy(false);
      optionsRegenInFlightRef.current = false;
    }
  }

  async function sendAction(
    action: string,
    bypassLengthCheck?: boolean,
    isResume?: boolean,
    isSystemAction?: boolean
  ) {
    if (isChatBusy || sendActionInFlightRef.current) return;
    const currentState = useGameStore.getState();
    if (currentState.isGuest && (currentState.dialogueCount ?? 0) >= 50) {
      setShowDialoguePaywall(true);
      return;
    }
    const trimmed = action.trim();
    if (!trimmed) return;
    if (!bypassLengthCheck && trimmed.length > MAX_INPUT) return;
    if (!isSystemAction) {
      const localCheck = localInputSafetyCheck(trimmed);
      if (!localCheck.ok) {
        setInputError(localCheck.reason ?? "输入不安全");
        return;
      }
    }

    sendActionInFlightRef.current = true;
    try {
      // 玩家第一次真实行动（非系统开局请求）视为“继续执笔”：解除冷开场顶部锁并允许贴底
      if (!isSystemAction && openingInitialScrollLockRef.current) {
        openingInitialScrollLockRef.current = false;
        userScrolledUpRef.current = false;
        scheduleAutoScroll(true);
      }
    streamLogsBaselineRef.current = (useGameStore.getState().logs ?? []).length;
    setStreamPhase("waiting_upstream");
    waitUxBackendStageRef.current = null;
    {
      const t0 = performance.now();
      setWaitUxStartedAt(t0);
      const rid = createVerseCraftRequestId("chat");
      waitUxSignalsRef.current = {
        requestId: rid,
        requestStartedAt: t0,
        responseHeadersAt: null,
        firstSseDataAt: null,
        firstVisibleTextAt: null,
        lastSseDataAt: null,
        maxInterChunkGapMs: 0,
        longGapCount: 0,
        sentPerf: false,
      };
    }
    // Only compute hint at request start; keep stable during waiting_upstream.
    setWaitingHintKind(guessSemanticWaitingKind(trimmed));
    const isOpeningSystemRequest = Boolean(isSystemAction && trimmed === OPENING_SYSTEM_PROMPT);
    const isEndgameSystemRound = Boolean(isSystemAction && trimmed === ENDGAME_SYSTEM_PROMPT);
    if (isOpeningSystemRequest) {
      setOpeningAiBusy(true);
      setCurrentOptions([]);
    }
    if (isEndgameSystemRound) {
      // 终局回合强制以唯一选项推进
      setCurrentOptions([ENDGAME_ONLY_OPTION]);
    }
    narrativeRef.current = "";
    tailDrainTargetRef.current = null;
    parsedPostDrainRef.current = null;
    setLiveNarrative("");

    const sanityAtStart = useGameStore.getState().stats?.sanity ?? 0;
    const prevPending = pendingHallucinationCheck;
    setPendingHallucinationCheck(false);
    const shouldApplyHallucination = prevPending && sanityAtStart < 20 && Math.random() < 0.3;

    if (!isResume && !isSystemAction) {
      useGameStore.getState().pushLog({ role: "user", content: trimmed });
      if (currentState.isGuest) {
        incrementDialogueCount();
      }
    }

    const history = useGameStore.getState().logs ?? [];
    const baseMessages: ChatMessage[] = history
      .filter((l) => l && (l.role === "user" || l.role === "assistant"))
      .map((l) => ({ role: l.role as ChatRole, content: String(l.content ?? "") }));

    const messages: ChatMessage[] = isResume
      ? baseMessages.map((m, idx) => {
          const isLastUser = idx === baseMessages.length - 1 && m.role === "user";
          return { ...m, content: isLastUser ? trimmed : m.content };
        })
      : isSystemAction
        ? [...baseMessages, { role: "user" as const, content: trimmed }]
        : baseMessages;

    const playerContext = useGameStore.getState().getPromptContext();
    const clientState = useGameStore.getState().getStructuredClientStateForServer();

    const ac = new AbortController();
    streamAbortRef.current = ac;

    let res: Response;
    const fetchDeadlineState = { hit: false };
    let fetchDeadlineTimer: number | undefined;
    try {
      fetchDeadlineTimer = window.setTimeout(() => {
        fetchDeadlineState.hit = true;
        try {
          ac.abort();
        } catch {
          /* ignore */
        }
      }, FETCH_CHAT_RESPONSE_DEADLINE_MS);
      res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          [VERSECRAFT_REQUEST_ID_HEADER]: waitUxSignalsRef.current.requestId ?? createVerseCraftRequestId("chat"),
        },
        body: JSON.stringify({
          messages,
          playerContext,
          clientState,
          sessionId: guestId ?? "browser_session",
          openingOptionsOnlyRound: false,
        }),
        signal: ac.signal,
      });
    } catch (fetchErr) {
      setStreamPhase("idle");
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        if (fetchDeadlineState.hit) {
          setLiveNarrative(
            "等待服务器首包超时：本回合在服务端会依次经过安全审查、数据库与控制预检，再连接大模型（上游失败时还会自动重试，整体可能超过数分钟）。若多次出现，请检查本机 PostgreSQL、网络与 `.env.local` 中的大模型 Key；也可稍后再试。"
          );
        }
        return;
      }
      setLiveNarrative("连接深渊时发生了波动，请稍后再试。");
      return;
    } finally {
      if (fetchDeadlineTimer !== undefined) {
        window.clearTimeout(fetchDeadlineTimer);
      }
      streamAbortRef.current = null;
    }

    const responseContentType = res.headers.get("content-type") ?? "";
    const responseIsSse = responseContentType.includes("text/event-stream");
    {
      const p = waitUxSignalsRef.current;
      if (p.requestStartedAt != null && p.responseHeadersAt == null) {
        p.responseHeadersAt = performance.now();
      }
      const ridHeader = res.headers.get("x-versecraft-request-id");
      if (isSafeVerseCraftRequestId(ridHeader)) {
        p.requestId = ridHeader;
      }
    }

    if (!res.ok) {
      setStreamPhase("idle");
      const errorText = await res.text().catch(() => "");
      // Legacy / misconfigured proxies may return 4xx/5xx while body is still valid SSE + DM JSON.
      if (responseIsSse && errorText) {
        const dmRawFromError = foldSseTextToDmRaw(errorText);
        const degradedDm = tryParseDM(dmRawFromError);
        if (degradedDm && typeof degradedDm.narrative === "string" && degradedDm.narrative.trim().length > 0) {
          const shown = sanitizeDisplayedNarrative(degradedDm.narrative);
          useGameStore.getState().pushLog({
            role: "assistant",
            content: shown.text.slice(0, 50000),
            reasoning: undefined,
          });
          setLiveNarrative("");
          console.warn("[/api/chat] non-OK HTTP but SSE body parsed as DM; showing narrative.", {
            status: res.status,
            aiStatus: res.headers.get("X-VerseCraft-Ai-Status"),
          });
          // Auto-generate options even on degraded 403 responses so players
          // always have clickable actions after narrative appears.
          setTimeout(() => { void requestFreshOptions("auto_missing_main"); }, 300);
          return;
        }
      }
      let parsedError: unknown = null;
      try {
        if (responseContentType.includes("application/json") && errorText) {
          parsedError = JSON.parse(errorText);
        } else if (responseIsSse && errorText) {
          const dmRaw = foldSseTextToDmRaw(errorText);
          const dmParsed = tryParseDM(dmRaw);
          if (dmParsed) parsedError = dmParsed;
        }
      } catch {
        parsedError = null;
      }

      const maybeObj = parsedError as Record<string, unknown> | null;
      const errRec =
        maybeObj && typeof maybeObj === "object" && !Array.isArray(maybeObj) ? maybeObj : null;
      const upstreamStatus = errRec ? Number(errRec["upstreamStatus"] ?? 0) : 0;
      const code = errRec ? String(errRec["code"] ?? "") : "";

      // Print a guaranteed-visible line first (DevTools sometimes shows `{}` for objects).
      const isAuthFailed =
        res.status === 502 &&
        (code === "UPSTREAM_AUTH_FAILED" || upstreamStatus === 401 || upstreamStatus === 403);

      const logLine = `[/api/chat] non-OK status=${res.status} statusText=${res.statusText} contentType=${responseContentType} body=${errorText.slice(0, 800)}`;

      if (isAuthFailed) {
        console.warn(logLine);
      } else {
        console.error(logLine);
      }

      const detail = {
        status: res.status,
        statusText: res.statusText,
        contentType: responseContentType,
        parsedError,
        body: errorText,
      };
      const detailText = (() => {
        try {
          return JSON.stringify(detail, null, 2);
        } catch {
          return String(detail);
        }
      })();
      if (isAuthFailed) {
        console.warn("[/api/chat] non-OK response detail", detailText);
      } else {
        console.error("[/api/chat] non-OK response detail", detailText);
      }

      const msg = res.status === 429 || res.status === 503
        ? "深渊暂时拒绝了你的连接，请稍后再试。"
        : res.status === 403
          ? "深渊拒绝了你。请确认你的身份后再试。"
          : (res.status === 502 && (code === "UPSTREAM_AUTH_FAILED" || upstreamStatus === 401 || upstreamStatus === 403))
            ? "深渊鉴权失败：请检查服务端大模型密钥与环境配置。"
          : res.status === 504
            ? "深渊回应超时（504），请稍后再试。"
          : "连接深渊时发生了波动，请稍后再试。";
      setLiveNarrative(msg);
      return;
    }

    if (!res.body) {
      setStreamPhase("idle");
      setLiveNarrative("连接深渊时发生了波动，请稍后再试。");
      return;
    }

    const reader = res.body.getReader();
    streamReaderRef.current = reader;
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    let raw = "";
    let sseDocumentText = "";
    let sawStreamChunk = false;

    const applySseEvent = (eventText: string) => {
      const statusFrame = extractStatusFrameFromSseEvent(eventText);
      if (statusFrame?.stage) {
        const parsedStage = parseBackendWaitStage(statusFrame.stage);
        if (parsedStage) waitUxBackendStageRef.current = parsedStage;
      }
      const { raw: nextRaw, sawNonEmptyData } = accumulateDmFromSseEvent(eventText, raw);
      raw = nextRaw;
      if (sawNonEmptyData && !sawStreamChunk) {
        sawStreamChunk = true;
        setStreamPhase("streaming_body");
      }
      if (sawNonEmptyData) {
        const p = waitUxSignalsRef.current;
        const now = performance.now();
        if (p.requestStartedAt != null && p.firstSseDataAt == null) {
          p.firstSseDataAt = now;
        }
        if (p.lastSseDataAt != null) {
          const gap = Math.max(0, now - p.lastSseDataAt);
          p.maxInterChunkGapMs = Math.max(p.maxInterChunkGapMs, gap);
          if (gap >= 2500) p.longGapCount += 1;
        }
        p.lastSseDataAt = now;
      }
      try {
        const preview = extractNarrative(raw);
        /**
         * 展示层 fail-closed：
         * - 仅影响屏幕实时预览，不参与状态提交；
         * - 命中协议污染时不展示原文，改为克制的统一提示。
         * - 这层只能兜底“显示”，不能兜底“状态”，禁止前端脑补 DM 结构。
         */
        const shown = sanitizeDisplayedNarrative(preview);
        narrativeRef.current = shown.text;
      } catch {
        narrativeRef.current = "";
      }
      const bgmMatch = raw.match(/"bgm_track"\s*:\s*"(bgm_[^"]+)"/);
      if (bgmMatch && isValidBgmTrack(bgmMatch[1]!)) {
        setBgm(bgmMatch[1]);
      }
    };

    const readNextWithStallGuard = async (stallMs: number) => {
      let timer: number | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("STREAM_STALL_TIMEOUT")), stallMs);
      });
      try {
        const out = await Promise.race([reader.read(), timeoutPromise]);
        if (timer !== undefined) window.clearTimeout(timer);
        return out;
      } catch (e) {
        if (timer !== undefined) window.clearTimeout(timer);
        throw e;
      }
    };

    // 性能分层（首字后感知慢 / 卡住）：
    // - 首个非空 SSE data: 到来前：使用 STREAM_FIRST_CHUNK_STALL_MS 限制“连接已建立但无正文 bytes”的等待上限
    // - 首个 chunk 到来后：使用 STREAM_CHUNK_STALL_MS 限制“上游长停顿”的等待上限
    // 这两者都不等于“真实延迟优化”，它们只是定义“何时判定卡死并收敛体验”。
    let streamCancelled = false;
    try {
      while (true) {
        const stallMs = sawStreamChunk ? STREAM_CHUNK_STALL_MS : STREAM_FIRST_CHUNK_STALL_MS;
        const { value, done } = await readNextWithStallGuard(stallMs);
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        sseDocumentText += chunkText;
        buf += chunkText;
        const { events, rest } = takeCompleteSseEvents(buf);
        buf = rest;
        for (const event of events) {
          applySseEvent(event);
        }
      }
      const tail = takeCompleteSseEvents(buf);
      buf = tail.rest;
      for (const event of tail.events) {
        applySseEvent(event);
      }
      const orphan = normalizeSseNewlines(buf).trim();
      if (orphan.length > 0 && orphan.startsWith("data:")) {
        applySseEvent(orphan);
      }
    } catch (readErr) {
      const err = readErr as Error & { name?: string; message?: string };
      if (err?.message === "STREAM_STALL_TIMEOUT") {
        console.error("[/api/chat] SSE stall timeout (no timely chunks)", readErr);
        setStreamPhase("idle");
        setLiveNarrative("上游长时间无响应，已停止等待。请检查网络或稍后重试。");
        return;
      }
      if (err?.name === "AbortError" || err?.name === "CancelError" || err?.message?.includes("abort")) {
        streamCancelled = true;
      } else {
        // Treat unknown stream read errors as potential safety intercept / broken stream.
        console.error("[/api/chat] stream read error", readErr);
        try {
          useGameStore.getState().triggerSecurityFallback("stream_read_error");
        } catch {
          // ignore
        }
        narrativeRef.current = "";
        setLiveNarrative("{{BLOOD}}禁止输出非法词语！！！{{/BLOOD}}");
        setStreamPhase("idle");
        return;
      }
    } finally {
      streamReaderRef.current = null;
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    }

    if (streamCancelled) {
      setStreamPhase("idle");
      // Could be user abort OR upstream safety cut-off. If we already received a broken JSON fragment, treat as safety intercept.
      const looksLikeJsonFragment = typeof raw === "string" && raw.includes("{") && raw.includes("\"narrative\"");
      const looksTruncated = looksLikeJsonFragment && !raw.trimEnd().endsWith("}");
      if (looksTruncated) {
        try {
          useGameStore.getState().triggerSecurityFallback("stream_aborted_with_truncated_json");
        } catch {
          // ignore
        }
        narrativeRef.current = "";
        setLiveNarrative("{{BLOOD}}禁止输出非法词语！！！{{/BLOOD}}");
      }
      return;
    }

    setStreamPhase("turn_committing");
    let committedNarrativeForRescue: string | null = null;
    try {
    const resolved = resolveTurnFromSse({ sseDocumentText, rawDm: raw });
    if (process.env.NODE_ENV === "development") {
      console.debug("[play][turn_resolve] summary", {
        source: resolved.source,
        failure: resolved.failure,
        finalFound: resolved.debug.finalFound,
        finalPayloadLen: resolved.debug.finalPayloadLen,
        rawLen: resolved.debug.rawLen,
        hasNarrative: Boolean(resolved.narrative && resolved.narrative.trim().length > 0),
        hasDm: Boolean(resolved.dm),
      });
    }
    if (resolved.failure) {
      const kind = resolved.failure;
      const debug = resolved.debug;
      // 分类日志：便于追踪“正文回退/结算丢弃”问题根因
      if (kind === "final_frame_missing") {
        console.warn("[play][turn_resolve] final_frame_missing; falling back to raw DM", debug);
      } else if (kind === "final_payload_invalid") {
        console.warn("[play][turn_resolve] final_payload_invalid; falling back to raw DM", debug);
      } else if (kind === "raw_dm_parse_failed") {
        console.warn("[play][turn_resolve] raw_dm_parse_failed", debug);
      } else if (kind === "protocol_guard_rejected") {
        console.error("[play][turn_resolve] protocol_guard_rejected (fail-closed)", debug);
      }
    }

    const parsed = (resolved.dm ?? null) as any;
    /** 同回合多条「获得类」反馈合并为一条顶栏提示，避免互相覆盖 */
    const acquireHudHints: string[] = [];
    if (!parsed) {
      const salvage = (resolved.narrative ?? "").trim();
      if (!salvage) {
        setStreamPhase("idle");
        // 格式/重复输出等解析失败：不扣理智、不用安全血字（与 stream 安全截断路径区分）
        narrativeRef.current = "";
        setLiveNarrative(
          "本回合剧情数据格式异常，未写入日志与结算。请重试同一行动，或切换到手动输入后再试。"
        );
        return;
      }
      // 仅正文可恢复：先写入 assistant 日志，避免“回合白玩了”；结构化结算跳过，但不影响继续游玩。
      useGameStore.getState().pushLog({
        role: "assistant",
        content: salvage.slice(0, 50000),
        reasoning: undefined,
      });
      setLiveNarrative("");
      setCurrentOptions([]);
      setFirstTimeHint("本回合正文已保存，但部分状态结算未提交（格式异常）。可继续手动输入推进。");
      try {
        useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
        writeResumeShadow();
      } catch (e) {
        console.error("[play][turn_commit_exception] save after narrative-only failed", e);
      }
      parsedPostDrainRef.current = { isDeath: false };
      narrativeRef.current = salvage;
      tailDrainTargetRef.current = salvage;
      setTailAlignKey((n) => n + 1);
      setStreamPhase("tail_draining");
      return;
    }

    if (!parsed.is_action_legal) {
      triggerComplianceHint();
    }
    if (parsed.security_meta?.action && parsed.security_meta.action !== "allow") {
      triggerComplianceHint();
    }

    if (parsed.is_action_legal && !isSystemAction) {
      void trackGameplayEvent({
        eventName: "effective_action",
        sessionId: guestId ?? "guest_play",
        page: "/play",
        source: "play_action",
        payload: {
          actionLength: trimmed.length,
          isResume: !!isResume,
        },
      }).catch(() => {});
      if (!hasFirstEffectiveActionRef.current) {
        hasFirstEffectiveActionRef.current = true;
        void trackGameplayEvent({
          eventName: "first_effective_action",
          sessionId: guestId ?? "guest_play",
          page: "/play",
          source: "play_action",
          idempotencyKey: `first_effective_action:${guestId ?? "guest"}`,
          payload: {
            actionLength: trimmed.length,
          },
        }).catch(() => {});
      }
    }

    const parsedTurnMode: ClientTurnMode =
      parsed.turn_mode === "narrative_only" ||
      parsed.turn_mode === "decision_required" ||
      parsed.turn_mode === "system_transition"
        ? parsed.turn_mode
        : (parsed.decision_required ? "decision_required" : "decision_required");
    lastCommittedTurnModeRef.current = parsedTurnMode;
    // 已移除长叙事自动续写功能：不再读取 parsed.auto_continue_hint；
    // 无论 turn_mode 为何，玩家都通过选项（或手动输入）推进，不再显示“继续推进”按钮。

    const rawNarrative = typeof parsed.narrative === "string" ? parsed.narrative : String(parsed.narrative ?? "");
    let narrativeToPush: string;
    try {
      const prepared = (shouldApplyHallucination ? applyBloodErase(rawNarrative) : rawNarrative).slice(0, 50000);
      const shown = sanitizeDisplayedNarrative(prepared);
      narrativeToPush = shown.text;
    } catch {
      narrativeToPush = sanitizeDisplayedNarrative(rawNarrative.slice(0, 50000)).text;
    }
    useGameStore.getState().pushLog({
      role: "assistant",
      content: narrativeToPush,
      reasoning: undefined,
    });
    committedNarrativeForRescue = narrativeToPush;

    // ---- 可选 combat_summary（读到就收；默认忽略；不影响主链路）----
    try {
      if (getClientCombatSummaryV1Enabled() && parsed && typeof parsed === "object") {
        const raw = (parsed as any).combat_summary;
        let text = "";
        let kind: string | undefined;
        let outcomeTier: string | undefined;
        let npcIds: string[] = [];
        if (typeof raw === "string") {
          text = raw;
        } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const o = raw as any;
          text = typeof o.text === "string" ? o.text : String(o.text ?? "");
          kind = typeof o.kind === "string" ? o.kind : undefined;
          outcomeTier = typeof o.outcomeTier === "string" ? o.outcomeTier : (typeof o.outcome === "string" ? o.outcome : undefined);
          npcIds = Array.isArray(o.npcIds) ? o.npcIds.filter((x: any) => typeof x === "string") : [];
        }
        const safe = String(text ?? "").trim();
        if (safe) {
          const nowHour = (useGameStore.getState().time?.day ?? 0) * 24 + (useGameStore.getState().time?.hour ?? 0);
          const atTurn = useGameStore.getState().dialogueCount ?? 0;
          const locationId =
            typeof (parsed as any).player_location === "string" && String((parsed as any).player_location).trim()
              ? String((parsed as any).player_location).trim()
              : (useGameStore.getState().playerLocation ?? "unknown");
          useGameStore.getState().pushCombatSummaryV1({
            atTurn,
            atHour: nowHour,
            locationId,
            npcIds,
            kind,
            outcomeTier,
            text: safe,
          });
        }
      }
    } catch {
      // ignore: optional field must never break turn commit
    }

    // ---- 冲突回合玩家反馈：conflict_outcome 优先，与 resolveDmTurn / combat_summary 线型一致 ----
    try {
      if (getClientConflictFeedbackV1Enabled() && parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        const raw = p.conflict_outcome ?? p.combat_summary;
        const env = normalizeConflictOutcome(raw);
        const rel = Array.isArray(p.relationship_updates) ? p.relationship_updates.length : 0;
        const sd = p.sanity_damage;
        const sanityDamage =
          typeof sd === "number" && Number.isFinite(sd)
            ? Math.trunc(sd)
            : Math.trunc(Number.parseInt(String(sd ?? "0"), 10)) || 0;
        const vm = buildConflictFeedbackViewModel({
          envelope: env,
          sanityDamage,
          relationUpdateCount: rel,
        });
        useGameStore.getState().setConflictTurnFeedback(vm);
      } else {
        useGameStore.getState().setConflictTurnFeedback(null);
      }
    } catch {
      useGameStore.getState().setConflictTurnFeedback(null);
    }

    setLiveNarrative("");

    // Phase-1 UI hints（轻量）：仅在“回合 commit 成功后”触发。这里先读取，后面按顺序执行。
    const uiHints = (parsed && typeof parsed === "object") ? (parsed as { ui_hints?: any }).ui_hints : undefined;

    const consumedNames = Array.isArray(parsed.consumed_items)
      ? (parsed.consumed_items as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    const hadAnomaly = (parsed.sanity_damage ?? 0) > 0;
    if (!parsed.is_death) {
      setPendingHallucinationCheck((consumedNames.length > 0) || hadAnomaly);
    }

    let awardedItemWriteCount = 0;
    let awardedWarehouseWriteCount = 0;

    if (consumedNames.length > 0) {
      applyNarrativeFeatureEvent(
        { type: "inventory.consume", raw: consumedNames },
        {
          getInventoryItems: () => useGameStore.getState().inventory ?? [],
          consumeInventoryItems: (itemKeys) => useGameStore.getState().consumeItems(itemKeys),
        }
      );
    }

    const inventoryTrigger = applyNarrativeFeatureEvent(
      { type: "inventory.award", raw: parsed.awarded_items, writeLog: true },
      {
        getInventoryItems: () => useGameStore.getState().inventory ?? [],
        addInventoryItems: (items) => useGameStore.getState().addItems(items),
        pushLog: (entry) => useGameStore.getState().pushLog(entry),
      }
    );
    awardedItemWriteCount = inventoryTrigger.counts.inventoryItemsWritten ?? 0;
    if (inventoryTrigger.hints.length > 0) {
      setFirstTimeHint(inventoryTrigger.hints[0] ?? null);
    }

    const warehouseTrigger = applyNarrativeFeatureEvent(
      { type: "warehouse.award", raw: parsed.awarded_warehouse_items },
      {
        getWarehouseItems: () => useGameStore.getState().warehouse ?? [],
        addWarehouseItems: (items) => useGameStore.getState().addWarehouseItems(items),
        pushLog: (entry) => useGameStore.getState().pushLog(entry),
      }
    );
    awardedWarehouseWriteCount = warehouseTrigger.counts.warehouseItemsWritten ?? 0;
    if (warehouseTrigger.hints.length > 0) {
      setFirstTimeHint(warehouseTrigger.hints[0] ?? null);
    }

    // 一致性兜底：叙事有“获得”强语义，但结构化 awarded_* 为空时不能静默通过。
    if (shouldWarnAcquireMismatch({
      narrative: narrativeToPush,
      awardedItemWriteCount,
      awardedWarehouseWriteCount,
    })) {
      console.warn("[play][consistency] narrative suggests acquisition but awarded fields wrote nothing", {
        action: trimmed.slice(0, 120),
        narrativeHead: narrativeToPush.slice(0, 180),
      });
    }

    if (Array.isArray(parsed.codex_updates) && parsed.codex_updates.length > 0) {
      type RawCodexUpdate = {
        id: string;
        name: string;
        type: "npc" | "anomaly";
        known_info?: unknown;
        favorability?: unknown;
        trust?: unknown;
        fear?: unknown;
        debt?: unknown;
        affection?: unknown;
        desire?: unknown;
        romanceEligible?: unknown;
        romanceStage?: unknown;
        betrayalFlags?: unknown;
        combatPower?: unknown;
        combatPowerDisplay?: unknown;
        personality?: unknown;
        traits?: unknown;
        rules_discovered?: unknown;
        weakness?: unknown;
      };
      const entries: CodexEntry[] = (parsed.codex_updates as unknown[]).filter(
        (u): u is RawCodexUpdate =>
          !!u &&
          typeof (u as { id?: unknown }).id === "string" &&
          typeof (u as { name?: unknown }).name === "string" &&
          (((u as { type?: unknown }).type === "npc") || ((u as { type?: unknown }).type === "anomaly"))
      ).map((u): CodexEntry => ({
        id: u.id,
        name: u.name,
        type: u.type,
        known_info: typeof u.known_info === "string" ? u.known_info : undefined,
        favorability: typeof u.favorability === "number" ? u.favorability : undefined,
        trust: typeof u.trust === "number" ? u.trust : undefined,
        fear: typeof u.fear === "number" ? u.fear : undefined,
        debt: typeof u.debt === "number" ? u.debt : undefined,
        affection: typeof u.affection === "number" ? u.affection : undefined,
        desire: typeof u.desire === "number" ? u.desire : undefined,
        romanceEligible: typeof u.romanceEligible === "boolean" ? u.romanceEligible : undefined,
        romanceStage:
          u.romanceStage === "none" || u.romanceStage === "hint" || u.romanceStage === "bonded" || u.romanceStage === "committed"
            ? u.romanceStage
            : undefined,
        betrayalFlags: Array.isArray(u.betrayalFlags)
          ? u.betrayalFlags.filter((x): x is string => typeof x === "string")
          : undefined,
        combatPower: typeof u.combatPower === "number" ? u.combatPower : undefined,
        combatPowerDisplay: typeof u.combatPowerDisplay === "string" ? u.combatPowerDisplay : undefined,
        personality: typeof u.personality === "string" ? u.personality : undefined,
        traits: typeof u.traits === "string" ? u.traits : undefined,
        rules_discovered: typeof u.rules_discovered === "string" ? u.rules_discovered : undefined,
        weakness: typeof u.weakness === "string" ? u.weakness : undefined,
      })).map((e): CodexEntry => {
        if (!getClientHiddenCombatV1Enabled()) return e;
        if (e.type !== "npc") return e;
        if (typeof e.combatPower !== "number") return e;
        if (typeof e.combatPowerDisplay === "string" && e.combatPowerDisplay.trim()) return e;
        const profile = getHiddenNpcCombatProfile({ npcId: e.id, codexEntry: e });
        const dangerText = dangerTierToPlayerText(profile.dangerForPlayer);
        const styleHint = styleTagsToPlayerHint(profile.styleTags);
        return {
          ...e,
          combatPowerDisplay: buildNpcCombatPowerDisplay({ dangerText, styleHint }),
        };
      });
      const prevCodex = useGameStore.getState().codex ?? {};
      mergeCodex(entries);
      const firstNewNpc = entries.find((e) => e.type === "npc" && !(e.id in prevCodex));
      if (firstNewNpc) {
        setFirstTimeHint(`新的角色线索出现了：${firstNewNpc.name}。`);
      } else {
        const firstNewAnomaly = entries.find((e) => e.type === "anomaly" && !(e.id in prevCodex));
        if (firstNewAnomaly) {
          setFirstTimeHint(`新的异常记录已加入：${firstNewAnomaly.name}。`);
        }
      }
    }

    // 兜底：若叙事中提及了已注册的 NPC/诡异，但 DM 未回写 codex_updates，也自动写入图鉴目录。
    try {
      const autoEntries = extractCodexMentionsFromNarrative(narrativeToPush, { maxMatches: 10 });
      if (autoEntries.length > 0) {
        const curCodex = useGameStore.getState().codex ?? {};
        const missing = autoEntries.filter((e) => !(String(e.id) in curCodex));
        if (missing.length > 0) {
          mergeCodex(missing as CodexEntry[]);
        }
      }
    } catch {
      // ignore: capture is best-effort
    }

    const journalTrigger = applyNarrativeFeatureEvent(
      {
        type: "journal.clue_updates",
        raw: (parsed as { clue_updates?: unknown }).clue_updates,
        nowIso: new Date().toISOString(),
      },
      {
        getJournalClues: () => useGameStore.getState().journalClues ?? [],
        mergeJournalClueUpdates: (incoming) => useGameStore.getState().mergeJournalClueUpdates(incoming),
      }
    );
    acquireHudHints.push(...journalTrigger.hints);

    const stateBeforeProfessionTurn = useGameStore.getState();
    const consumedProfessionActive = stateBeforeProfessionTurn.consumeProfessionActiveForTurn();
    const memoryBefore = {
      playerLocation: stateBeforeProfessionTurn.playerLocation ?? "B1_SafeZone",
      activeTaskIds: (stateBeforeProfessionTurn.tasks ?? [])
        .filter((t) => t.status === "active" || t.status === "available")
        .map((t) => t.id)
        .filter((x) => typeof x === "string" && x.trim().length > 0)
        .slice(0, 32),
      presentNpcIds: (() => {
        const loc = stateBeforeProfessionTurn.playerLocation ?? "B1_SafeZone";
        const npcStates = stateBeforeProfessionTurn.dynamicNpcStates ?? {};
        return Object.entries(npcStates)
          .filter(([, v]) => v && typeof v === "object" && (v as any).isAlive && String((v as any).currentLocation ?? "") === loc)
          .map(([id]) => id)
          .slice(0, 32);
      })(),
      mainThreatByFloor: stateBeforeProfessionTurn.mainThreatByFloor ?? {},
    };

    if (Array.isArray((parsed as { relationship_updates?: unknown[] }).relationship_updates)) {
      type RawRelUpdate = {
        npcId?: unknown;
        favorability?: unknown;
        trust?: unknown;
        fear?: unknown;
        debt?: unknown;
        affection?: unknown;
        desire?: unknown;
        romanceEligible?: unknown;
        romanceStage?: unknown;
        betrayalFlagAdd?: unknown;
      };
      let relCodexEntries: CodexEntry[] = ((parsed as { relationship_updates?: unknown[] }).relationship_updates ?? [])
        .filter((x): x is RawRelUpdate => !!x && typeof x === "object" && !Array.isArray(x))
        .map((u) => {
          const npcId = typeof u.npcId === "string" ? u.npcId : "";
          if (!npcId) return null;
          return {
            id: npcId,
            name: npcId,
            type: "npc" as const,
            ...(typeof u.favorability === "number" ? { favorability: u.favorability } : {}),
            ...(typeof u.trust === "number" ? { trust: u.trust } : {}),
            ...(typeof u.fear === "number" ? { fear: u.fear } : {}),
            ...(typeof u.debt === "number" ? { debt: u.debt } : {}),
            ...(typeof u.affection === "number" ? { affection: u.affection } : {}),
            ...(typeof u.desire === "number" ? { desire: u.desire } : {}),
            ...(typeof u.romanceEligible === "boolean" ? { romanceEligible: u.romanceEligible } : {}),
            ...(u.romanceStage === "none" || u.romanceStage === "hint" || u.romanceStage === "bonded" || u.romanceStage === "committed"
              ? { romanceStage: u.romanceStage }
              : {}),
            ...(typeof u.betrayalFlagAdd === "string" ? { betrayalFlags: [u.betrayalFlagAdd] } : {}),
          } as CodexEntry;
        })
        .filter((x): x is CodexEntry => !!x);
      if (consumedProfessionActive === "齐日角") {
        relCodexEntries = relCodexEntries.map((e) =>
          typeof e.favorability === "number"
            ? { ...e, favorability: Math.min(100, e.favorability + 1) }
            : e
        );
      }
      if (relCodexEntries.length > 0) {
        mergeCodex(relCodexEntries);
      }
    }

    let dmg = clampInt(parsed.sanity_damage ?? 0, 0, 9999);
    const threatIsHot = Array.isArray((parsed as { main_threat_updates?: unknown[] }).main_threat_updates)
      && ((parsed as { main_threat_updates?: unknown[] }).main_threat_updates ?? []).some((u) => {
        if (!u || typeof u !== "object" || Array.isArray(u)) return false;
        const phase = (u as { phase?: unknown }).phase;
        return phase === "active" || phase === "suppressed" || phase === "breached";
      });
    if (stateBeforeProfessionTurn.professionState.currentProfession === "守灯人" && threatIsHot && dmg > 0) {
      dmg = Math.max(0, dmg - 1);
    }
    if (consumedProfessionActive === "守灯人" && dmg > 0) {
      dmg = Math.max(0, dmg - 1);
    }
    if (dmg > 0) {
      const cur = useGameStore.getState().stats?.sanity ?? 0;
      useGameStore.getState().setStats({ sanity: Math.max(0, cur - dmg) });
      setHitEffectUntil(Date.now() + 1200);
    }

    const pickedTurnOpts = pickTurnOptionsFromResolvedDm(parsed);
    const validOpts = Array.isArray(pickedTurnOpts.options)
      ? pickedTurnOpts.options
          .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
          .map((o) => sanitizeDisplayedOptionText(o))
          .filter((o) => o.length > 0)
          .slice(0, 4)
      : [];

    const merged = [...validOpts];
    const deliveryDecision = decideModelOptionsDelivery({ options: merged });

    if (isEndgameSystemRound) {
      // 终局：强制唯一选项 + 结局字数兜底（避免模型没达到≥600字）
      const ensured = ensureMinChars(narrativeToPush, 600);
      if (ensured !== narrativeToPush) {
        // 覆盖最新推入日志的内容：追加补段。保持实现克制，不改协议字段。
        useGameStore.getState().popLastNLogs(1);
        useGameStore.getState().pushLog({ role: "assistant", content: ensured, reasoning: undefined });
        narrativeToPush = ensured;
      }
      setCurrentOptions([ENDGAME_ONLY_OPTION]);
      setEndgameState({ active: true, awaitingEnding: false });
      setActiveMenu(null);
    } else if (deliveryDecision.action === "commit") {
      setCurrentOptions(deliveryDecision.options);
      autoMissingOptionsAttemptedRef.current = false;
    } else if (deliveryDecision.action === "repair") {
      setCurrentOptions([]);
      if (!isOpeningSystemRequest && getClientOptionsAutoRegenOnEmptyEnabled() && !autoMissingOptionsAttemptedRef.current) {
        autoMissingOptionsAttemptedRef.current = true;
        setFirstTimeHint("正在为你补全四条可选行动…");
        setTimeout(() => { void requestFreshOptions("auto_missing_main", deliveryDecision.seedOptions); }, 200);
      } else if (isOpeningSystemRequest && getClientOptionsAutoRegenOnEmptyEnabled() && !autoMissingOptionsAttemptedRef.current) {
        autoMissingOptionsAttemptedRef.current = true;
        setFirstTimeHint("正在为你补全首轮可选行动…");
        setTimeout(() => { void requestFreshOptions("opening_fallback", deliveryDecision.seedOptions); }, 200);
      } else {
        setFirstTimeHint("当前选项不足四条，可切换为手动输入继续，或稍后再试一次。");
      }
    } else {
      // 无 options 的策略分流：
      // - 开场首轮请求：始终走 opening_fallback，不与 auto_missing_main 竞争。
      // - decision_required：优先补齐，不要立刻清空到用户眼前；保持旧选项但禁用（optionsRegenBusy）作为过渡。
      // - narrative_only/system_transition：明确说明本回合本就不该有选项。
      if (isOpeningSystemRequest) {
        // 开场首轮：无论 turn_mode 如何，始终走 opening_fallback 补全选项。
        // 使用 opening_fallback 作为唯一的 regen 触发，避免与 auto_missing_main 同时调度导致互锁。
        autoMissingOptionsAttemptedRef.current = true;
        setFirstTimeHint("正在为你生成可选行动…");
        setTimeout(() => { void requestFreshOptions("opening_fallback"); }, 200);
      } else if (parsedTurnMode === "decision_required") {
        if (getClientOptionsAutoRegenOnEmptyEnabled() && !autoMissingOptionsAttemptedRef.current) {
          autoMissingOptionsAttemptedRef.current = true;
          setFirstTimeHint("正在为你生成可选行动…");
          setTimeout(() => { void requestFreshOptions("auto_missing_main"); }, 200);
        }
      } else {
        // narrative_only / system_transition：清空旧选项，自动请求新选项。
        setCurrentOptions([]);
        queueMicrotask(() => {
          const slot = useGameStore.getState().currentSaveSlot;
          useGameStore.getState().saveGame(slot);
          writeResumeShadow();
        });
        autoMissingOptionsAttemptedRef.current = true;
        setFirstTimeHint("正在为你生成可选行动…");
        setTimeout(() => { void requestFreshOptions("auto_missing_main"); }, 200);
      }
    }

    if (process.env.NODE_ENV === "development") {
      const branch = isEndgameSystemRound
        ? "endgame"
        : deliveryDecision.action === "commit"
          ? "merged"
          : deliveryDecision.action === "repair"
            ? "merged_insufficient_regen"
            : "cleared";
      console.debug("[versecraft/play] options commit", {
        branch,
        parsedDecisionOptionsLen: Array.isArray((parsed as any).decision_options) ? (parsed as any).decision_options.length : 0,
        parsedOptionsLen: Array.isArray(parsed.options) ? parsed.options.length : 0,
        pickSource: pickedTurnOpts.meta.source,
        mergedLen: merged.length,
        storeLen: (useGameStore.getState().currentOptions ?? []).length,
      });
    }

    if (typeof parsed.currency_change === "number" && parsed.currency_change !== 0) {
      addOriginium(parsed.currency_change);
    }

    const taskAddTrigger = applyNarrativeFeatureEvent(
      { type: "task.add", raw: parsed.new_tasks },
      {
        getTasks: () => useGameStore.getState().tasks ?? [],
        addTask,
      }
    );
    acquireHudHints.push(...taskAddTrigger.hints);

    if (acquireHudHints.length > 0) {
      setFirstTimeHint(acquireHudHints.join("；"));
    }

    applyNarrativeFeatureEvent(
      { type: "task.update", raw: parsed.task_updates },
      {
        updateTaskStatus,
        updateTask,
      }
    );

    // Phase-3: 任务结果的结构化后果（关系 + 记忆残响）。不依赖 narrative；best-effort。
    try {
      const stateNow = useGameStore.getState();
      const time = stateNow.time ?? { day: 0, hour: 0 };
      const nowHour = (time.day ?? 0) * 24 + (time.hour ?? 0);
      const taskUpdatesRaw = Array.isArray(parsed.task_updates) ? (parsed.task_updates as any[]) : [];
      const { relationshipPatches, memoryCandidates, toastHint } = deriveTaskConsequences({
        beforeTasks: stateBeforeProfessionTurn.tasks ?? [],
        afterTasks: stateNow.tasks ?? [],
        taskUpdates: taskUpdatesRaw
          .filter((x) => x && typeof x === "object" && !Array.isArray(x))
          .map((x) => ({ id: String((x as any).id ?? ""), status: (x as any).status })),
        nowHour,
        playerLocation: stateNow.playerLocation ?? "B1_SafeZone",
      });
      if (relationshipPatches.length > 0) {
        const relCodexEntries: CodexEntry[] = relationshipPatches.map((p) => ({
          id: p.npcId,
          name: p.npcId,
          type: "npc" as const,
          ...(typeof p.favorability === "number" ? { favorability: p.favorability } : {}),
          ...(typeof p.trust === "number" ? { trust: p.trust } : {}),
          ...(typeof p.fear === "number" ? { fear: p.fear } : {}),
          ...(typeof p.debt === "number" ? { debt: p.debt } : {}),
          ...(typeof p.affection === "number" ? { affection: p.affection } : {}),
          ...(typeof p.desire === "number" ? { desire: p.desire } : {}),
          ...(typeof p.romanceEligible === "boolean" ? { romanceEligible: p.romanceEligible } : {}),
          ...(p.romanceStage ? { romanceStage: p.romanceStage } : {}),
          ...(typeof p.betrayalFlagAdd === "string" && p.betrayalFlagAdd.trim().length > 0 ? { betrayalFlags: [p.betrayalFlagAdd] } : {}),
        }));
        mergeCodex(relCodexEntries);
      }
      if (memoryCandidates.length > 0) {
        useGameStore.getState().applyMemoryCandidates(memoryCandidates, nowHour);
      }
      if (toastHint && !endgameState.active) {
        // 轻提示：避免轰炸；仅当服务端未提供 toast_hint 时补一次。
        if (!(typeof uiHints?.toast_hint === "string" && uiHints.toast_hint.trim().length > 0)) {
          setFirstTimeHint(toastHint);
        }
      }
    } catch {
      // ignore
    }

    // 服务端 UI 提示：仅轻量 toast，不打开侧栏或可点击管理面板
    try {
      const toastHint = typeof uiHints?.toast_hint === "string" ? uiHints.toast_hint.trim() : "";
      const guideHint = applyNarrativeFeatureEvent({ type: "guide.hint", raw: uiHints }, {}).hints[0] ?? "";
      const taskPanelHint = applyNarrativeFeatureEvent({ type: "task.panel_hint", raw: uiHints }, {}).hints[0] ?? "";
      if (toastHint) {
        setFirstTimeHint(toastHint);
      } else if (guideHint) {
        setFirstTimeHint(guideHint);
      } else if (!endgameState.active) {
        if (taskPanelHint) setFirstTimeHint(taskPanelHint);
      }
    } catch {
      // ignore: hints are best-effort
    }

    // wire name `player_location` -> store 内部语义 `playerLocation`
    if (typeof parsed.player_location === "string" && parsed.player_location.length > 0) {
      setPlayerLocation(parsed.player_location);
    }

    if (typeof parsed.bgm_track === "string" && isValidBgmTrack(parsed.bgm_track)) {
      setBgm(parsed.bgm_track);
    }

    // Recompute profession eligibility and issue short certification trials when gates are met.
    useGameStore.getState().refreshProfessionState();

    // ---- 单职业认证触发（N-010 认证NPC + 1F + 好感>=0 + 任一属性>20 + 当前无职业）----
    // 设计：不解析叙事文本；仅依赖结构化回写（codex/relationship/npc_location_updates）做“遇到”近似。
    {
      const currentLoc =
        typeof parsed.player_location === "string" && parsed.player_location.trim().length > 0
          ? parsed.player_location.trim()
          : (useGameStore.getState().playerLocation ?? "B1_SafeZone");
      const in1F = currentLoc.startsWith("1F_");

      // 本回合“出现过的NPC”集合：复用下方外貌去重的 ids 收集逻辑，但这里保持独立避免顺序耦合。
      const seenNpcIds = new Set<string>();
      if (Array.isArray(parsed.codex_updates)) {
        for (const u of parsed.codex_updates as unknown[]) {
          if (!u || typeof u !== "object" || Array.isArray(u)) continue;
          if ((u as { type?: unknown }).type !== "npc") continue;
          const id = (u as { id?: unknown }).id;
          if (typeof id === "string" && id.trim()) seenNpcIds.add(id.trim());
        }
      }
      if (Array.isArray((parsed as { relationship_updates?: unknown[] }).relationship_updates)) {
        for (const u of ((parsed as { relationship_updates?: unknown[] }).relationship_updates ?? [])) {
          if (!u || typeof u !== "object" || Array.isArray(u)) continue;
          const id = (u as { npcId?: unknown }).npcId;
          if (typeof id === "string" && id.trim()) seenNpcIds.add(id.trim());
        }
      }
      if (Array.isArray(parsed.npc_location_updates)) {
        for (const u of parsed.npc_location_updates) {
          if (!u || typeof u !== "object" || Array.isArray(u)) continue;
          const id = (u as { id?: unknown }).id;
          if (typeof id === "string" && id.trim()) seenNpcIds.add(id.trim());
        }
      }

      // 遇到认证NPC：只在 1F 触发（避免其它楼层的误判）
      if (in1F && (seenNpcIds.has("N-010") || useGameStore.getState().dynamicNpcStates?.["N-010"]?.currentLocation?.startsWith("1F_"))) {
        if (!useGameStore.getState().hasMetProfessionCertifier) markMetProfessionCertifier();
      }

      const stateNow = useGameStore.getState();
      const alreadyHasProfession = Boolean(stateNow.professionState?.currentProfession);
      const metNpc = Boolean(stateNow.hasMetProfessionCertifier);
      const favor =
        typeof stateNow.codex?.["N-010"]?.favorability === "number"
          ? (stateNow.codex["N-010"]!.favorability as number)
          : 0;
      const favorOk = favor >= 0;

      const statsNow = stateNow.stats ?? FALLBACK_STATS;
      const anyStatOver20 =
        (statsNow.sanity ?? 0) > 20 ||
        (statsNow.agility ?? 0) > 20 ||
        (statsNow.luck ?? 0) > 20 ||
        (statsNow.charm ?? 0) > 20 ||
        (statsNow.background ?? 0) > 20;

      if (!alreadyHasProfession && in1F && metNpc && favorOk && anyStatOver20) {
        // 可选职业：以 `professionState.eligibilityByProfession` 为准（stat + 行为证据 + 试炼任务），
        // 避免“前端提示可认证，但 engine 实际不可认证”的矛盾。
        const eligible: ProfessionId[] = PROFESSION_IDS.filter(
          (id) => Boolean(stateNow.professionState?.eligibilityByProfession?.[id])
        );
        if (eligible.length > 0) {
          const optionTextById: Record<ProfessionId, string> = {
            守灯人: "认证职业：守灯人",
            巡迹客: "认证职业：巡迹客",
            觅兆者: "认证职业：觅兆者",
            齐日角: "认证职业：齐日角",
            溯源师: "认证职业：溯源师",
          };
          const opts = eligible.map((id) => optionTextById[id]);
          const mapping = Object.fromEntries(eligible.map((id) => [optionTextById[id], id])) as Record<string, ProfessionId>;
          // 默认不打断主叙事 options：只提示并高亮设置入口，让玩家自行决定是否在“设置→职业”里完成认证。
          // 若灰度开启“打断式认证”，才覆盖 options（旧行为）。
          if (getClientProfessionChoiceInterruptV1Enabled()) {
            setPendingProfessionChoice({ enabled: true, options: opts.slice(0, 5), mapping });
            if (useGameStore.getState().inputMode !== "options") useGameStore.getState().toggleInputMode();
            setCurrentOptions([...opts.slice(0, 4)]);
            setFirstTimeHint("你已满足职业认证条件，请选择你的职业。");
          } else {
            setPendingProfessionChoice({ enabled: false, options: [], mapping: {} });
            setFirstTimeHint("你已满足职业认证条件：可在【设置→职业】中完成认证（不必打断本回合推进）。");
          }
        }
      }
    }

    // wire name `npc_location_updates[].to_location` -> store 内部语义 `currentLocation`
    if (Array.isArray(parsed.npc_location_updates) && parsed.npc_location_updates.length > 0) {
      for (const u of parsed.npc_location_updates) {
        if (u && typeof u.id === "string" && typeof u.to_location === "string") {
          updateNpcLocation(u.id, u.to_location);
        }
      }
    }

    // 场景内首次出场外貌描写去重：用结构化回写的 npcId 粗略判定“本回合出现过的 NPC”
    {
      const ids: string[] = [];
      if (Array.isArray(parsed.codex_updates)) {
        for (const u of parsed.codex_updates as unknown[]) {
          if (!u || typeof u !== "object" || Array.isArray(u)) continue;
          const type = (u as { type?: unknown }).type;
          const id = (u as { id?: unknown }).id;
          if (type === "npc" && typeof id === "string" && id.trim()) ids.push(id.trim());
        }
      }
      if (Array.isArray((parsed as { relationship_updates?: unknown[] }).relationship_updates)) {
        for (const u of ((parsed as { relationship_updates?: unknown[] }).relationship_updates ?? [])) {
          if (!u || typeof u !== "object" || Array.isArray(u)) continue;
          const id = (u as { npcId?: unknown }).npcId;
          if (typeof id === "string" && id.trim()) ids.push(id.trim());
        }
      }
      if (Array.isArray(parsed.npc_location_updates)) {
        for (const u of parsed.npc_location_updates as unknown[]) {
          if (!u || typeof u !== "object" || Array.isArray(u)) continue;
          const id = (u as { id?: unknown }).id;
          if (typeof id === "string" && id.trim()) ids.push(id.trim());
        }
      }
      const loc =
        typeof parsed.player_location === "string" && parsed.player_location.trim().length > 0
          ? parsed.player_location.trim()
          : (useGameStore.getState().playerLocation ?? "B1_SafeZone");
      if (ids.length > 0) {
        useGameStore.getState().markSceneNpcAppearanceWritten(loc, ids);
      }
    }

    if (Array.isArray((parsed as { main_threat_updates?: unknown[] }).main_threat_updates)) {
      const updates = ((parsed as { main_threat_updates?: unknown[] }).main_threat_updates ?? [])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
        .map((u) => ({
          floorId: typeof u.floorId === "string" ? u.floorId : undefined,
          threatId: typeof u.threatId === "string" ? u.threatId : undefined,
          phase: normalizeMainThreatPhase(u.phase),
          suppressionProgress:
            typeof u.suppressionProgress === "number" && Number.isFinite(u.suppressionProgress)
              ? u.suppressionProgress
              : undefined,
          lastResolvedAtHour:
            typeof u.lastResolvedAtHour === "number" && Number.isFinite(u.lastResolvedAtHour)
              ? u.lastResolvedAtHour
              : undefined,
          counterHintsUsed: Array.isArray(u.counterHintsUsed)
            ? u.counterHintsUsed.filter((x): x is string => typeof x === "string")
            : undefined,
        }));
      if (
        consumedProfessionActive === "觅兆者" &&
        updates.length > 0 &&
        !updates.some((u) => Array.isArray(u.counterHintsUsed) && u.counterHintsUsed.length > 0)
      ) {
        updates[0] = {
          ...updates[0],
          counterHintsUsed: ["profession.omenseeker.focus_hint"],
        };
      }
      if (updates.length > 0) applyMainThreatUpdates(updates);
    }

    applyNarrativeFeatureEvent(
      { type: "weapon.update", raw: (parsed as { weapon_updates?: unknown[] }).weapon_updates },
      { applyWeaponUpdates }
    );

    applyNarrativeFeatureEvent(
      { type: "weapon_bag.update", raw: (parsed as { weapon_bag_updates?: unknown[] }).weapon_bag_updates },
      { applyWeaponBagUpdates }
    );

    if (consumedProfessionActive === "溯源师" && Array.isArray(parsed.codex_updates)) {
      const traced = (parsed.codex_updates as unknown[])
        .filter((x): x is CodexEntry => !!x && typeof x === "object" && !Array.isArray(x))
        .map((x) =>
          x.type === "anomaly" && !x.rules_discovered
            ? { ...x, rules_discovered: "溯源注记：该线索可继续拼接为真相链。" }
            : x
        );
      if (traced.length > 0) mergeCodex(traced);
    }

    const isItemUse = trimmed.startsWith("我使用了道具：");
    const movedThisTurn =
      typeof parsed.player_location === "string" &&
      parsed.player_location.length > 0 &&
      parsed.player_location !== stateBeforeProfessionTurn.playerLocation;
    const quickStepNoTime =
      consumedProfessionActive === "巡迹客" &&
      parsed.is_action_legal &&
      movedThisTurn;
    const shouldAdvanceTime = parsed.consumes_time !== false && !isItemUse && !quickStepNoTime;

    if (parsed.is_action_legal && !parsed.is_death && shouldAdvanceTime) {
      const prevTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      useGameStore.getState().applyGameTimeFromResolvedTurn({
        consumes_time: parsed.consumes_time !== false,
        time_cost:
          typeof (parsed as { time_cost?: unknown }).time_cost === "string"
            ? (parsed as { time_cost: string }).time_cost
            : undefined,
      });
      const nextTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      if (prevTime.day < 3 && nextTime.day === 3 && nextTime.hour === 0) {
        setShowDarkMoonOverlay(true);
      }
      if (nextTime.day >= 10) {
        // 终局以“第10日0时”作为强制结局点；不在这里做扣理智/跳结算。
        const escapeStage = (() => {
          try {
            return (useGameStore.getState() as any).escapeMainline?.stage ?? null;
          } catch {
            return null;
          }
        })();
        if (isEndgameMoment(nextTime) && !endgameTriggeredRef.current && shouldAllowDoomline({ escapeStage })) {
          endgameTriggeredRef.current = true;
          setEndgameState({ active: true, awaitingEnding: true });
          // 强制下一步只能推进终局：切到 options + 唯一占位选项（结局生成后会再覆盖为唯一选项）
          if (useGameStore.getState().inputMode !== "options") useGameStore.getState().toggleInputMode();
          setCurrentOptions([ENDGAME_ONLY_OPTION]);
          setFirstTimeHint("十日已至。你只能迎接终焉。");
        }
      }
    }

    // Phase-2: 世界记忆脊柱写入（必须在真实状态写入完成后，再根据结构化回写生成记忆）
    try {
      useGameStore.getState().appendResolvedTurnMemories({
        resolvedTurn: parsed,
        before: memoryBefore,
      });
    } catch (e) {
      console.warn("[play][memorySpine] append failed", e);
    }

    // Phase-4: 剧情导演层与突发事件队列推进（必须在真实状态写入完成后）
    try {
      useGameStore.getState().postTurnStoryDirectorUpdate({
        resolvedTurn: parsed,
        preTurnIndex: (stateBeforeProfessionTurn.logs ?? []).length,
        pre: {
          playerLocation: stateBeforeProfessionTurn.playerLocation ?? "B1_SafeZone",
          tasks: (stateBeforeProfessionTurn.tasks ?? []) as any,
          mainThreatByFloor: (stateBeforeProfessionTurn.mainThreatByFloor ?? {}) as any,
          memoryEntries: (stateBeforeProfessionTurn.memorySpine?.entries ?? []) as any,
        },
      });
    } catch (e) {
      console.warn("[play][storyDirector] postTurn update failed", e);
    }

    // Phase-5: 出口主线推进（必须在真实状态写入完成后）
    try {
      useGameStore.getState().advanceEscapeMainlineFromResolvedTurn({
        resolvedTurn: parsed,
        nowTurnOverride: (stateBeforeProfessionTurn.logs ?? []).length + 1,
      });
    } catch (e) {
      console.warn("[play][escapeMainline] advance failed", e);
    }

    if (isNarrativeSystemsDebugEnabled()) {
      const sm = parsed.security_meta as Record<string, unknown> | undefined;
      const traceRaw = sm?.change_set_trace;
      const trace = Array.isArray(traceRaw)
        ? traceRaw.filter((x): x is string => typeof x === "string")
        : [];
      const st = useGameStore.getState();
      pushNarrativeSystemsDebugEvent({
        kind: "turn_commit",
        at: Date.now(),
        changeSetApplied: sm?.change_set_applied === true,
        changeSetTrace: trace.slice(0, 48),
        filteredHints: extractFilteredHintsFromTrace(trace),
        clueUpdatesInTurn: Array.isArray(parsed.clue_updates) ? parsed.clue_updates.length : 0,
        newTasksInTurn: Array.isArray(parsed.new_tasks) ? parsed.new_tasks.length : 0,
        taskUpdatesInTurn: Array.isArray(parsed.task_updates) ? parsed.task_updates.length : 0,
        awardedItemsInTurn: Array.isArray(parsed.awarded_items) ? parsed.awarded_items.length : 0,
        awardedWarehouseInTurn: Array.isArray(parsed.awarded_warehouse_items)
          ? parsed.awarded_warehouse_items.length
          : 0,
        journalClueTotal: (st.journalClues ?? []).length,
        taskTotal: (st.tasks ?? []).length,
        inventoryCount: (st.inventory ?? []).length,
        warehouseCount: (st.warehouse ?? []).length,
      });
    }

    // 统一强制保存：只要本回合 DM JSON 成功解析且状态 commit 完成，就必须保存一次。
    // 这能覆盖“手动输入且无 options”的场景，避免首页“继续执笔”失真。
    useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
    // 双层恢复：正式存档之外，同步写入 shadow，避免浏览器突发退出时仅依赖 IDB 防抖刷盘。
    writeResumeShadow();

    parsedPostDrainRef.current = { isDeath: !!parsed.is_death };
    narrativeRef.current = narrativeToPush;
    tailDrainTargetRef.current = narrativeToPush;
    setTailAlignKey((n) => n + 1);
    setStreamPhase("tail_draining");
    } catch (commitErr: unknown) {
      console.error("[play][turn_commit_exception] turn commit failed", commitErr);
      tailDrainTargetRef.current = null;
      parsedPostDrainRef.current = null;
      const rec = getCommitFailureRecovery({ committedNarrativeForRescue });
      if (rec.kind === "narrative_rescued") {
        // 正文已写入日志时，结算失败不应“回退正文”。
        setLiveNarrative("");
        setCurrentOptions([]);
        setFirstTimeHint(rec.hint);
        narrativeRef.current = rec.narrative;
        tailDrainTargetRef.current = rec.narrative;
        setTailAlignKey((n) => n + 1);
        setStreamPhase("tail_draining");
      } else {
        setStreamPhase("idle");
        narrativeRef.current = "";
        setLiveNarrative(rec.liveNarrative);
      }
    }
    } finally {
      sendActionInFlightRef.current = false;
      setOpeningAiBusy(false);
    }
  }

  sendActionRef.current = sendAction;

  function onSubmit() {
    const trimmed = input.trim();
    if (trimmed.length > MAX_INPUT) {
      setInputError("输入不可超过20个字符");
      return;
    }
    setInputError("");
    if (isGuestDialogueExhausted) {
      setShowDialoguePaywall(true);
      return;
    }
    void sendAction(input);
    setInput("");
  }

  function noteManualTextIntent() {
    if (hasShownManualInputComplianceHintRef.current) return;
    hasShownManualInputComplianceHintRef.current = true;
    triggerComplianceHint();
  }

  function onPickOption(option: string) {
    setOptionsExpanded(false);
    if (endgameState.active) {
      if (!endgameLocked) return;
      if (option === ENDGAME_ONLY_OPTION) {
        router.push("/settlement");
      }
      return;
    }
    if (isGuestDialogueExhausted) {
      setShowDialoguePaywall(true);
      return;
    }
    playUIClick();
    if (pendingProfessionChoice.enabled && pendingProfessionChoice.mapping[option]) {
      const chosen = pendingProfessionChoice.mapping[option]!;
      const ok = certifyProfession(chosen);
      setPendingProfessionChoice({ enabled: false, options: [], mapping: {} });
      if (!ok) {
        setFirstTimeHint("职业认证失败：当前条件不足或已拥有职业。");
        return;
      }
      void sendAction(`我选择认证职业：【${chosen}】`, true);
      return;
    }
    void sendAction(option, true);
  }

  const TALENT_EFFECT_DURATION = 1400;

  function triggerTalentEffect(t: EchoTalent) {
    setTalentEffectType(t);
    setTalentEffectUntil(Date.now() + TALENT_EFFECT_DURATION);
  }

  function onUseTalent() {
    if (!talent) return;
    if (talentCdLeft > 0) return;
    const ok = useGameStore.getState().useTalent(talent);
    if (!ok) return;

    triggerTalentEffect(talent);

    switch (talent) {
      case "时间回溯": {
        rewindTime();
        popLastNLogs(2);
        break;
      }
      case "命运馈赠": {
        void sendAction(
          '【系统强制干预：玩家发动了"命运馈赠"天赋。请在叙事中安排玩家随机抢夺世界里的一个道具（从道具/物品表中选一，须有 ownerId 主人）。叙事需顺理成章，并用红色加粗标出该道具。重要：该道具均有主人；若玩家之后在主人面前使用或展示该道具，主人会察觉是玩家抢夺的，并据此产生敌意或报复。】',
          true
        );
        break;
      }
      case "主角光环": {
        void sendAction(
          '【系统强制干预：玩家发动了"主角光环"。请注意，接下来的3小时（回合）内玩家绝对免疫死亡，且本回合你必须为玩家触发1次必定幸运的正向事件！】',
          true
        );
        break;
      }
      case "生命汇源": {
        const cur = useGameStore.getState().stats?.sanity ?? 0;
        const hist = useGameStore.getState().historicalMaxSanity ?? 50;
        const recover = Math.min(20, hist - cur);
        setStats({ sanity: cur + recover });
        break;
      }
      case "洞察之眼": {
        void sendAction(
          '【系统强制干预：玩家发动了"洞察之眼"。请在接下来的叙事中，明确且直白地用红色加粗字体，为玩家标记出一个必定收益的选择或逃生路线。】',
          true
        );
        break;
      }
      case "丧钟回响": {
        void sendAction(
          '【系统强制干预：玩家发动了"丧钟回响"。请在叙事中安排一种极度诡异的死法，强制处决当前场景中的一名恶意NPC或诡异（若存在）。注意：N-011 夜读老人与 A-008 深渊守门人免疫丧钟回响，不可被选为目标。】',
          true
        );
        break;
      }
    }
  }

  function onSaveAndExit() {
    useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
    writeResumeShadow();
    setShowExitModal(false);
    router.push("/");
  }

  function onAbandonAndDie() {
    setStats({ sanity: 0 });
    setShowExitModal(false);
    router.push("/settlement");
  }

  return (
    <MobileReadingShell hitEffectActive={hitEffectUntil > Date.now()}>
      <PlayAmbientOverlays
        showDarkMoonOverlay={showDarkMoonOverlay}
        showApocalypseOverlay={showApocalypseOverlay}
        showIntrusionFlash={showIntrusionFlash}
        hitEffectActive={hitEffectUntil > Date.now()}
        talentEffectType={talentEffectType}
      />

        <PlayBlockingModals
          showDialoguePaywall={showDialoguePaywall}
          showRegisterPrompt={showRegisterPrompt}
          onPaywallRegister={() => router.push("/")}
          showExitModal={showExitModal}
          onDismissExitModal={() => setShowExitModal(false)}
          onSaveAndExit={onSaveAndExit}
          onAbandonAndDie={onAbandonAndDie}
        />

        <MobileReadingHeader
          audioMuted={audioMuted}
          onToggleAudio={() => {
            toggleMute();
            setAudioMuted(isMuted());
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
            <MobileStoryViewport>

              {/*
                选项区：MobileOptionsDropdown 渲染四条槽位（zustand currentOptions）；
                冷开场首轮 options 来自主笔；缺失时 requestFreshOptions("opening_fallback"|"manual_button") 走 options_regen_only。
              */}
              <PlayStoryScroll
                scrollRef={scrollRef}
                onScrollContainer={onScrollContainer}
                displayEntries={displayEntries}
                isStreamVisualActive={isStreamVisualActive}
                suppressStreamVisual={suppressEmbeddedOpeningStreamUi}
                smoothThinking={smoothThinking}
                smoothNarrative={smoothNarrative}
                smoothComplete={smoothComplete}
                isChatBusy={isChatBusy}
                inputMode={inputMode}
                isLowSanity={isLowSanity}
                isDarkMoon={isDarkMoon}
                liveNarrative={liveNarrative}
                greenTips={greenTips}
                firstTimeHint={firstTimeHint}
                plainOnlyNewTurn={false}
                plainOnlyLogIndexMin={streamLogsBaselineRef.current}
                embeddedOpeningContent={showPinnedOpeningNarrative ? FIXED_OPENING_NARRATIVE : null}
                openingAiBusy={openingBusyUi}
                semanticWaitingKind={streamPhase === "waiting_upstream" ? waitingHintKind : null}
                waitUxPrimaryLine={waitUxPrimaryLine}
                waitUxSecondaryLine={waitUxSecondaryLine}
              />
            </MobileStoryViewport>

              <MobileActionDock
                inputMode={inputMode}
                hasAnyGate={hasAnyGate}
                gateMessage={gateMessage}
                isLowSanity={isLowSanity}
                isDarkMoon={isDarkMoon}
                input={input}
                inputError={inputError}
                onInputChange={(value) => {
                  setInput(value);
                  setInputError("");
                }}
                onTextIntent={noteManualTextIntent}
                onSubmitKey={onSubmit}
                onSubmitClick={onSubmit}
                onToggleOptions={() => {
                  const nextExpanded = !optionsExpanded;
                  setOptionsExpanded(nextExpanded);
                  if (
                    nextExpanded &&
                    currentOptions.length === 0 &&
                    !optionsRegenBusy &&
                    !optionsRegenPhaseBlocked &&
                    !isGuestDialogueExhausted
                  ) {
                    void requestFreshOptions("manual_button");
                  }
                }}
                chatBusy={isChatBusy || endgameState.active}
                helperText={
                  endgameState.active
                    ? (endgameLocked ? "终局已至。" : "正在生成终局…")
                    : (isChatBusy ? "正在生成..." : "保持简短。保持真实。")
                }
                showRegisterPrompt={showRegisterPrompt}
                isGuestDialogueExhausted={isGuestDialogueExhausted}
                optionsExpanded={optionsExpanded}
                talentLabel={talent}
                talentReady={Boolean(talent && talentCdLeft === 0 && !isChatBusy && !endgameState.active)}
                talentCooldownText={talent && talentCdLeft > 0 ? `冷却:${talentCdLeft}` : null}
                onUseTalent={onUseTalent}
              />
              {optionsExpanded && currentOptions.length > 0 ? (
                <MobileOptionsDropdown
                  options={currentOptions}
                  revealed={currentOptions.length > 0 && !isChatBusy}
                  isLowSanity={isLowSanity}
                  isDarkMoon={isDarkMoon}
                  disabled={isChatBusy || isGuestDialogueExhausted || optionsRegenBusy || (endgameState.active && !endgameLocked)}
                  onPick={onPickOption}
                />
              ) : optionsExpanded ? (
                <div
                  data-testid="mobile-options-dropdown"
                  className="mx-4 mb-3 rounded-[8px] border border-[#c4936d]/50 bg-[#0a1722]/96 px-6 py-5 vc-reading-serif text-[18px] text-[#d6a07b]"
                >
                  {optionsRegenBusy ? "主笔正在按当前剧情整理可选行动…" : "当前暂无可用选项。"}
                </div>
              ) : null}
              <MobileBottomNav
                onOpenCharacter={() => setOptionsExpanded(false)}
                onFocusStory={() => setOptionsExpanded(false)}
                onOpenCodex={() => setActiveMenu("codex")}
                onOpenSettings={() => setActiveMenu("settings")}
              />
            </div>
        </div>

      <NarrativeSystemsDebugPanel />
      <PlayComplianceToast visible={showComplianceHint} />
      <UnifiedMenuModal
        activeMenu={activeMenu}
        onClose={() => {
          setActiveMenu(null);
        }}
        onRequestExit={() => {
          setShowExitModal(true);
        }}
        audioMuted={audioMuted}
        onToggleMute={() => {
          toggleMute();
          setAudioMuted(isMuted());
        }}
        onViewedTab={() => {
          // 保留回调签名以兼容现有 props，但不再做引导状态记录
        }}
      />

    </MobileReadingShell>
  );
}

export default function PlayPageWrapper(props: AppPageDynamicProps) {
  useClientPageDynamicProps(props);
  const router = useRouter();
  const isHydrated = useGameStore((s) => s.isHydrated);
  const isGameStarted = useGameStore((s) => s.isGameStarted ?? false);

  useEffect(() => {
    if (!isHydrated) return;
    if (isGameStarted) return;
    router.replace("/create?from=play");
  }, [isHydrated, isGameStarted, router]);

  return (
    <div className="relative min-h-[100dvh]">
      {isHydrated && isGameStarted ? <PlayContent /> : null}
      {!isHydrated && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[#0f172a]/65 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
            <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
            <p className="text-sm text-slate-300">读取世界线中...</p>
          </div>
        </div>
      )}
    </div>
  );
}
