"use client";

import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Settings, Keyboard, List } from "lucide-react";
import { toggleMute, isMuted, updateSanityFilter, setDarkMoonMode, playUIClick, setMasterVolume } from "@/lib/audioEngine";
import type { Item, StatType } from "@/lib/registry/types";
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
import { injectLocalOpeningFallback } from "@/features/play/opening/injectLocalOpeningFallback";
import {
  computeOpeningBusyUi,
  shouldRecoverStaleSendActionFlight,
} from "@/features/play/opening/openingStreamUi";
import {
  DEFAULT_FOUR_ACTION_OPTIONS,
  FIXED_OPENING_NARRATIVE,
  OPENING_SYSTEM_PROMPT,
} from "@/features/play/opening/openingCopy";
import { pickEmbeddedOpeningOptions } from "@/features/play/opening/openingOptionPools";
import { FALLBACK_STATS, MAX_INPUT, STAT_ORDER } from "@/features/play/playConstants";
import { clampInt, localInputSafetyCheck, safeNumber } from "@/features/play/render/inputGuards";
import { normalizeIssuerName } from "@/features/play/render/npcIssuers";
import { applyBloodErase, extractGreenTips } from "@/features/play/render/narrative";
import { doesChatPhaseLockInteraction, isStreamVisualActivePhase } from "@/features/play/stream/chatPhase";
import { extractNarrative, tryParseDM } from "@/features/play/stream/dmParse";
import {
  accumulateDmFromSseEvent,
  foldSseTextToDmRaw,
  normalizeSseNewlines,
  takeCompleteSseEvents,
} from "@/features/play/stream/sseFrame";
import type { ChatMessage, ChatRole, ChatStreamPhase } from "@/features/play/stream/types";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";

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
  const setCurrentOptions = useGameStore((s) => s.setCurrentOptions);
  const inputMode = useGameStore((s) => s.inputMode ?? "options");
  const currentOptions = currentOptionsFromStore;
  const addOriginium = useGameStore((s) => s.addOriginium);
  const addTask = useGameStore((s) => s.addTask);
  const updateTaskStatus = useGameStore((s) => s.updateTaskStatus);
  const setPlayerLocation = useGameStore((s) => s.setPlayerLocation);
  const setBgm = useGameStore((s) => s.setBgm);
  const updateNpcLocation = useGameStore((s) => s.updateNpcLocation);
  const intrusionFlashUntil = useGameStore((s) => s.intrusionFlashUntil ?? 0);
  const isGameStarted = useGameStore((s) => s.isGameStarted ?? false);
  const isGuest = useGameStore((s) => s.isGuest ?? false);
  const guestId = useGameStore((s) => s.guestId ?? null);
  const dialogueCount = useGameStore((s) => s.dialogueCount ?? 0);
  const incrementDialogueCount = useGameStore((s) => s.incrementDialogueCount);
  const activeMenu = useGameStore((s) => s.activeMenu);
  const setActiveMenu = useGameStore((s) => s.setActiveMenu);
  const toggleInputMode = useGameStore((s) => s.toggleInputMode);
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
  /** 开局仅请求 options 时：隐藏流式条，正文由前端静态块展示 */
  const [openingAiBusy, setOpeningAiBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredOpening = useRef(false);
  const hasTriggeredResume = useRef(false);
  const hasShownManualInputComplianceHintRef = useRef(false);
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
  const isDarkMoon = day >= 3 && day < 10;
  const isLowSanity = (stats?.sanity ?? 0) < 20;
  useHeartbeat(isHydrated && isGameStarted, guestId ?? "guest_play", "/play");
  const hasEnteredGameEventRef = useRef(false);
  const hasFirstEffectiveActionRef = useRef(false);

  const isGuestDialogueExhausted = isGuest && dialogueCount >= 50;

  const sanity = stats?.sanity ?? 0;
  /** 已移除羊皮纸强制引导，不再阻塞对话 */
  const hasAnyGate = false;
  const gateMessage = "";

  const talentCdLeft = useMemo(() => {
    if (!talent) return 0;
    return safeNumber(talentCooldowns?.[talent], 0);
  }, [talent, talentCooldowns]);

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
    if (t.day >= 10 && !showApocalypseOverlay) {
      setShowApocalypseOverlay(true);
    }
  }, [isHydrated, showApocalypseOverlay]);

  useEffect(() => {
    if (streamPhase === "idle") {
      setOpeningAiBusy(false);
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
    isStreamVisualActive,
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

  const hasAssistantMessage = useMemo(
    () => (logs ?? []).some((l) => l && l.role === "assistant"),
    [logs]
  );

  const showEmbeddedOpening =
    isHydrated && isGameStarted && !hasAssistantMessage;

  const latestAssistantRaw = useMemo(() => {
    if (isStreamVisualActive) {
      return typeof smoothNarrative === "string" && smoothNarrative.length > 0
        ? smoothNarrative
        : narrativeRef.current ?? "";
    }
    if (liveNarrative) return liveNarrative;
    if (assistantOnlyMessages.length > 0) return assistantOnlyMessages[assistantOnlyMessages.length - 1] ?? "";
    return "";
  }, [isStreamVisualActive, smoothNarrative, liveNarrative, assistantOnlyMessages]);

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
    if (!showApocalypseOverlay) return;
    const t = setTimeout(() => {
      setStats({ sanity: 0 });
      router.push("/settlement");
    }, 3000);
    return () => clearTimeout(t);
  }, [showApocalypseOverlay, setStats, router]);

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
      injectLocalOpeningFallback();
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
      state.saveSlots?.["auto_save"] ??
      null;
    const savedOptions = Array.isArray(slot?.currentOptions)
      ? slot.currentOptions.filter((x) => typeof x === "string" && x.trim().length > 0).slice(0, 4)
      : [];
    if (savedOptions.length > 0) {
      setCurrentOptions([...savedOptions]);
      return;
    }
    if (!hasAssistantMessage && inputMode === "options") {
      setCurrentOptions([...pickEmbeddedOpeningOptions()]);
    }
  }, [
    currentOptions.length,
    hasAssistantMessage,
    inputMode,
    isChatBusy,
    isGameStarted,
    isHydrated,
    setCurrentOptions,
  ]);

  useEffect(() => {
    if (!isHydrated || isChatBusy) return;
    if (hasSeededOpeningOptions.current) return;
    const state = useGameStore.getState();
    const logsNow = state.logs ?? [];
    const assistantCount = logsNow.filter((l) => l && l.role === "assistant").length;
    if (assistantCount === 0) return;
    if (assistantCount <= 1) return;
    if (inputMode !== "options") return;
    if (currentOptions.length > 0) return;

    hasSeededOpeningOptions.current = true;
    setCurrentOptions([...pickEmbeddedOpeningOptions()]);
  }, [currentOptions.length, inputMode, isHydrated, isChatBusy, setCurrentOptions]);

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
    useGameStore.getState().saveGame("auto_save");
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
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        autoSaveProgress();
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      autoSaveProgress();
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoSaveProgress, isGameStarted, isHydrated]);

  const prevPathnameForAbortRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPathnameForAbortRef.current;
    if (prev !== null && prev === "/play" && pathname !== "/play") {
      streamAbortRef.current?.abort();
      void streamReaderRef.current?.cancel().catch(() => {});
    }
    prevPathnameForAbortRef.current = pathname;
  }, [pathname]);

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
    const isOpeningOptionsOnlyRound = Boolean(isSystemAction && trimmed === OPENING_SYSTEM_PROMPT);
    openingOptionsOnlyRoundRef.current = isOpeningOptionsOnlyRound;
    if (isOpeningOptionsOnlyRound) {
      setOpeningAiBusy(true);
      setCurrentOptions([...pickEmbeddedOpeningOptions()]);
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
          sessionId: guestId ?? "browser_session",
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
          useGameStore.getState().pushLog({
            role: "assistant",
            content: degradedDm.narrative.slice(0, 50000),
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
          narrativeRef.current = extractNarrative(raw);
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
        narrativeToPush = (shouldApplyHallucination ? applyBloodErase(rawNarrative) : rawNarrative).slice(0, 50000);
      } catch {
        narrativeToPush = rawNarrative.slice(0, 50000);
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
        const prevInvIds = new Set(useGameStore.getState().inventory.map((i) => i.id));
        useGameStore.getState().addItems(items);
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

    const warehouseById = new Map(WAREHOUSE_ITEMS.map((w) => [w.id, w]));
    if (Array.isArray(parsed.awarded_warehouse_items) && parsed.awarded_warehouse_items.length > 0) {
      const whIds: string[] = [];
      for (const r of parsed.awarded_warehouse_items as unknown[]) {
        if (typeof r === "string" && r.trim()) whIds.push(r.trim());
        else if (r && typeof r === "object" && typeof (r as { id?: string }).id === "string") whIds.push((r as { id: string }).id);
      }
      const whItems = whIds
        .map((id) => warehouseById.get(id))
        .filter((w): w is NonNullable<typeof w> => !!w);
      if (whItems.length > 0) {
        const prevWhIds = new Set((useGameStore.getState().warehouse ?? []).map((w) => w.id));
        useGameStore.getState().addWarehouseItems(whItems);
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

    if (Array.isArray(parsed.codex_updates) && parsed.codex_updates.length > 0) {
      type RawCodexUpdate = {
        id: string;
        name: string;
        type: "npc" | "anomaly";
        favorability?: unknown;
        combatPower?: unknown;
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
        favorability: typeof u.favorability === "number" ? u.favorability : undefined,
        combatPower: typeof u.combatPower === "number" ? u.combatPower : undefined,
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

    const dmg = clampInt(parsed.sanity_damage ?? 0, 0, 9999);
    if (dmg > 0) {
      const cur = useGameStore.getState().stats?.sanity ?? 0;
      useGameStore.getState().setStats({ sanity: Math.max(0, cur - dmg) });
      setHitEffectUntil(Date.now() + 1200);
    }

    const validOpts = Array.isArray(parsed.options)
      ? parsed.options
          .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
          .map((o) => o.trim())
          .slice(0, 4)
      : [];

    const merged = [...validOpts];
    if (!isFirstAssistantTurn) {
      for (const d of DEFAULT_FOUR_ACTION_OPTIONS) {
        if (merged.length >= 4) break;
        if (merged.includes(d)) continue;
        merged.push(d);
      }
    }

    if (merged.length === 0 && isFirstAssistantTurn) {
      merged.push(...DEFAULT_FOUR_ACTION_OPTIONS);
    }

    if (merged.length > 0) {
      setCurrentOptions([...merged.slice(0, 4)]);
      useGameStore.getState().saveGame("auto_save");
    }

    if (typeof parsed.currency_change === "number" && parsed.currency_change !== 0) {
      addOriginium(parsed.currency_change);
    }

    if (Array.isArray(parsed.new_tasks) && parsed.new_tasks.length > 0) {
      for (const t of parsed.new_tasks) {
        if (t && typeof t.id === "string" && typeof t.title === "string") {
          addTask({
            id: t.id,
            title: t.title,
            desc: typeof t.desc === "string" ? t.desc : "",
            issuer: normalizeIssuerName(t.issuer, t.id),
            reward: typeof t.reward === "string" ? t.reward : "",
          });
        }
      }
    }

    if (Array.isArray(parsed.task_updates) && parsed.task_updates.length > 0) {
      for (const u of parsed.task_updates) {
        if (u && typeof u.id === "string" && (u.status === "active" || u.status === "completed" || u.status === "failed")) {
          updateTaskStatus(u.id, u.status);
        }
      }
    }

    if (typeof parsed.player_location === "string" && parsed.player_location.length > 0) {
      setPlayerLocation(parsed.player_location);
    }

    if (typeof parsed.bgm_track === "string" && isValidBgmTrack(parsed.bgm_track)) {
      setBgm(parsed.bgm_track);
    }

    if (Array.isArray(parsed.npc_location_updates) && parsed.npc_location_updates.length > 0) {
      for (const u of parsed.npc_location_updates) {
        if (u && typeof u.id === "string" && typeof u.to_location === "string") {
          updateNpcLocation(u.id, u.to_location);
        }
      }
    }

    const isItemUse = trimmed.startsWith("我使用了道具：");
    const shouldAdvanceTime = parsed.consumes_time !== false && !isItemUse;

    if (parsed.is_action_legal && !parsed.is_death && shouldAdvanceTime) {
      useGameStore.getState().decrementCooldowns();
      const prevTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      advanceTime();
      const nextTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      if (prevTime.day < 3 && nextTime.day === 3 && nextTime.hour === 0) {
        setShowDarkMoonOverlay(true);
      }
      if (nextTime.day >= 10) {
        setShowApocalypseOverlay(true);
      }
    }

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
    useGameStore.getState().saveGame("auto_save");
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
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveMenu("settings")}
                      data-onboarding="settings-btn"
                      className="shrink-0 min-h-[44px] min-w-[44px] max-h-[48px] max-w-[48px] touch-manipulation"
                      aria-label="设置"
                    >
                      <div className="group relative flex h-9 w-9 sm:h-10 sm:w-10 cursor-pointer items-center justify-center">
                        <div className="absolute -inset-0.5 rounded-full bg-slate-300/60 blur-sm animate-pulse" />
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-r-slate-200 border-t-white animate-[spin_1.2s_linear_infinite]" />
                        <div className="absolute inset-0.5 rounded-full bg-white/95 backdrop-blur-sm transition-all group-hover:bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
                        <Settings className="relative z-10 text-slate-600 group-hover:text-slate-800" size={18} strokeWidth={1.8} />
                      </div>
                    </button>
                    <h2 className="truncate text-base font-bold tracking-widest text-slate-800 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] md:text-lg">
                      叙事主视窗
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
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
                      <div className="absolute -inset-0.5 rounded-full bg-slate-300/60 blur-sm animate-pulse" />
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-r-slate-200 border-t-white animate-[spin_1.2s_linear_infinite]" />
                      <div className="absolute inset-0.5 rounded-full bg-white/95 backdrop-blur-sm transition-all group-hover:bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
                      {inputMode === "options" ? (
                        <Keyboard className="relative z-10 text-slate-600 group-hover:text-slate-800" size={18} strokeWidth={1.8} />
                      ) : (
                        <List className="relative z-10 text-slate-600 group-hover:text-slate-800" size={18} strokeWidth={1.8} />
                      )}
                    </div>
                  </button>
                  <div className="shrink-0 min-w-0">
                    <div className="relative group">
                      {talent && talentCdLeft === 0 && !isChatBusy && (
                        <div
                          className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-600 opacity-70 blur transition-opacity duration-500 group-hover:opacity-100 animate-[pulse_3s_ease-in-out_infinite]"
                          aria-hidden
                        />
                      )}
                      <button
                        type="button"
                        onClick={onUseTalent}
                        disabled={!talent || talentCdLeft > 0 || isChatBusy}
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
                suppressStreamVisual={openingBusyUi}
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
              >
                {inputMode === "options" &&
                  (showEmbeddedOpening
                    ? isChatBusy || currentOptions.length > 0
                    : hasAssistantMessage &&
                      currentOptions.length > 0 &&
                      !isChatBusy) && (
                  <PlayOptionsList
                    options={currentOptions}
                    revealed={
                      currentOptions.length > 0 && (showEmbeddedOpening || !isChatBusy)
                    }
                    isLowSanity={isLowSanity}
                    isDarkMoon={isDarkMoon}
                    disabled={isChatBusy || isGuestDialogueExhausted}
                    onPick={(option) => {
                      if (isGuestDialogueExhausted) {
                        setShowDialoguePaywall(true);
                        return;
                      }
                      playUIClick();
                      void sendAction(option, true);
                    }}
                  />
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
                chatBusy={isChatBusy}
                helperText={isChatBusy ? "正在生成..." : "保持简短。保持真实。"}
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
