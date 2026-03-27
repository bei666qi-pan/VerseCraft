"use client";

import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Settings, Keyboard, List, Book } from "lucide-react";
import { toggleMute, isMuted, updateSanityFilter, setDarkMoonMode, playUIClick, setMasterVolume } from "@/lib/audioEngine";
import type { Item, StatType, WarehouseItem } from "@/lib/registry/types";
import { canUseItem } from "@/lib/registry/itemUtils";
import { ITEMS } from "@/lib/registry/items";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { useGameStore, type CodexEntry, type EchoTalent } from "@/store/useGameStore";
import { useSmoothStreamFromRef, type SmoothStreamTailDrainConfig } from "@/hooks/useSmoothStream";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { UnifiedMenuModal } from "@/components/UnifiedMenuModal";
import { isValidBgmTrack } from "@/config/audio";
import { PlayAmbientOverlays } from "@/features/play/components/PlayAmbientOverlays";
import { PlayBlockingModals } from "@/features/play/components/PlayBlockingModals";
import { PlayComplianceToast } from "@/features/play/components/PlayComplianceToast";
import { PlayOptionsList } from "@/features/play/components/PlayOptionsList";
import { PlayStoryScroll } from "@/features/play/components/PlayStoryScroll";
import { PlayTextInputBar } from "@/features/play/components/PlayTextInputBar";
import {
  computeOpeningBusyUi,
  shouldRecoverStaleSendActionFlight,
} from "@/features/play/opening/openingStreamUi";
import {
  FIXED_OPENING_NARRATIVE,
  OPENING_SYSTEM_PROMPT,
} from "@/features/play/opening/openingCopy";
import { pickEmbeddedOpeningOptions } from "@/features/play/opening/openingOptionPools";
import { isColdPlayOpening } from "@/features/play/opening/coldOpening";
import { FALLBACK_STATS, MAX_INPUT, STAT_ORDER } from "@/features/play/playConstants";
import { PROFESSION_IDS } from "@/lib/profession/registry";
import { PROFESSION_REGISTRY } from "@/lib/profession/registry";
import type { ProfessionId } from "@/lib/profession/types";
import { getProfessionActiveSkillName } from "@/lib/profession/benefits";
import { clampInt, localInputSafetyCheck, safeNumber } from "@/features/play/render/inputGuards";
import { normalizeIssuerName } from "@/features/play/render/npcIssuers";
import {
  normalizeGameTaskDraft,
  normalizeTaskUpdateDraft,
} from "@/lib/tasks/taskV2";
import { applyBloodErase, extractGreenTips } from "@/features/play/render/narrative";
import {
  sanitizeDisplayedNarrative,
  sanitizeDisplayedOptionText,
} from "@/features/play/render/sanitizeDisplayedNarrative";
import { doesChatPhaseLockInteraction, isStreamVisualActivePhase } from "@/features/play/stream/chatPhase";
import { extractNarrative, tryParseDM } from "@/features/play/stream/dmParse";
import { extractCodexMentionsFromNarrative } from "@/lib/registry/codexAutoCapture";
import {
  accumulateDmFromSseEvent,
  foldSseTextToDmRaw,
  normalizeSseNewlines,
  takeCompleteSseEvents,
} from "@/features/play/stream/sseFrame";
import type { ChatMessage, ChatRole, ChatStreamPhase } from "@/features/play/stream/types";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";
import type { PlaySemanticWaitingKind } from "@/features/play/components/PlaySemanticWaitingHint";
import { ENDGAME_ONLY_OPTION, ensureMinChars, isEndgameMoment, isNightHour } from "@/features/play/endgame/endgame";
import {
  hasStrongAcquireSemantics,
  normalizeRegeneratedOptions,
  shouldAutoRegenerateOptionsOnModeSwitch,
  shouldWarnAcquireMismatch,
} from "@/features/play/turnCommit/phaseRegressionGuards";

/** Max idle time between SSE chunks after the first payload (avoids infinite “正在生成…”). */
const STREAM_CHUNK_STALL_MS = 120_000;
/** Stricter timeout until first non-empty `data:` payload (connection open but no DM bytes). */
const STREAM_FIRST_CHUNK_STALL_MS = 45_000;
/**
 * Max wait for the **first byte / response headers** from our own `/api/chat`.
 * The handler runs moderation + DB + control preflight (≤~11s) before calling upstream; `resilientFetch`
 * may retry several times with `AI_TIMEOUT_MS` (~60s) each — 95s was too low and caused false timeouts.
 */
const FETCH_CHAT_RESPONSE_DEADLINE_MS = 280_000;
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
  '【系统辅助请求：仅生成可选行动】本请求只用于刷新 options，不推进剧情。' +
  "你必须输出合法 DM JSON，且严格满足：" +
  "is_action_legal=true，sanity_damage=0，is_death=false，consumes_time=false；" +
  'narrative 必须为空字符串；options 必须是 4 条简体中文、可执行、互不重复的第一人称行动句；' +
  "禁止发放/消耗道具，禁止更新任务、图鉴、地点、关系、武器、威胁等任何世界状态字段。";

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
  const advanceTime = useGameStore((s) => s.advanceTime);
  const setStats = useGameStore((s) => s.setStats);
  const rewindTime = useGameStore((s) => s.rewindTime);
  const popLastNLogs = useGameStore((s) => s.popLastNLogs);
  const mergeCodex = useGameStore((s) => s.mergeCodex);
  const currentOptionsFromStore = useGameStore((s) => s.currentOptions ?? []);
  const recentOptions = useGameStore((s) => s.recentOptions ?? []);
  const setCurrentOptions = useGameStore((s) => s.setCurrentOptions);
  const writeResumeShadow = useGameStore((s) => s.writeResumeShadow);
  const inputMode = useGameStore((s) => s.inputMode ?? "options");
  const currentOptions = currentOptionsFromStore;
  const addOriginium = useGameStore((s) => s.addOriginium);
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
  const toggleInputMode = useGameStore((s) => s.toggleInputMode);
  const professionState = useGameStore((s) => s.professionState);
  const hasMetProfessionCertifier = useGameStore((s) => s.hasMetProfessionCertifier);
  const markMetProfessionCertifier = useGameStore((s) => s.markMetProfessionCertifier);
  const certifyProfession = useGameStore((s) => s.certifyProfession);
  const [showIntrusionFlash, setShowIntrusionFlash] = useState(false);

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
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
  const [highlightSettingsBtn, setHighlightSettingsBtn] = useState(false);
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

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredOpening = useRef(false);
  const hasAutoOpenedGuideRef = useRef(false);
  const hasTriggeredResume = useRef(false);
  const hasShownManualInputComplianceHintRef = useRef(false);
  const hasShownProfessionEligibleHintRef = useRef(false);
  const complianceHintTimerRef = useRef<number | null>(null);
  const userScrolledUpRef = useRef(false);
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
  const openingOptionsOnlyRoundRef = useRef(false);
  const optionsRegenInFlightRef = useRef(false);
  const modeSwitchByUserRef = useRef(false);

  useEffect(() => {
    streamPhaseRef.current = streamPhase;
  }, [streamPhase]);

  /** True while the live narrative strip / typewriter should run (covers upstream wait + token drain + commit tick). */
  const isStreamVisualActive = isStreamVisualActivePhase(streamPhase);
  const isChatBusy = doesChatPhaseLockInteraction(streamPhase);
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
  /** 首屏选项已就绪时仍隐藏「正在生成」：嵌入式开场 + 任意会话忙（含开局 API 飞行中）均不驱动 typewriter 思考态 */
  const suppressEmbeddedOpeningStreamUi = useMemo(
    () => openingBusyUi || (showEmbeddedOpening && isChatBusy),
    [openingBusyUi, showEmbeddedOpening, isChatBusy]
  );
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
    }
  }, [router]);

  const streamTailDrain = useMemo<SmoothStreamTailDrainConfig | null>(() => {
    if (streamPhase !== "tail_draining") return null;
    return {
      targetRef: tailDrainTargetRef,
      alignKey: tailAlignKey,
      onReached: onTailDrainComplete,
    };
  }, [streamPhase, tailAlignKey, onTailDrainComplete]);

  const day = time.day ?? 0;
  const hour = time.hour ?? 0;
  const isNight = isNightHour(hour);
  const isDarkMoon = day >= 3 && day < 10;
  const isLowSanity = (stats?.sanity ?? 0) < 20;
  useHeartbeat(isHydrated && isGameStarted, guestId ?? "guest_play", "/play");
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
    if (!isHydrated) return;
    if (!isGameStarted) {
      router.replace("/");
    }
  }, [isHydrated, isGameStarted, router]);

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
    if (!isHydrated || !isGameStarted) return;
    if (hasAutoOpenedGuideRef.current) return;
    hasAutoOpenedGuideRef.current = true;
    /**
     * 首次进入游戏时先打开“游戏指南”，把“只是有按钮”升级为“先看得到入口”。
     * 同时高亮设置按钮，提示玩家后续从设置进入完整控制中枢。
     */
    setActiveMenu("guide");
    setHighlightSettingsBtn(true);
  }, [isGameStarted, isHydrated, setActiveMenu]);

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
    const t = useGameStore.getState().time ?? { day: 0, hour: 0 };
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
      if (userScrolledUpRef.current) return;
      scheduleAutoScroll(smooth);
    },
    [scheduleAutoScroll]
  );

  const smoothStreamOptions = useMemo(
    () => ({
      uniformPacing: true,
      uniformTickMs: 42,
    }),
    []
  );

  const { text: smoothNarrative, isComplete: smoothComplete, isThinking: smoothThinking } = useSmoothStreamFromRef(
    narrativeRef,
    streamVisualForTypewriter,
    () => scheduleAutoScrollIfPinned(false),
    smoothStreamOptions,
    streamTailDrain
  );

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
    if (isStreamVisualActive) scheduleAutoScrollIfPinned(false);
    else if (prevIsStreamVisualActiveRef.current) scheduleAutoScrollIfPinned(true);
    else scheduleAutoScrollIfPinned(false);
    prevIsStreamVisualActiveRef.current = isStreamVisualActive;
  }, [smoothNarrative, isStreamVisualActive, scheduleAutoScrollIfPinned]);

  useLayoutEffect(() => {
    if (userScrolledUpRef.current) return;
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
        "深渊的凝视正在干扰你的认知。你的进度尚未保存，确定要强行切断连接吗？"
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
    // 嵌入式开场：首屏叙事已由前端固定块展示，且选项来自本地池；禁止发起 OPENING_SYSTEM_PROMPT，
    // 否则会把 streamPhase 锁成 busy，导致首屏四选项不可点击。
    if (showEmbeddedOpening) {
      hasTriggeredOpening.current = true;
      return;
    }
    const currentLogs = useGameStore.getState().logs ?? [];
    const turn = currentLogs.length;
    // 仅在还没有任何助手叙事时触发一次主链路开场（单一真相源；本地叙事仅作下方超时降级）
    if (turn > 0) return;
    hasTriggeredOpening.current = true;
    openingAwaitingAssistantRef.current = true;
    openingStartedAtRef.current = Date.now();
    void sendActionRef.current(OPENING_SYSTEM_PROMPT, true, false, true);
  }, [isHydrated, isChatBusy, showEmbeddedOpening]);

  /** 成功拿到选项后清掉【开局】类提示，避免与正常对局并存 */
  useEffect(() => {
    if (currentOptions.length === 0) return;
    setLiveNarrative((prev) => (typeof prev === "string" && prev.startsWith("【开局】") ? "" : prev));
  }, [currentOptions.length]);

  // 开场超时：须避免请求仍在飞行时误判；先静默自动重试一次拉 options，仍失败再提示（不重复 push 开场正文）
  useEffect(() => {
    if (!isHydrated) return;
    const OPENING_STALL_MS = 24_000;
    const tick = window.setInterval(() => {
      if (shouldRecoverStaleSendActionFlight(sendActionInFlightRef.current, streamPhaseRef.current)) {
        sendActionInFlightRef.current = false;
        openingOptionsOnlyRoundRef.current = false;
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
        void sendActionRef.current(OPENING_SYSTEM_PROMPT, true, false, true);
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

  // 兜底：优先从存档恢复 options；无存档且仍处于嵌入式开场时注入本地多池随机四条
  const hasSeededOpeningOptions = useRef(false);
  useEffect(() => {
    if (!isHydrated || !isGameStarted || isChatBusy) return;
    if (currentOptions.length > 0) return;
    const state = useGameStore.getState();
    const slot =
      state.saveSlots?.[state.currentSaveSlot] ??
      state.saveSlots?.["main_slot"] ??
      null;
    const savedOptions = Array.isArray(slot?.currentOptions)
      ? slot.currentOptions.filter((x) => typeof x === "string" && x.trim().length > 0).slice(0, 4)
      : [];
    if (savedOptions.length > 0) {
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
        currentOptionsLength: currentOptions.length,
        isChatBusy,
        optionsRegenBusy,
        endgameActive: endgameState.active,
        showEmbeddedOpening,
        isGuestDialogueExhausted,
      })) {
        void requestFreshOptions("auto_switch");
      }
    }
  }, [
    currentOptions.length,
    endgameState.active,
    inputMode,
    isChatBusy,
    isGuestDialogueExhausted,
    isHydrated,
    optionsRegenBusy,
    showEmbeddedOpening,
  ]);

  // 嵌入式开场：首屏四选项必须由前端立刻注入，确保可点击（不依赖 /api/chat 的 OPENING_SYSTEM_PROMPT）。
  useEffect(() => {
    if (!isHydrated || !showEmbeddedOpening) return;
    if (isChatBusy) return;
    if (inputMode !== "options") return;
    if (currentOptions.length > 0) return;
    setCurrentOptions([...pickEmbeddedOpeningOptions()]);
  }, [currentOptions.length, inputMode, isChatBusy, isHydrated, setCurrentOptions, showEmbeddedOpening]);

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

  async function requestFreshOptions(trigger: "auto_switch" | "manual_button") {
    // 以前这里仅做 UI 视图切换；现在升级为能力切换：空 options 时发起一次“仅生成选项”请求。
    if (optionsRegenInFlightRef.current || isChatBusy || sendActionInFlightRef.current) return;
    if (endgameState.active || showEmbeddedOpening) return;
    if (isGuestDialogueExhausted) {
      setFirstTimeHint("当前无法生成可用行动，请继续手动输入或稍后重试");
      return;
    }
    optionsRegenInFlightRef.current = true;
    setOptionsRegenBusy(true);
    if (trigger === "auto_switch") {
      setFirstTimeHint("主笔正在整理可选行动…");
    }
    try {
      const history = (useGameStore.getState().logs ?? [])
        .filter((l) => l && (l.role === "user" || l.role === "assistant"))
        .slice(-12)
        .map((l) => ({ role: l.role as ChatRole, content: String(l.content ?? "") }));
      const messages: ChatMessage[] = [
        ...history,
        {
          role: "user",
          content:
            `${OPTIONS_REGEN_SYSTEM_PROMPT}\n` +
            `【仅刷新选项原因】${trigger === "auto_switch" ? "用户切回选项模式且当前无可用项" : "用户手动点击刷新选项按钮"}`,
        },
      ];
      const playerContext = useGameStore.getState().getPromptContext();
      const clientState = useGameStore.getState().getStructuredClientStateForServer();
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          playerContext,
          clientState,
          sessionId: guestId ?? "browser_session",
          openingOptionsOnlyRound: false,
          clientPurpose: "options_regen_only",
        }),
      });
      if (!res.ok || !res.body) {
        setCurrentOptions([]);
        setFirstTimeHint("当前无法生成可用行动，请继续手动输入或稍后重试");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let text = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
      }
      const dmRaw = foldSseTextToDmRaw(text);
      const parsed = tryParseDM(dmRaw);
      const normalized = normalizeRegeneratedOptions(parsed?.options, recentOptions);
      if (normalized.length === 0) {
        setCurrentOptions([]);
        setFirstTimeHint("当前无法生成可用行动，请继续手动输入或稍后重试");
        return;
      }
      // 只刷新 currentOptions：不写 user/assistant logs、不增 dialogueCount、不提交世界状态。
      setCurrentOptions(normalized);
      setLiveNarrative((prev) =>
        typeof prev === "string" && prev.includes("当前无法生成可用行动") ? "" : prev
      );
    } catch {
      setCurrentOptions([]);
      setFirstTimeHint("当前无法生成可用行动，请继续手动输入或稍后重试");
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
    streamLogsBaselineRef.current = (useGameStore.getState().logs ?? []).length;
    setStreamPhase("waiting_upstream");
    // Only compute hint at request start; keep stable during waiting_upstream.
    setWaitingHintKind(guessSemanticWaitingKind(trimmed));
    const isOpeningOptionsOnlyRound = Boolean(isSystemAction && trimmed === OPENING_SYSTEM_PROMPT);
    const isEndgameSystemRound = Boolean(isSystemAction && trimmed === ENDGAME_SYSTEM_PROMPT);
    openingOptionsOnlyRoundRef.current = isOpeningOptionsOnlyRound;
    if (isOpeningOptionsOnlyRound) {
      setOpeningAiBusy(true);
      setCurrentOptions([...pickEmbeddedOpeningOptions()]);
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
      : [...baseMessages, { role: "user", content: trimmed }];

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          playerContext,
          clientState,
          sessionId: guestId ?? "browser_session",
          openingOptionsOnlyRound: Boolean(isSystemAction && trimmed === OPENING_SYSTEM_PROMPT),
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
    let sawStreamChunk = false;

    const applySseEvent = (eventText: string) => {
      const { raw: nextRaw, sawNonEmptyData } = accumulateDmFromSseEvent(eventText, raw);
      raw = nextRaw;
      if (sawNonEmptyData && !sawStreamChunk) {
        sawStreamChunk = true;
        setStreamPhase("streaming_body");
      }
      if (!openingOptionsOnlyRoundRef.current) {
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

    let streamCancelled = false;
    try {
      while (true) {
        const stallMs = sawStreamChunk ? STREAM_CHUNK_STALL_MS : STREAM_FIRST_CHUNK_STALL_MS;
        const { value, done } = await readNextWithStallGuard(stallMs);
        if (done) break;
        buf += decoder.decode(value, { stream: true });
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
    try {
    const parsed = tryParseDM(raw);
    if (!parsed) {
      setStreamPhase("idle");
      // 格式/重复输出等解析失败：不扣理智、不用安全血字（与 stream 安全截断路径区分）
      narrativeRef.current = "";
      setLiveNarrative(
        "本回合剧情数据格式异常，未写入日志与结算。请重试同一行动，或切换到手动输入后再试。"
      );
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

    const logsBeforeAssistant = useGameStore.getState().logs ?? [];
    const assistantCountBeforePush = logsBeforeAssistant.filter((l) => l && l.role === "assistant").length;
    const isFirstAssistantTurn = assistantCountBeforePush === 0;

    const rawNarrative = typeof parsed.narrative === "string" ? parsed.narrative : String(parsed.narrative ?? "");
    let narrativeToPush: string;
    if (openingOptionsOnlyRoundRef.current) {
      narrativeToPush = FIXED_OPENING_NARRATIVE;
    } else {
      try {
        const prepared = (shouldApplyHallucination ? applyBloodErase(rawNarrative) : rawNarrative).slice(0, 50000);
        const shown = sanitizeDisplayedNarrative(prepared);
        narrativeToPush = shown.text;
      } catch {
        narrativeToPush = sanitizeDisplayedNarrative(rawNarrative.slice(0, 50000)).text;
      }
    }
    useGameStore.getState().pushLog({
      role: "assistant",
      content: narrativeToPush,
      reasoning: undefined,
    });

    setLiveNarrative("");

    const consumedNames = Array.isArray(parsed.consumed_items)
      ? (parsed.consumed_items as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    const hadAnomaly = (parsed.sanity_damage ?? 0) > 0;
    if (!parsed.is_death) {
      setPendingHallucinationCheck((consumedNames.length > 0) || hadAnomaly);
    }

    if (consumedNames.length > 0) {
      useGameStore.getState().consumeItems(consumedNames);
    }

    const validTiers = ["S", "A", "B", "C", "D"] as const;
    const itemById = new Map(ITEMS.map((i) => [i.id, i]));
    let awardedItemWriteCount = 0;
    let awardedWarehouseWriteCount = 0;
    if (Array.isArray(parsed.awarded_items) && parsed.awarded_items.length > 0) {
      const resolved: Item[] = [];
      for (let idx = 0; idx < parsed.awarded_items.length; idx++) {
        const r: unknown = parsed.awarded_items[idx];
        let id: string | null = null;
        let o: Record<string, unknown> | null = null;
        if (typeof r === "string" && r.trim()) {
          id = r.trim();
        } else if (r && typeof r === "object") {
          o = r as Record<string, unknown>;
          id = typeof o.id === "string" && o.id ? o.id : null;
        }
        if (!id) continue;
        const registryItem = itemById.get(id);
        if (registryItem) {
          resolved.push(registryItem);
          continue;
        }
        if (!o) continue;
        const name = String(o.name ?? "未知道具");
        const tier = validTiers.includes(String(o.tier) as (typeof validTiers)[number])
          ? (String(o.tier) as Item["tier"])
          : "B";
        const rawStatBonus = o.statBonus;
        let statBonus: Item["statBonus"] = undefined;
        if (rawStatBonus && typeof rawStatBonus === "object" && !Array.isArray(rawStatBonus)) {
          const entries = Object.entries(rawStatBonus as Record<string, unknown>).filter(
            ([, v]) => typeof v === "number" && Number.isFinite(v)
          ) as [StatType, number][];
          if (entries.length > 0) statBonus = Object.fromEntries(entries) as Item["statBonus"];
        }
        resolved.push({
          id,
          name,
          tier,
          description: typeof o.description === "string" ? o.description : name,
          tags: typeof o.tags === "string" ? o.tags : "loot",
          statBonus,
          ownerId: "N-019",
        } satisfies Item);
      }
      const items = resolved;
      if (items.length > 0) {
        const prevInvIds = new Set((useGameStore.getState().inventory ?? []).map((i) => i.id));
        useGameStore.getState().addItems(items);
        const afterInv = useGameStore.getState().inventory ?? [];
        const afterInvIds = new Set(afterInv.map((i) => i.id));
        const writtenIds = items
          .map((it) => it.id)
          .filter((id) => !!id && afterInvIds.has(id));
        awardedItemWriteCount = writtenIds.length;
        // 只有真实写入 inventory 后才输出“已放入行囊”提示，避免叙事假成功。
        if (awardedItemWriteCount > 0) {
          useGameStore.getState().pushLog({
            role: "assistant",
            content: "**获得了新道具，已放入行囊**",
            reasoning: undefined,
          });
          const firstNew = items.find((it) => !prevInvIds.has(it.id));
          if (firstNew) {
            setFirstTimeHint(`你记下了新道具【${firstNew.name}】。`);
          }
        }
      }
    }

    const warehouseById = new Map(WAREHOUSE_ITEMS.map((w) => [w.id, w]));
    if (Array.isArray(parsed.awarded_warehouse_items) && parsed.awarded_warehouse_items.length > 0) {
      const whItemsResolved: WarehouseItem[] = [];
      for (const r of parsed.awarded_warehouse_items as unknown[]) {
        if (typeof r === "string" && r.trim()) {
          const fromRegistry = warehouseById.get(r.trim());
          if (fromRegistry) whItemsResolved.push(fromRegistry);
          continue;
        }
        if (r && typeof r === "object" && typeof (r as { id?: string }).id === "string") {
          const row = r as Record<string, unknown>;
          const id = String(row.id ?? "").trim();
          if (!id) continue;
          const fromRegistry = warehouseById.get(id);
          if (fromRegistry) {
            whItemsResolved.push(fromRegistry);
            continue;
          }
          // 兼容未注册但结构化回写的仓库物品，避免“叙事获得但状态丢失”。
          whItemsResolved.push({
            id,
            name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "未知物品",
            description: typeof row.description === "string" ? row.description : "临时写回物品",
            benefit: typeof row.benefit === "string" ? row.benefit : "未知",
            sideEffect: typeof row.sideEffect === "string" ? row.sideEffect : "未知",
            ownerId: typeof row.ownerId === "string" ? row.ownerId : "N-019",
            floor: "B1",
            isResurrection: typeof row.isResurrection === "boolean" ? row.isResurrection : undefined,
          });
        }
      }
      const whItems = whItemsResolved;
      if (whItems.length > 0) {
        const prevWhIds = new Set((useGameStore.getState().warehouse ?? []).map((w) => w.id));
        useGameStore.getState().addWarehouseItems(whItems);
        const afterWh = useGameStore.getState().warehouse ?? [];
        const afterWhIds = new Set(afterWh.map((w) => w.id));
        const writtenIds = whItems
          .map((w) => w.id)
          .filter((id) => !!id && afterWhIds.has(id));
        awardedWarehouseWriteCount = writtenIds.length;
        // 只有真实写入 warehouse 后才输出“已放入仓库”提示，避免叙事假成功。
        if (awardedWarehouseWriteCount > 0) {
          useGameStore.getState().pushLog({
            role: "assistant",
            content: "**获得了新物品，已放入仓库**",
            reasoning: undefined,
          });
          const firstNew = whItems.find((w) => !prevWhIds.has(w.id));
          if (firstNew) {
            setFirstTimeHint(`你在仓库中发现了新物品【${firstNew.name}】。`);
          }
        }
      }
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
      ).map((u) => ({
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
      }));
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

    const stateBeforeProfessionTurn = useGameStore.getState();
    const consumedProfessionActive = stateBeforeProfessionTurn.consumeProfessionActiveForTurn();

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

    const validOpts = Array.isArray(parsed.options)
      ? parsed.options
          .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
          .map((o) => sanitizeDisplayedOptionText(o))
          .filter((o) => o.length > 0)
          .slice(0, 4)
      : [];

    const merged = [...validOpts];

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
    } else if (openingOptionsOnlyRoundRef.current) {
      // 首屏四条已由 pickEmbeddedOpeningOptions 写入，禁止用模型 options 覆盖
    } else if (merged.length > 0) {
      setCurrentOptions([...merged.slice(0, 4)]);
    } else {
      // 无论是否首次 assistant 回合，都必须清空旧选项，避免沿用上一回合残留。
      setCurrentOptions([]);
      if (!isFirstAssistantTurn) {
        setFirstTimeHint("本回合未生成可用选项，可切换为手动输入继续。");
      }
    }

    if (typeof parsed.currency_change === "number" && parsed.currency_change !== 0) {
      addOriginium(parsed.currency_change);
    }

    if (Array.isArray(parsed.new_tasks) && parsed.new_tasks.length > 0) {
      for (const t of parsed.new_tasks) {
        const normalized = normalizeGameTaskDraft({
          ...t,
          issuerName:
            typeof t?.issuerName === "string"
              ? t.issuerName
              : normalizeIssuerName((t as { issuer?: unknown })?.issuer, (t as { id?: string })?.id ?? ""),
        });
        if (normalized) addTask(normalized);
      }
    }

    if (Array.isArray(parsed.task_updates) && parsed.task_updates.length > 0) {
      for (const u of parsed.task_updates) {
        const patch = normalizeTaskUpdateDraft(u);
        if (!patch) continue;
        if (patch.status) updateTaskStatus(patch.id, patch.status);
        updateTask(patch);
      }
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
          setPendingProfessionChoice({ enabled: true, options: opts.slice(0, 5), mapping });
          // 强制下一次以 options 形式推进
          if (useGameStore.getState().inputMode !== "options") useGameStore.getState().toggleInputMode();
          setCurrentOptions([...opts.slice(0, 4)]);
          setFirstTimeHint("你已满足职业认证条件，请选择你的职业。");
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
          phase: typeof u.phase === "string" ? u.phase : undefined,
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

    if (Array.isArray((parsed as { weapon_updates?: unknown[] }).weapon_updates)) {
      const updates = ((parsed as { weapon_updates?: unknown[] }).weapon_updates ?? [])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
        .map((u) => ({
          weaponId: typeof u.weaponId === "string" ? u.weaponId : undefined,
          weapon:
            (u as { weapon?: unknown }).weapon && typeof (u as { weapon?: unknown }).weapon === "object" && !Array.isArray((u as { weapon?: unknown }).weapon)
              ? ((u as { weapon: Record<string, unknown> }).weapon as any)
              : ((u as { weapon?: unknown }).weapon === null ? null : undefined),
          unequip: typeof (u as { unequip?: unknown }).unequip === "boolean" ? (u as { unequip: boolean }).unequip : undefined,
          stability:
            typeof u.stability === "number" && Number.isFinite(u.stability)
              ? u.stability
              : undefined,
          calibratedThreatId:
            u.calibratedThreatId === null || typeof u.calibratedThreatId === "string"
              ? (u.calibratedThreatId as string | null)
              : undefined,
          currentMods: Array.isArray(u.currentMods)
            ? u.currentMods.filter((x): x is string => typeof x === "string")
            : undefined,
          currentInfusions: Array.isArray(u.currentInfusions)
            ? u.currentInfusions
                .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
                .map((x) => ({
                  threatTag:
                    x.threatTag === "liquid" ||
                    x.threatTag === "mirror" ||
                    x.threatTag === "cognition" ||
                    x.threatTag === "seal"
                      ? x.threatTag
                      : "liquid",
                  turnsLeft: typeof x.turnsLeft === "number" && Number.isFinite(x.turnsLeft) ? x.turnsLeft : 0,
                }))
            : undefined,
          contamination:
            typeof u.contamination === "number" && Number.isFinite(u.contamination)
              ? u.contamination
              : undefined,
          repairable: typeof u.repairable === "boolean" ? u.repairable : undefined,
        }));
      if (updates.length > 0) applyWeaponUpdates(updates);
    }

    if (Array.isArray((parsed as { weapon_bag_updates?: unknown[] }).weapon_bag_updates)) {
      const safe = ((parsed as { weapon_bag_updates?: unknown[] }).weapon_bag_updates ?? [])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
      const mapped = safe.map((u) => {
        if (typeof (u as { removeWeaponId?: unknown }).removeWeaponId === "string") {
          return { removeWeaponId: (u as { removeWeaponId: string }).removeWeaponId };
        }
        if ((u as { addWeapon?: unknown }).addWeapon && typeof (u as { addWeapon?: unknown }).addWeapon === "object" && !Array.isArray((u as { addWeapon?: unknown }).addWeapon)) {
          return { addWeapon: (u as { addWeapon: any }).addWeapon };
        }
        if (typeof (u as { addEquippedWeaponId?: unknown }).addEquippedWeaponId === "string") {
          return { addEquippedWeaponId: (u as { addEquippedWeaponId: string }).addEquippedWeaponId };
        }
        return null;
      }).filter((x): x is any => !!x);
      if (mapped.length > 0) applyWeaponBagUpdates(mapped);
    }

    if (consumedProfessionActive === "溯源师" && Array.isArray(parsed.codex_updates)) {
      const traced = parsed.codex_updates
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
      useGameStore.getState().decrementCooldowns();
      const prevTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      advanceTime();
      const nextTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      if (prevTime.day < 3 && nextTime.day === 3 && nextTime.hour === 0) {
        setShowDarkMoonOverlay(true);
      }
      if (nextTime.day >= 10) {
        // 终局以“第10日0时”作为强制结局点；不在这里做扣理智/跳结算。
        if (isEndgameMoment(nextTime) && !endgameTriggeredRef.current) {
          endgameTriggeredRef.current = true;
          setEndgameState({ active: true, awaitingEnding: true });
          // 强制下一步只能推进终局：切到 options + 唯一占位选项（结局生成后会再覆盖为唯一选项）
          if (useGameStore.getState().inputMode !== "options") useGameStore.getState().toggleInputMode();
          setCurrentOptions([ENDGAME_ONLY_OPTION]);
          setFirstTimeHint("十日已至。你只能迎接终焉。");
        }
      }
    }

    // 统一强制保存：只要本回合 DM JSON 成功解析且状态 commit 完成，就必须保存一次。
    // 这能覆盖“手动输入且无 options”的场景，避免首页“继续执笔”失真。
    useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
    // 双层恢复：正式存档之外，同步写入 shadow，避免浏览器突发退出时仅依赖 IDB 防抖刷盘。
    writeResumeShadow();

    const skipTailDrain = openingOptionsOnlyRoundRef.current;
    if (skipTailDrain) {
      setStreamPhase("idle");
      const sanityAfterOpening = useGameStore.getState().stats?.sanity ?? 0;
      if (parsed.is_death || sanityAfterOpening <= 0) {
        setTimeout(() => router.push("/settlement"), 2000);
      }
    } else {
      parsedPostDrainRef.current = { isDeath: !!parsed.is_death };
      narrativeRef.current = narrativeToPush;
      tailDrainTargetRef.current = narrativeToPush;
      setTailAlignKey((n) => n + 1);
      setStreamPhase("tail_draining");
    }
    } catch (commitErr: unknown) {
      console.error("[/play] turn commit failed", commitErr);
      tailDrainTargetRef.current = null;
      parsedPostDrainRef.current = null;
      setStreamPhase("idle");
      narrativeRef.current = "";
      setLiveNarrative("剧情结算时发生错误，请重试本回合。");
    }
    } finally {
      openingOptionsOnlyRoundRef.current = false;
      setOpeningAiBusy(false);
      sendActionInFlightRef.current = false;
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

  function onUseItem(item: Item) {
    const check = canUseItem(item, stats);
    if (!check.ok) return; // UI should block, but guard here
    const text = `我使用了道具：【${item.name}】`;
    void sendAction(text);
    setActiveMenu(null);
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
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-white text-slate-900 transition-all duration-1000">
      <PlayAmbientOverlays
        showDarkMoonOverlay={showDarkMoonOverlay}
        showApocalypseOverlay={showApocalypseOverlay}
        showIntrusionFlash={showIntrusionFlash}
        hitEffectActive={hitEffectUntil > Date.now()}
        talentEffectType={talentEffectType}
      />

      <div
        className={`relative flex min-h-0 flex-1 flex-col ${hitEffectUntil > Date.now() ? "animate-[sanity-hit-shake_0.5s_ease-out_2]" : ""}`}
      >
        <PlayBlockingModals
          showDialoguePaywall={showDialoguePaywall}
          showRegisterPrompt={showRegisterPrompt}
          onPaywallRegister={() => router.push("/")}
          showExitModal={showExitModal}
          onSaveAndExit={onSaveAndExit}
          onAbandonAndDie={onAbandonAndDie}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
              <div className="shrink-0 bg-slate-900/10 px-3 py-2">
                <div className="flex min-h-[40px] items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 items-baseline">
                    <button
                      type="button"
                      onClick={() => {
                        if (endgameState.active) return;
                        setHighlightSettingsBtn(false);
                        setActiveMenu("settings");
                      }}
                      data-onboarding="settings-btn"
                      className="shrink-0 min-h-[44px] min-w-[44px] max-h-[48px] max-w-[48px] touch-manipulation"
                      aria-label="设置"
                    >
                      <div className="group relative flex h-9 w-9 sm:h-10 sm:w-10 cursor-pointer items-center justify-center">
                        {/* 进入游戏后引导期高亮“设置”，帮助玩家定位左侧控制中枢入口。 */}
                        <div
                          className={`absolute -inset-0.5 rounded-full blur-[12px] transition group-hover:opacity-90 ${
                            highlightSettingsBtn
                              ? "bg-amber-300/85 opacity-95 animate-[halo-pulse_2.2s_ease-in-out_infinite]"
                              : "bg-white/75 opacity-60 vc-wait-breath"
                          }`}
                        />
                        <div
                          className={`absolute inset-0.5 rounded-full backdrop-blur-sm transition-all ${
                            highlightSettingsBtn
                              ? "bg-amber-50 shadow-[0_0_16px_rgba(245,158,11,0.45)]"
                              : "bg-white/92 group-hover:bg-white shadow-[0_0_14px_rgba(148,163,184,0.38)]"
                          }`}
                        />
                        <Settings
                          className={`relative z-10 ${
                            highlightSettingsBtn ? "text-amber-700" : "text-blue-700 group-hover:text-blue-800"
                          }`}
                          size={18}
                          strokeWidth={2.0}
                        />
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (endgameState.active) return;
                        setActiveMenu("guide");
                      }}
                      className="shrink-0 min-h-[44px] min-w-[44px] max-h-[48px] max-w-[48px] touch-manipulation"
                      aria-label="游戏指南"
                    >
                      <div className="group relative flex h-9 w-9 sm:h-10 sm:w-10 cursor-pointer items-center justify-center">
                        <div className="absolute -inset-0.5 rounded-full bg-white/75 blur-[12px] opacity-60 transition group-hover:opacity-80 vc-wait-breath" />
                        <div className="absolute inset-0.5 rounded-full bg-white/92 backdrop-blur-sm transition-all group-hover:bg-white shadow-[0_0_14px_rgba(148,163,184,0.38)]" />
                        <Book className="relative z-10 text-blue-700 group-hover:text-blue-800" size={18} strokeWidth={2.0} />
                      </div>
                    </button>
                    <h2 className="truncate text-base font-bold tracking-widest text-slate-800 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] md:text-lg">
                      叙事主视窗
                    </h2>
                    {professionState?.currentProfession ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (endgameState.active) return;
                          setHighlightSettingsBtn(false);
                          setActiveMenu("settings");
                        }}
                        className="hidden min-w-0 items-center gap-2 rounded-full border border-white/30 bg-white/50 px-2 py-0.5 transition hover:bg-white/70 sm:flex"
                        title="打开设置并查看职业"
                      >
                        <div className="relative h-6 w-6 shrink-0">
                          <div className="absolute -inset-0.5 rounded-full bg-white/70 blur-[10px] opacity-60 vc-wait-breath" />
                          <div className="absolute inset-0 rounded-full bg-white/90 shadow-[0_0_14px_rgba(148,163,184,0.35)]" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            {/* 极简职业徽记：内联 SVG，避免外部资源与抖动 */}
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden
                              className="text-slate-700"
                            >
                              <path
                                d="M12 3.5l2.3 5.3 5.7.5-4.3 3.7 1.3 5.6L12 15.9 7 18.6l1.3-5.6-4.3-3.7 5.7-.5L12 3.5z"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        </div>
                        <span className="truncate text-base font-bold tracking-widest text-slate-800">
                          {getProfessionActiveSkillName(professionState.currentProfession)}
                        </span>
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (endgameState.active) return;
                      modeSwitchByUserRef.current = true;
                      const nextMode = inputMode === "options" ? "text" : "options";
                      toggleInputMode();
                      if (nextMode === "text" && !hasShownManualInputComplianceHintRef.current) {
                        hasShownManualInputComplianceHintRef.current = true;
                        triggerComplianceHint();
                      }
                    }}
                    className="shrink-0 min-h-[44px] min-w-[44px] max-h-[48px] max-w-[48px] touch-manipulation"
                    aria-label={inputMode === "options" ? "切换到手动输入" : "切换到选项"}
                  >
                    <div className="group relative flex h-9 w-9 sm:h-10 sm:w-10 cursor-pointer items-center justify-center">
                      <div className="absolute -inset-0.5 rounded-full bg-white/75 blur-[12px] opacity-60 transition group-hover:opacity-80 vc-wait-breath" />
                      <div className="absolute inset-0.5 rounded-full bg-white/92 backdrop-blur-sm transition-all group-hover:bg-white shadow-[0_0_14px_rgba(148,163,184,0.38)]" />
                      {inputMode === "options" ? (
                        <Keyboard className="relative z-10 text-blue-700 group-hover:text-blue-800" size={18} strokeWidth={2.0} />
                      ) : (
                        <List className="relative z-10 text-blue-700 group-hover:text-blue-800" size={18} strokeWidth={2.0} />
                      )}
                    </div>
                  </button>
                  <div className="shrink-0 min-w-0">
                    <div className="relative group">
                      {talent && talentCdLeft === 0 && !isChatBusy && (
                        <>
                          {/* 外圈：更夺目的扩散光晕（低频脉冲，避免闪烁） */}
                          <div
                            className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-r from-indigo-500/35 via-cyan-200/25 to-blue-600/35 opacity-95 blur-[18px] transition-opacity duration-500 group-hover:opacity-100 animate-[halo-pulse_2.4s_ease-in-out_infinite]"
                            aria-hidden
                          />
                          {/* 内圈：高亮边缘，让按钮在亮背景上也“立起来” */}
                          <div
                            className="pointer-events-none absolute -inset-0.5 rounded-full ring-1 ring-white/35 shadow-[0_0_18px_rgba(99,102,241,0.55),0_0_26px_rgba(34,211,238,0.35)] opacity-85 transition-opacity duration-500 group-hover:opacity-100"
                            aria-hidden
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={onUseTalent}
                        disabled={endgameState.active || !talent || talentCdLeft > 0 || isChatBusy}
                        className={`relative truncate rounded-full px-3 py-1.5 text-sm font-bold tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-all md:text-base ${
                          talent && talentCdLeft === 0 && !isChatBusy
                            ? "bg-slate-900/80 backdrop-blur-xl border border-white/20 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] hover:bg-slate-800/90"
                            : "bg-slate-900/30 border border-slate-700/50 text-slate-500 cursor-not-allowed grayscale"
                        }`}
                      >
                        {talent ? (
                          talentCdLeft > 0 ? (
                            <span className="truncate">{talent} (冷却:{talentCdLeft})</span>
                          ) : (
                            <span className="truncate">{talent}</span>
                          )
                        ) : (
                          <span className="truncate">命运回响</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 嵌入式开场首屏选项来自 pickEmbeddedOpeningOptions；该阶段不展示「主笔实时推演」以免与前端随机冲突 */}
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
                embeddedOpeningContent={showEmbeddedOpening ? FIXED_OPENING_NARRATIVE : null}
                openingAiBusy={openingBusyUi && !showEmbeddedOpening}
                semanticWaitingKind={streamPhase === "waiting_upstream" ? waitingHintKind : null}
              >
                {inputMode === "options" && currentOptions.length > 0 && (
                  <PlayOptionsList
                    options={currentOptions}
                    revealed={currentOptions.length > 0 && (showEmbeddedOpening || !isChatBusy)}
                    isLowSanity={isLowSanity}
                    isDarkMoon={isDarkMoon}
                    disabled={isChatBusy || isGuestDialogueExhausted || optionsRegenBusy || (endgameState.active && !endgameLocked)}
                    onPick={(option) => {
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
                      // 职业认证选项：本地落盘后再把“选择结果”送入叙事，保持剧情连贯。
                      if (pendingProfessionChoice.enabled && pendingProfessionChoice.mapping[option]) {
                        const chosen = pendingProfessionChoice.mapping[option]!;
                        const ok = certifyProfession(chosen);
                        setPendingProfessionChoice({ enabled: false, options: [], mapping: {} });
                        if (!ok) {
                          setFirstTimeHint("职业认证失败：当前条件不足或已拥有职业。");
                          return;
                        }
                        // 让 DM 自然写“姐姐帮你办手续”，但不要求 DM 输出新的协议字段。
                        void sendAction(`我选择认证职业：【${chosen}】`, true);
                        return;
                      }
                      void sendAction(option, true);
                    }}
                  />
                )}
                {inputMode === "options" && currentOptions.length === 0 && !showEmbeddedOpening && !endgameState.active && (
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
                    <p className="text-sm text-slate-600 md:text-base">
                      {optionsRegenBusy ? "主笔正在整理可选行动…" : "当前暂无可用选项。"}
                    </p>
                    <button
                      type="button"
                      onClick={() => void requestFreshOptions("manual_button")}
                      disabled={isChatBusy || optionsRegenBusy || isGuestDialogueExhausted}
                      className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 md:text-base"
                    >
                      让主笔给出选项
                    </button>
                  </div>
                )}
              </PlayStoryScroll>

              <PlayTextInputBar
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
                onSubmitKey={onSubmit}
                onSubmitClick={onSubmit}
                chatBusy={isChatBusy || endgameState.active}
                helperText={
                  endgameState.active
                    ? (endgameLocked ? "终局已至。" : "正在生成终局…")
                    : (isChatBusy ? "正在生成..." : "保持简短。保持真实。")
                }
                showRegisterPrompt={showRegisterPrompt}
                isGuestDialogueExhausted={isGuestDialogueExhausted}
              />
            </div>
          </section>
        </div>
      </div>

      <PlayComplianceToast visible={showComplianceHint} />

      <UnifiedMenuModal
        activeMenu={activeMenu}
        onClose={() => setActiveMenu(null)}
        onUseItem={onUseItem}
        isChatBusy={isChatBusy}
        audioMuted={audioMuted}
        onToggleMute={() => {
          toggleMute();
          setAudioMuted(isMuted());
        }}
        onViewedTab={() => {
          // 保留回调签名以兼容现有 props，但不再做引导状态记录
        }}
      />

    </main>
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
    router.replace("/");
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
