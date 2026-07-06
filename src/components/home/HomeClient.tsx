"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Loader2, Trophy } from "lucide-react";
import { deleteCloudSaveSlot, fetchCloudSaves, syncSaveToCloud } from "@/app/actions/save";
import { MAX_VISIBLE_SAVE_SLOTS } from "@/lib/save/slots";
import { checkNameAvailability, loginUser, registerUser } from "@/app/actions/auth";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import {
  getSurveyCompletionStatus,
  submitFeedback,
  submitProductSurvey,
} from "@/app/actions/feedback";
import {
  PRODUCT_SURVEY_KEY_HOME,
  PRODUCT_SURVEY_VERSION_HOME,
  DISCOVERY_SOURCE_OPTIONS,
  EXPERIENCE_STAGE_OPTIONS,
  CREATE_FRICTION_OPTIONS,
  IMMERSION_ISSUE_OPTIONS,
  CORE_FUN_POINT_OPTIONS,
  QUIT_REASON_OPTIONS,
  SAVE_LOSS_CONCERN_OPTIONS,
  RECOMMEND_WILLINGNESS_OPTIONS,
} from "@/lib/survey/productSurveyHomeV1";
import {
  VerseCraftPaperBrand,
  VerseCraftPaperCircleButton,
  VerseCraftPaperDivider,
  VerseCraftPaperFrame,
  VerseCraftPaperPillButton,
} from "@/components/VerseCraftPaperFrame";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";
import {
  useGameStore,
  type SaveSlotData,
  extractHomeContinueSummaryFromPayload,
  type HomeContinueSummary,
  type HomeContinueSourceTag,
} from "@/store/useGameStore";
import {
  extractResumeShadowSummary,
  isResumeShadowPlayable,
  readResumeShadowSnapshot,
} from "@/lib/state/resumeShadow";
import { unlockBgmOnUserGesture } from "@/config/audio";
import { formatLocationLabel } from "@/features/play/render/locationLabels";
import {
  getHomeAutoSlotId,
  planGuestLocalSaveCloudSync,
  resolveHomeContinueTimestamps,
  resolveHomeEntryState,
  shouldUseResumeShadowFallback,
} from "@/components/home/continueFallback";
import {
  homeContinuePrimaryCta,
  homeContinueUnavailableToast,
  homeRecoveryFallbackToast,
} from "@/lib/ui/deathContractCopy";
import type { AuthMode } from "@/components/home/HomeAuthModal";
import type {
  HomeSurveyQuestionConfig,
  HomeSurveyQuestionId,
} from "@/components/home/HomeSurveyModal";
import { SURVEY_COPY } from "@/components/home/homeSurveyCopy";

// 两个弹窗拆为独立 chunk，不进入首页首屏主 bundle，降低首次加载与 hydration 成本。
// HomeSurveyModal 保持原有“常驻挂载 + open 控制过渡”语义：组件仍无条件渲染，
// chunk 在水合后即后台加载完成，首次打开的过渡动画不受影响。
const HomeAuthModal = dynamic(() => import("@/components/home/HomeAuthModal"), { ssr: false });
const HomeSurveyModal = dynamic(() => import("@/components/home/HomeSurveyModal"), { ssr: false });

type HomeClientProps = {
  initialUser: { id: string; name: string } | null;
};

type SaveRow = {
  slotId: string;
  data: Record<string, unknown>;
  updatedAt: string | null;
};

function BulbIconSvg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* open book */}
      <path
        d="M12 6.8c-1.7-1.1-3.7-1.6-6-1.6-.9 0-1.6.7-1.6 1.6v9.8c0 .9.7 1.6 1.6 1.6 2.4 0 4.4.5 6 1.6V6.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.92"
      />
      <path
        d="M12 6.8c1.7-1.1 3.7-1.6 6-1.6.9 0 1.6.7 1.6 1.6v9.8c0 .9-.7 1.6-1.6 1.6-2.4 0-4.4.5-6 1.6V6.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.92"
      />
      <path
        d="M12 7.1v13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M7.2 9.4h2.8M7.2 12h2.8M14 9.4h2.8M14 12h2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

function FooterHaloIconButton({
  onClick,
  ariaLabel,
  ariaExpanded,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  ariaExpanded?: boolean;
  tone?: "neutral" | "blue";
  children: React.ReactNode;
}) {
  return (
    <VerseCraftPaperCircleButton
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      className="h-11 w-11"
    >
      <span className="text-vc-ink">{children}</span>
    </VerseCraftPaperCircleButton>
  );
}

function FooterHaloLinkButton({
  href,
  ariaLabel,
  children,
}: {
  href: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-vc-line bg-vc-paper-raised/90 text-vc-ink vc-shadow-card transition hover:bg-vc-paper-bright active:scale-[0.98]"
    >
      <span className="text-vc-ink">{children}</span>
    </Link>
  );
}

const INITIAL_AUTH_ACTION_STATE = { success: false, message: "", error: "" };
const SURVEY_LOCAL_CACHE_KEY = `vc_survey_done_${PRODUCT_SURVEY_KEY_HOME}`;
const AUTH_SUCCESS_QUERY_KEY = "auth";

/** 首页产品问卷（≤10题）：用于产品分层与决策排序 */
const HOME_SURVEY_FLOW: HomeSurveyQuestionConfig[] = [
  { id: "discoverySource", kind: "single", required: true, title: "你从哪里知道 VerseCraft？", options: DISCOVERY_SOURCE_OPTIONS },
  { id: "experienceStage", kind: "single", required: true, title: "你现在属于哪种体验阶段？", options: EXPERIENCE_STAGE_OPTIONS },
  { id: "createFriction", kind: "single", required: true, title: "角色创建流程里，哪个部分最容易让你犹豫或烦？", options: CREATE_FRICTION_OPTIONS },
  { id: "immersionIssue", kind: "single", required: true, title: "在正式游玩过程中，哪一种问题最影响你的沉浸感？", options: IMMERSION_ISSUE_OPTIONS },
  { id: "coreFunPoint", kind: "single", required: true, title: "你觉得文界工坊当前“最好玩”的核心点是什么？", options: CORE_FUN_POINT_OPTIONS },
  { id: "quitReason", kind: "single", required: true, title: "如果你中途退出或今天不继续玩，最主要的原因会是什么？", options: QUIT_REASON_OPTIONS },
  {
    id: "topFixOne",
    kind: "text",
    required: true,
    title: "如果只能让你提一个最该优先修掉的问题，你会写什么？",
    maxLen: 500,
    placeholder: "请描述一个最优先修复的问题。",
  },
  {
    id: "saveLossConcern",
    kind: "single",
    required: true,
    title: "你是否担心过“自己的记录、历史会丢”？",
    options: SAVE_LOSS_CONCERN_OPTIONS,
  },
  {
    id: "recommendWillingness",
    kind: "single",
    required: true,
    title: "你是否愿意推荐你的朋友来玩？",
    options: RECOMMEND_WILLINGNESS_OPTIONS,
  },
  {
    id: "finalSuggestion",
    kind: "text",
    required: false,
    title: "最后补充（可选）",
    subtitle: "请尽量具体，最好描述你在哪一步卡住、困惑、流失或不放心。",
    maxLen: 500,
    placeholder: "请尽量具体，最好描述你在哪一步卡住、困惑、流失或不放心。",
  },
];

type EntryState = "guest_fresh" | "guest_has_progress" | "authed_has_progress" | "authed_no_progress";

function isSaveSlotData(data: unknown): data is SaveSlotData {
  const d = data as Record<string, unknown> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    typeof d.historicalMaxSanity === "number" &&
    typeof d.time === "object" &&
    Array.isArray(d.inventory) &&
    Array.isArray(d.logs)
  );
}

export default function HomeClient({ initialUser }: HomeClientProps) {
  const router = useRouter();
  const user = initialUser;
  const [isStartNewPending, startNewGameTransition] = useTransition();

  // 提前预取两条主路径的 RSC payload 与 JS chunk，消除点击后的现场拉包延迟：
  // 「开始新篇」→ /intro；「继续」确认 → /play（chunk 较大，后台预取收益最高）
  useEffect(() => {
    router.prefetch("/intro");
    router.prefetch("/play");
  }, [router]);
  const homeViewTrackedRef = useRef(false);
  const authErrorTrackedRef = useRef<{ mode: AuthMode; msg: string } | null>(null);
  const surveyEntryExposedTrackedRef = useRef(false);
  const surveyStartedTrackedRef = useRef(false);
  const guestSaveCloudMigrationUserRef = useRef<string | null>(null);

  const setUser = useGameStore((s) => s.setUser);
  const guestId = useGameStore((s) => s.guestId);
  usePresenceHeartbeat({
    enabled: !!user || !!guestId,
    sessionId: user?.id ? `home_u_${user.id}` : guestId ?? "guest_pending",
    page: "/",
    guestId: user ? null : guestId,
  });
  const saveSlots = useGameStore((s) => s.saveSlots ?? {});
  const resetForNewGame = useGameStore((s) => s.resetForNewGame);
  const hydrateFromCloud = useGameStore((s) => s.hydrateFromCloud);
  const loadGame = useGameStore((s) => s.loadGame);
  const hydrateFromResumeShadow = useGameStore((s) => s.hydrateFromResumeShadow);

  const [authOpen, setAuthOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [authWarn, setAuthWarn] = useState(false);
  const [authConsentUserAgreement, setAuthConsentUserAgreement] = useState(false);
  const [authConsentPrivacyPolicy, setAuthConsentPrivacyPolicy] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authFormNonce, setAuthFormNonce] = useState(0);
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authClientError, setAuthClientError] = useState("");
  const [nameCheck, setNameCheck] = useState<{ status: "idle" | "checking" | "ok" | "taken" | "error"; message: string }>({
    status: "idle",
    message: "",
  });
  const [toast, setToast] = useState<string | null>(null);
  const [continuePickerOpen, setContinuePickerOpen] = useState(false);
  const [continuePickerSelectedSlotId, setContinuePickerSelectedSlotId] = useState<string>("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetSlotId, setDeleteTargetSlotId] = useState<string>("");
  const [cloudRows, setCloudRows] = useState<SaveRow[]>([]);
  const [shadowTick, setShadowTick] = useState(0);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [showBugFeedback, setShowBugFeedback] = useState(false);
  const [surveyConsentUserAgreement, setSurveyConsentUserAgreement] = useState(false);
  const [surveyConsentPrivacyPolicy, setSurveyConsentPrivacyPolicy] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackConsentUserAgreement, setFeedbackConsentUserAgreement] = useState(false);
  const [feedbackConsentPrivacyPolicy, setFeedbackConsentPrivacyPolicy] = useState(false);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [cloudSavesLoaded, setCloudSavesLoaded] = useState(false);
  const [surveyCompletion, setSurveyCompletion] = useState<"loading" | "open" | "done">("loading");
  const [surveyStep, setSurveyStep] = useState(0);
  const [svDiscoverySource, setSvDiscoverySource] = useState("");
  const [svExperienceStage, setSvExperienceStage] = useState("");
  const [svCreateFriction, setSvCreateFriction] = useState("");
  const [svImmersionIssue, setSvImmersionIssue] = useState("");
  const [svCoreFunPoint, setSvCoreFunPoint] = useState("");
  const [svQuitReason, setSvQuitReason] = useState("");
  const [svTopFixOne, setSvTopFixOne] = useState("");
  const [svSaveLossConcern, setSvSaveLossConcern] = useState("");
  const [svRecommendWillingness, setSvRecommendWillingness] = useState("");
  const [svFinalSuggestion, setSvFinalSuggestion] = useState("");
  const [surveySubmitPending, setSurveySubmitPending] = useState(false);
  const [surveyNextHint, setSurveyNextHint] = useState(false);
  const [loginState, loginFormAction, loginPending] = useActionState(loginUser, INITIAL_AUTH_ACTION_STATE);
  const [registerState, registerFormAction, registerPending] = useActionState(registerUser, INITIAL_AUTH_ACTION_STATE);
  const surveyUrl = getPublicRuntimeConfig().surveyUrl;

  const analyticsIdentityRef = useRef<{ guestId: string | null; userAgent: string | null }>({
    guestId: user ? null : guestId,
    userAgent: null,
  });

  useEffect(() => {
    analyticsIdentityRef.current = {
      guestId: user ? null : guestId,
      userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
    };
  }, [user, guestId]);

  const trackHomeGameplayEvent = useCallback((input: Parameters<typeof trackGameplayEvent>[0]) => {
    return trackGameplayEvent({
      ...input,
      ...analyticsIdentityRef.current,
    });
  }, []);

  const surveyActorType = user ? "registered" : "guest";
  const buildSurveyEventPayload = useCallback(
    (payload: Record<string, unknown> = {}) => {
      const stepTotal = HOME_SURVEY_FLOW.length;
      const rawStep =
        typeof payload.stepIndex === "number"
          ? payload.stepIndex
          : typeof payload.fromStepIndex === "number"
            ? payload.fromStepIndex
            : -1;
      const stepIndex = Number.isFinite(rawStep) ? Math.max(-1, Math.min(stepTotal - 1, Math.trunc(rawStep))) : -1;
      const questionId =
        typeof payload.questionId === "string" && payload.questionId.trim()
          ? payload.questionId
          : stepIndex >= 0
            ? HOME_SURVEY_FLOW[stepIndex]?.id ?? "unknown"
            : "entry";
      const gid = analyticsIdentityRef.current.guestId ?? guestId ?? null;
      return {
        surveyKey: PRODUCT_SURVEY_KEY_HOME,
        surveyVersion: PRODUCT_SURVEY_VERSION_HOME,
        version: PRODUCT_SURVEY_VERSION_HOME,
        stepIndex,
        stepTotal,
        questionId,
        actorType: surveyActorType,
        guestId: gid ?? (surveyActorType === "registered" ? "registered_user" : "missing_guest"),
        ...payload,
      };
    },
    [guestId, surveyActorType]
  );

  const trackSurveyEvent = useCallback(
    (
      eventName: Parameters<typeof trackGameplayEvent>[0]["eventName"],
      payload: Record<string, unknown> = {},
      source = "survey_embedded"
    ) => {
      return trackHomeGameplayEvent({
        eventName,
        page: "/",
        source,
        payload: buildSurveyEventPayload(payload),
      });
    },
    [buildSurveyEventPayload, trackHomeGameplayEvent]
  );

  const localProgressInfo = useMemo(() => {
    const slots = saveSlots ?? {};
    const keys = Object.keys(slots);
    if (keys.length === 0) return { hasAny: false, bestSlotId: "" as string, bestUpdatedAt: "" as string | null };
    const candidates = keys
      .filter((id) => !id.startsWith("auto_"))
      .map((id) => {
        const s = slots[id];
        const updatedAt = s?.slotMeta?.updatedAt ?? null;
        const logCount = Array.isArray(s?.logs) ? s!.logs.length : 0;
        const time = s?.time ? `${s.time.day ?? 0}-${s.time.hour ?? 0}` : "";
        return { slotId: id, updatedAt, logCount, time };
      })
      .filter((x) => x.logCount > 0 || x.slotId === "main_slot");
    if (candidates.length === 0) return { hasAny: false, bestSlotId: "" as string, bestUpdatedAt: "" as string | null };
    const sorted = [...candidates].sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (tb !== ta) return tb - ta;
      return (b.logCount ?? 0) - (a.logCount ?? 0);
    });
    return { hasAny: true, bestSlotId: sorted[0]!.slotId, bestUpdatedAt: sorted[0]!.updatedAt ?? null };
  }, [saveSlots]);

  const resumeShadowSnapshot = useMemo(() => {
    void shadowTick;
    return readResumeShadowSnapshot();
  }, [shadowTick]);
  const resumeShadowSummary = useMemo(
    () => extractResumeShadowSummary(resumeShadowSnapshot),
    [resumeShadowSnapshot]
  );
  const hasPlayableResumeShadow = useMemo(
    () => isResumeShadowPlayable(resumeShadowSnapshot),
    [resumeShadowSnapshot]
  );

  const hasLocalAnySave = useMemo(() => Object.keys(saveSlots ?? {}).length > 0, [saveSlots]);
  const hasCloudAnySave = useMemo(
    () => cloudRows.length > 0,
    [cloudRows]
  );
  const playableLocalSaves = useMemo(() => {
    return Object.entries(saveSlots ?? {})
      .filter(([slotId, data]) => !slotId.startsWith("auto_") && slotHasPlayableLocal(data))
      .map(([slotId, data]) => ({
        slotId,
        data,
        updatedAt: extractHomeContinueSummaryFromPayload(data)?.updatedAtIso ?? null,
      }));
  }, [saveSlots]);
  const latestPlayableLocalSave = useMemo(() => {
    return [...playableLocalSaves].sort((a, b) => {
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      return tb - ta;
    })[0] ?? null;
  }, [playableLocalSaves]);

  function slotHasPlayableLocal(data: SaveSlotData | undefined): boolean {
    if (!data) return false;
    const logs = data.logs;
    if (Array.isArray(logs) && logs.length > 0) return true;
    return false;
  }

  const continueRows = useMemo(() => {
    const localEntries = Object.entries(saveSlots ?? {}).filter(([id]) => !id.startsWith("auto_"));
    const cloudBySlot = new Map(cloudRows.filter((r) => !r.slotId.startsWith("auto_")).map((r) => [r.slotId, r]));

    const slotIds = user
      ? new Set<string>(
          cloudRows.filter((r) => !r.slotId.startsWith("auto_")).map((r) => r.slotId)
        )
      : new Set<string>(localEntries.map(([id]) => id));

    const rows: Array<{
      slotId: string;
      tag: HomeContinueSourceTag;
      localSummary: HomeContinueSummary | null;
      cloudSummary: HomeContinueSummary | null;
      cloudUpdatedAt: string | null;
      displayUpdatedAt: string | null;
      localTs: number;
      cloudTs: number;
    }> = [];

    for (const slotId of slotIds) {
      const localData = saveSlots[slotId];
      const cloudRow = cloudBySlot.get(slotId) ?? null;
      const localOk = user ? !!localData : slotHasPlayableLocal(localData);

      if (!user) {
        if (!localOk) continue;
        const localSummary = localData ? extractHomeContinueSummaryFromPayload(localData) : null;
        rows.push({
          slotId,
          tag: "local",
          localSummary,
          cloudSummary: null,
          cloudUpdatedAt: null,
          displayUpdatedAt: localSummary?.updatedAtIso ?? null,
          localTs: localSummary?.updatedAtIso ? Date.parse(localSummary.updatedAtIso) : 0,
          cloudTs: 0,
        });
        continue;
      }

      if (user && !cloudRow) continue;
      if (!user && !localData) continue;
      const localSummary = localData ? extractHomeContinueSummaryFromPayload(localData) : null;
      const cloudSummary = cloudRow ? extractHomeContinueSummaryFromPayload(cloudRow.data) : null;
      const tag: HomeContinueSourceTag = user ? (localData ? "synced" : "cloud") : "local";
      const { localTs, cloudTs } = resolveHomeContinueTimestamps({
        localUpdatedAtIso: localSummary?.updatedAtIso,
        cloudUpdatedAt: cloudRow?.updatedAt,
        cloudUpdatedAtIso: cloudSummary?.updatedAtIso,
      });

      const displayUpdatedAt = user
        ? (cloudRow?.updatedAt ?? cloudSummary?.updatedAtIso ?? localSummary?.updatedAtIso ?? null)
        : (localSummary?.updatedAtIso ?? null);

      rows.push({
        slotId,
        tag,
        localSummary,
        cloudSummary,
        cloudUpdatedAt: cloudRow?.updatedAt ?? null,
        displayUpdatedAt,
        localTs,
        cloudTs,
      });
    }

    return rows.sort((a, b) => {
      const ta = a.displayUpdatedAt ? Date.parse(a.displayUpdatedAt) : 0;
      const tb = b.displayUpdatedAt ? Date.parse(b.displayUpdatedAt) : 0;
      return tb - ta;
    }).slice(0, MAX_VISIBLE_SAVE_SLOTS);
  }, [saveSlots, cloudRows, user]);

  const deleteTargetRow = useMemo(() => {
    const id = (deleteTargetSlotId ?? "").trim();
    if (!id) return null;
    return continueRows.find((r) => r.slotId === id) ?? null;
  }, [continueRows, deleteTargetSlotId]);

  const deleteTargetDisplay = useMemo(() => {
    if (!deleteTargetRow) return "";
    const rawLabel =
      (user ? deleteTargetRow.cloudSummary?.label : deleteTargetRow.localSummary?.label) ??
      deleteTargetRow.cloudSummary?.label ??
      deleteTargetRow.localSummary?.label ??
      (deleteTargetRow.slotId === "main_slot" ? "主线记录" : "未命名记录");
    const label = String(rawLabel ?? "").replaceAll("存档", "记录").replaceAll("进度", "记录");
    const tag = tagLabel(deleteTargetRow.tag);
    return `${label}（${tag}）`;
  }, [deleteTargetRow, user]);

  const entryState: EntryState = useMemo(() => {
    return resolveHomeEntryState({
      authed: !!user,
      localHasAny: localProgressInfo.hasAny || hasLocalAnySave,
      hasCloudAnySave,
      hasPlayableResumeShadow,
    });
  }, [user, localProgressInfo.hasAny, hasLocalAnySave, hasCloudAnySave, hasPlayableResumeShadow]);
  const canContinueFromHome = entryState === "guest_has_progress" || entryState === "authed_has_progress";

  useEffect(() => {
    if (homeViewTrackedRef.current) return;
    homeViewTrackedRef.current = true;
    void trackHomeGameplayEvent({
      eventName: "home_viewed",
      page: "/",
      source: "home",
      payload: {
        entryState,
        loggedIn: !!user,
        hasLocalProgress: localProgressInfo.hasAny || hasLocalAnySave || hasPlayableResumeShadow,
        hasCloud: hasCloudAnySave,
      },
    }).catch(() => {});
  }, [entryState, user, localProgressInfo.hasAny, hasLocalAnySave, hasCloudAnySave, hasPlayableResumeShadow, trackHomeGameplayEvent]);

  useEffect(() => {
    if (user) return;
    // 未登录时预取登录弹窗 chunk，避免首次点击“执笔 登录”出现可感知延迟。
    void import("@/components/home/HomeAuthModal").catch(() => {});
  }, [user]);

  useEffect(() => {
    const refreshShadow = () => setShadowTick((n) => n + 1);
    refreshShadow();
    window.addEventListener("focus", refreshShadow);
    window.addEventListener("pageshow", refreshShadow);
    return () => {
      window.removeEventListener("focus", refreshShadow);
      window.removeEventListener("pageshow", refreshShadow);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSurveyCompletion("loading");
    void getSurveyCompletionStatus({
      surveyKey: PRODUCT_SURVEY_KEY_HOME,
      guestId: guestId ?? null,
    })
      .then(({ completed }) => {
        if (cancelled) return;
        setSurveyCompletion(completed ? "done" : "open");
        if (completed) {
          try {
            localStorage.setItem(SURVEY_LOCAL_CACHE_KEY, "1");
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSurveyCompletion("open");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, guestId]);

  const resolvedContinueSlotId = useMemo(() => {
    if (continueRows.length === 0) return "";
    return continueRows[0]!.slotId;
  }, [continueRows]);

  const continuePickerSelectedRow = useMemo(() => {
    const id = continuePickerSelectedSlotId || resolvedContinueSlotId;
    return continueRows.find((r) => r.slotId === id) ?? null;
  }, [continuePickerSelectedSlotId, continueRows, resolvedContinueSlotId]);

  useEffect(() => {
    if (!continuePickerOpen) return;
    if (continueRows.length === 0) {
      setContinuePickerOpen(false);
      return;
    }

    const id = (continuePickerSelectedSlotId || resolvedContinueSlotId || "").trim();
    if (!id || !continueRows.some((r) => r.slotId === id)) {
      setContinuePickerSelectedSlotId(continueRows[0]!.slotId);
    }
  }, [continuePickerOpen, continueRows, continuePickerSelectedSlotId, resolvedContinueSlotId]);

  function formatShortUpdated(iso: string | null): string {
    if (!iso) return "时间未知";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "时间未知";
    try {
      return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
    } catch {
      return iso.slice(0, 16);
    }
  }

  function summarizeLine(sum: HomeContinueSummary | null): string {
    if (!sum) return "摘要暂缺";
    const loc = formatLocationLabel(sum.locationId);
    const prof = sum.professionLabel ? sum.professionLabel : "无";
    const tasks = Number.isFinite(sum.activeTasksCount) ? Math.max(0, Math.trunc(sum.activeTasksCount)) : 0;
    return `第 ${sum.day} 日 ${sum.hour} 时 · ${loc} · 未了事项 ${tasks} · 身份 ${prof}`;
  }

  function normalizeContinueLabel(label: string | null | undefined): string {
    const raw = typeof label === "string" ? label.trim() : "";
    if (!raw) return "记录";
    return raw.replaceAll("存档", "记录").replaceAll("进度", "记录");
  }

  function tagLabel(tag: HomeContinueSourceTag): string {
    switch (tag) {
      case "local":
        return "记录";
      case "cloud":
        return "记录";
      case "synced":
        return "记录";
      case "conflict":
        return "需裁定";
      default:
        return "";
    }
  }

  useEffect(() => {
    setUser(user ? { name: user.name } : null);
  }, [setUser, user]);

  useHeartbeat(!!user, guestId ?? undefined, "/");

  useEffect(() => {
    if (!user) {
      guestSaveCloudMigrationUserRef.current = null;
      setCloudRows([]);
      setCloudSavesLoaded(false);
      return;
    }
    setCloudSavesLoaded(false);
    void fetchCloudSaves()
      .then((rows) => setCloudRows((rows as SaveRow[]).slice(0, MAX_VISIBLE_SAVE_SLOTS)))
      .catch(() => setCloudRows([]))
      .finally(() => setCloudSavesLoaded(true));
  }, [user]);

  useEffect(() => {
    if (!user || !cloudSavesLoaded || guestSaveCloudMigrationUserRef.current === user.id) return;
    if (playableLocalSaves.length === 0) {
      guestSaveCloudMigrationUserRef.current = user.id;
      return;
    }

    const plans = planGuestLocalSaveCloudSync({
      localSaves: playableLocalSaves.map((row) => ({ slotId: row.slotId, updatedAtIso: row.updatedAt })),
      cloudSaves: cloudRows.map((row) => {
        const summary = extractHomeContinueSummaryFromPayload(row.data);
        return { slotId: row.slotId, updatedAt: row.updatedAt, updatedAtIso: summary?.updatedAtIso ?? null };
      }),
    });
    if (plans.length === 0) {
      guestSaveCloudMigrationUserRef.current = user.id;
      if (cloudRows.length > 0) setToast("云端记录更新，已保留本机记录。");
      return;
    }

    let cancelled = false;
    guestSaveCloudMigrationUserRef.current = user.id;
    void (async () => {
      let syncedCount = 0;
      for (const plan of plans) {
        if (cancelled) return;
        const local = playableLocalSaves.find((row) => row.slotId === plan.slotId);
        if (!local) continue;
        const res = await syncSaveToCloud(local.slotId, local.data).catch(() => ({ ok: false as const }));
        if (res.ok) syncedCount += 1;

        const autoSlotId = getHomeAutoSlotId(local.slotId);
        const autoData = saveSlots[autoSlotId];
        if (autoData) {
          await syncSaveToCloud(autoSlotId, autoData).catch(() => ({ ok: false as const }));
        }
      }

      const rows = await fetchCloudSaves().catch(() => []);
      if (cancelled) return;
      setCloudRows((rows as SaveRow[]).slice(0, MAX_VISIBLE_SAVE_SLOTS));
      if (syncedCount > 0) {
        setToast("本机记录已同步到云端。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, cloudSavesLoaded, cloudRows, playableLocalSaves, saveSlots]);

  useEffect(() => {
    if (!authWarn) return;
    const t = setTimeout(() => setAuthWarn(false), 1200);
    return () => clearTimeout(t);
  }, [authWarn]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get(AUTH_SUCCESS_QUERY_KEY);
    if (!flag) return;
    if (flag === "logged_in") setToast("已进入。");
    if (flag === "registered") setToast("档案已建立。");
    url.searchParams.delete(AUTH_SUCCESS_QUERY_KEY);
    router.replace(url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""));
  }, [router]);

  useEffect(() => {
    if (!feedbackSuccess || !surveyOpen) return;
    const t = window.setTimeout(() => {
      setSurveyOpen(false);
      setShowBugFeedback(false);
      setFeedbackSuccess(false);
      setFeedbackContent("");
    }, 3000);
    return () => window.clearTimeout(t);
  }, [surveyOpen, feedbackSuccess]);

  useEffect(() => {
    if (surveyEntryExposedTrackedRef.current) return;
    surveyEntryExposedTrackedRef.current = true;
    void trackSurveyEvent("survey_entry_exposed", { placement: "home_fab", stepIndex: -1, questionId: "entry" }, "survey").catch(() => {});
  }, [trackSurveyEvent]);

  useEffect(() => {
    if (!surveyOpen) return;
    void trackSurveyEvent(
      "survey_modal_opened",
      {
        mode: showBugFeedback ? "open_feedback" : "product_survey_embedded",
        surveyCompletion,
        stepIndex: -1,
        questionId: "modal",
      },
      "survey"
    ).catch(() => {});
  }, [surveyOpen, showBugFeedback, surveyCompletion, trackSurveyEvent]);

  useEffect(() => {
    if (!surveyOpen) return;
    if (showBugFeedback) return;
    if (surveyCompletion !== "open") return;
    if (surveyStartedTrackedRef.current) return;
    surveyStartedTrackedRef.current = true;
    void trackSurveyEvent("survey_started", { stepIndex: 0, questionId: HOME_SURVEY_FLOW[0]?.id ?? "unknown" }).catch(() => {});
  }, [surveyOpen, showBugFeedback, surveyCompletion, trackSurveyEvent]);

  useEffect(() => {
    if (!surveyOpen) return;
    if (showBugFeedback) return;
    if (surveyCompletion !== "open") return;
    const stepTotal = HOME_SURVEY_FLOW.length;
    const stepIndex = Math.max(0, Math.min(stepTotal - 1, surveyStep));
    const questionId = HOME_SURVEY_FLOW[stepIndex]?.id ?? "unknown";
    const pct = Math.round(((stepIndex + 1) / Math.max(1, stepTotal)) * 100);
    void trackSurveyEvent("survey_step_viewed", {
        stepIndex,
        questionId,
        progressPct: pct,
    }).catch(() => {});
  }, [surveyOpen, showBugFeedback, surveyCompletion, surveyStep, trackSurveyEvent]);

  function openAuthModal() {
    // Avoid side effects inside state updaters (prevents Router/render warnings in React).
    setAuthOpen(true);
    setIsConnecting(true);
    void trackHomeGameplayEvent({
      eventName: "home_auth_clicked",
      page: "/",
      source: "home_header",
      payload: {
        entryState,
        hasLocalProgress: localProgressInfo.hasAny || hasLocalAnySave,
        hasCloud: hasCloudAnySave,
        reason: localProgressInfo.hasAny || hasLocalAnySave ? "sync_local_progress" : "account_value",
      },
    }).catch(() => {});
    void trackHomeGameplayEvent({
      eventName: "auth_modal_opened",
      page: "/",
      source: "auth_modal",
      payload: { entryState },
    }).catch(() => {});
  }

  useEffect(() => {
    if (!isConnecting) return;
    const timer = window.setTimeout(() => setIsConnecting(false), 1200);
    return () => window.clearTimeout(timer);
  }, [isConnecting]);

  function closeAuthModal() {
    setAuthOpen(false);
    setIsConnecting(false);
    setAuthConsentUserAgreement(false);
    setAuthConsentPrivacyPolicy(false);
    setAuthMode("login");
    setAuthName("");
    setAuthPassword("");
    setNameCheck({ status: "idle", message: "" });
    setAuthFormNonce((n) => n + 1);
  }

  function switchAuthMode(mode: AuthMode) {
    setAuthMode(mode);
    void trackHomeGameplayEvent({
      eventName: "auth_mode_switched",
      page: "/",
      source: "auth_modal",
      payload: { mode },
    }).catch(() => {});
  }

  async function handleLogout() {
    await signOut({ redirect: false });
    setUser(null);
    setCloudRows([]);
    setCloudSavesLoaded(false);
    router.refresh();
  }

  async function openContinuePicker() {
    if (user && !cloudSavesLoaded) {
      setToast("正在读取云端记录…");
      return;
    }
    if (user && continueRows.length === 0 && latestPlayableLocalSave) {
      setToast("正在建立云端记录…");
      const syncRes = await syncSaveToCloud(latestPlayableLocalSave.slotId, latestPlayableLocalSave.data).catch(() => ({ ok: false as const }));
      if (syncRes.ok) {
        const autoSlotId = getHomeAutoSlotId(latestPlayableLocalSave.slotId);
        const autoData = saveSlots[autoSlotId];
        if (autoData) {
          await syncSaveToCloud(autoSlotId, autoData).catch(() => ({ ok: false as const }));
        }
        const rows = await fetchCloudSaves().catch(() => []);
        const nextRows = (rows as SaveRow[]).slice(0, MAX_VISIBLE_SAVE_SLOTS);
        setCloudRows(nextRows);
        if (nextRows.length > 0) {
          setContinuePickerSelectedSlotId(nextRows[0]!.slotId);
          setContinuePickerOpen(true);
          return;
        }
      }
      setToast("云端记录建立失败，请稍后再试。");
      return;
    }
    if (continueRows.length === 0) {
      if (hasPlayableResumeShadow) {
        void handleContinueAdventure("__resume_shadow__");
      } else {
        void handleContinueAdventure("");
      }
      return;
    }
    setContinuePickerSelectedSlotId(resolvedContinueSlotId || continueRows[0]?.slotId || "");
    setContinuePickerOpen(true);
  }

  async function handleContinueAdventure(slotIdOverride?: string) {
    unlockBgmOnUserGesture();
    const slotId = (slotIdOverride ?? "").trim() || resolvedContinueSlotId;
    const row = continueRows.find((r) => r.slotId === slotId) ?? null;
    const useShadowFallback = shouldUseResumeShadowFallback({
      slotId,
      rowExists: !!row,
      hasPlayableResumeShadow,
    });

    void trackHomeGameplayEvent({
      eventName: "home_continue_clicked",
      page: "/",
      source: "home_continue",
      payload: {
        slotId: slotId || null,
        userLoggedIn: !!user,
        tag: useShadowFallback ? "resume_shadow" : (row?.tag ?? null),
        resumeShadowUpdatedAt: useShadowFallback ? (resumeShadowSummary?.updatedAtIso ?? null) : null,
      },
    }).catch(() => {});

    if (useShadowFallback) {
      const ok = hydrateFromResumeShadow();
      if (ok) {
        router.push("/play");
        return;
      }
      setToast(homeRecoveryFallbackToast());
      return;
    }

    if (!slotId || !row) {
      if (!user) {
        const localSlot = localProgressInfo.bestSlotId || "main_slot";
        if (saveSlots[localSlot]) {
          loadGame(localSlot);
          router.push("/play");
          return;
        }
      }
      if (hasPlayableResumeShadow && hydrateFromResumeShadow()) {
        router.push("/play");
        return;
      }
      resetForNewGame();
      router.push("/intro");
      return;
    }

    if (!user) {
      if (saveSlots[slotId]) {
        loadGame(slotId);
        router.push("/play");
        return;
      }
      resetForNewGame();
      router.push("/intro");
      return;
    }

    void trackHomeGameplayEvent({
      eventName: "home_continue_resolved",
      page: "/",
      source: "home_continue",
      payload: { slotId, tag: row.tag },
    }).catch(() => {});

    if (user) {
      const cr = cloudRows.find((c) => c.slotId === slotId);
      if (!cr || !isSaveSlotData(cr.data)) {
        setToast("云端记录不可用。");
        return;
      }
      hydrateFromCloud(slotId, cr.data);
      router.push("/play");
      return;
    }

    if (saveSlots[slotId]) {
      loadGame(slotId);
      router.push("/play");
      return;
    }

    const cr = cloudRows.find((c) => c.slotId === slotId);
    if (cr && isSaveSlotData(cr.data)) {
      hydrateFromCloud(slotId, cr.data);
      router.push("/play");
      return;
    }

    setToast(homeContinueUnavailableToast());
  }

  async function handleSurveySubmit() {
    const submitStepIndex = Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep));
    void trackSurveyEvent("survey_submit_attempted", {
      stepIndex: submitStepIndex,
      questionId: HOME_SURVEY_FLOW[submitStepIndex]?.id ?? "unknown",
    }).catch(() => {});

    if (!surveyConsentUserAgreement || !surveyConsentPrivacyPolicy) {
      void trackSurveyEvent("survey_submit_failed", {
        stepIndex: submitStepIndex,
        questionId: HOME_SURVEY_FLOW[submitStepIndex]?.id ?? "unknown",
        reason: "missing_consent",
      }).catch(() => {});
      setToast("请先勾选用户协议与隐私政策。");
      return;
    }
    if (
      !svDiscoverySource ||
      !svExperienceStage ||
      !svCreateFriction ||
      !svImmersionIssue ||
      !svCoreFunPoint ||
      !svQuitReason ||
      !svTopFixOne.trim() ||
      !svSaveLossConcern ||
      !svRecommendWillingness
    ) {
      void trackSurveyEvent("survey_submit_failed", {
        stepIndex: submitStepIndex,
        questionId: HOME_SURVEY_FLOW[submitStepIndex]?.id ?? "unknown",
        reason: "required_answer_missing",
      }).catch(() => {});
      setToast("请把本问卷必答题补全后再提交。");
      return;
    }
    setSurveySubmitPending(true);
    const result = await submitProductSurvey({
      surveyKey: PRODUCT_SURVEY_KEY_HOME,
      surveyVersion: PRODUCT_SURVEY_VERSION_HOME,
      guestId: guestId ?? null,
      source: "home_footer_modal",
      answers: {
        discoverySource: svDiscoverySource,
        experienceStage: svExperienceStage,
        createFriction: svCreateFriction,
        immersionIssue: svImmersionIssue,
        coreFunPoint: svCoreFunPoint,
        quitReason: svQuitReason,
        topFixOne: svTopFixOne.trim(),
        saveLossConcern: svSaveLossConcern,
        recommendWillingness: svRecommendWillingness,
        finalSuggestion: svFinalSuggestion.trim(),
      },
      freeText: `${svTopFixOne.trim()}\n\n${svFinalSuggestion.trim()}`.trim(),
      // 后端结构仍要求 overallRating；本轮问卷已移除“1-5满意度”题，
      // 此处给中性默认值，避免类型与校验问题。
      overallRating: 3,
      recommendScore: null,
      contactIntent: svRecommendWillingness === "very_willing" || svRecommendWillingness === "quite_willing",
      consent: {
        userAgreement: surveyConsentUserAgreement,
        privacyPolicy: surveyConsentPrivacyPolicy,
      },
      clientMeta: {
        entryState,
        page: "/",
        userLoggedIn: !!user,
        actorType: surveyActorType,
        guestId: analyticsIdentityRef.current.guestId ?? guestId ?? (surveyActorType === "registered" ? "registered_user" : "missing_guest"),
        platform: typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
      },
    });
    setSurveySubmitPending(false);
    if (!result.success) {
      void trackSurveyEvent("survey_submit_failed", {
        stepIndex: submitStepIndex,
        questionId: HOME_SURVEY_FLOW[submitStepIndex]?.id ?? "unknown",
        reason: "server_rejected",
        message: result.message,
      }).catch(() => {});
      setToast(result.message);
      return;
    }
    void trackSurveyEvent("survey_submitted", {
      stepIndex: HOME_SURVEY_FLOW.length - 1,
      questionId: "submit",
      completedStepCount: HOME_SURVEY_FLOW.length,
    }).catch(() => {});
    setSurveyCompletion("done");
    try {
      localStorage.setItem(SURVEY_LOCAL_CACHE_KEY, "1");
    } catch {
      /* ignore */
    }
    setToast("问卷已提交，感谢你的时间。");
  }

  async function handleFeedbackSubmit() {
    void trackHomeGameplayEvent({
      eventName: "feedback_submit_attempted",
      page: "/",
      source: "open_feedback",
      payload: { entryState, userLoggedIn: !!user },
    }).catch(() => {});
    if (!feedbackContent.trim()) {
      setToast("请先输入你的意见。");
      return;
    }

    if (!feedbackConsentUserAgreement || !feedbackConsentPrivacyPolicy) {
      setToast("请先勾选用户协议与隐私政策后再提交。");
      return;
    }

    setFeedbackPending(true);
    const result = await submitFeedback(
      feedbackContent,
      {
        userAgreement: feedbackConsentUserAgreement,
        privacyPolicy: feedbackConsentPrivacyPolicy,
      },
      {
        guestId: guestId ?? null,
        clientMeta: { entryState, page: "/", channel: "open_feedback_modal" },
      }
    );
    setFeedbackPending(false);
    if (!result.success) {
      void trackHomeGameplayEvent({
        eventName: "feedback_submit_failed",
        page: "/",
        source: "open_feedback",
        payload: { message: result.message },
      }).catch(() => {});
      setToast(result.message);
      return;
    }
    setFeedbackSuccess(true);
    setFeedbackContent("");
  }

  function openSurveyEntry() {
    setSurveyOpen(true);
    setShowBugFeedback(false);
    setFeedbackSuccess(false);
    setFeedbackConsentUserAgreement(false);
    setFeedbackConsentPrivacyPolicy(false);
    setSurveyConsentUserAgreement(false);
    setSurveyConsentPrivacyPolicy(false);
    setSurveyStep(0);
    void trackSurveyEvent("survey_entry_clicked", { placement: "home_fab", stepIndex: -1, questionId: "entry" }, "survey").catch(() => {});
  }

  function openFooterFeedback() {
    setSurveyOpen(true);
    setShowBugFeedback(true);
    setFeedbackSuccess(false);
    setFeedbackContent("");
    setFeedbackConsentUserAgreement(false);
    setFeedbackConsentPrivacyPolicy(false);
    setSurveyConsentUserAgreement(false);
    setSurveyConsentPrivacyPolicy(false);
    setSurveyStep(0);
  }

  function closeSurveyModal() {
    if (feedbackPending) return;
    if (surveyOpen && surveyCompletion === "open" && !showBugFeedback) {
      const stepTotal = HOME_SURVEY_FLOW.length;
      const stepIndex = Math.max(0, Math.min(stepTotal - 1, surveyStep));
      const questionId = HOME_SURVEY_FLOW[stepIndex]?.id ?? "unknown";
      void trackSurveyEvent("survey_exit", { stepIndex, questionId, reason: "modal_close" }).catch(() => {});
    }
    setSurveyOpen(false);
    setShowBugFeedback(false);
    setFeedbackSuccess(false);
  }

  function openExternalSurvey() {
    if (!surveyUrl) {
      setToast(SURVEY_COPY.noLink);
      return;
    }
    if (!surveyConsentUserAgreement || !surveyConsentPrivacyPolicy) {
      setToast("请先勾选用户协议与隐私政策后再打开外链。");
      return;
    }
    window.open(surveyUrl, "_blank", "noopener,noreferrer");
    void trackSurveyEvent("survey_external_link_opened", { mode: "external_backup", hasUrl: true, stepIndex: -1, questionId: "external_link" }, "survey").catch(() => {});
  }

  const authPending = loginPending || registerPending;
  const activeAuthState = authMode === "login" ? loginState : registerState;
  const activeAuthAction = authMode === "login" ? loginFormAction : registerFormAction;
  const activeAuthError = authClientError || activeAuthState.error || "";

  function validateAuthFormBeforeSubmit(): string | null {
    const name = authName.trim();
    if (!name) return "请先填写笔名。";
    if (name.length < 2) return "笔名至少 2 个字符。";
    if (!authPassword) return "请先填写密码。";
    if (authPassword.length < 6) return "密码至少 6 位。";
    if (!authConsentUserAgreement || !authConsentPrivacyPolicy) return "请先勾选用户协议与隐私政策。";
    return null;
  }

  function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    const error = validateAuthFormBeforeSubmit();
    if (error) {
      event.preventDefault();
      setAuthClientError(error);
      void trackHomeGameplayEvent({
        eventName: "auth_submit_failed",
        page: "/",
        source: "auth_modal",
        payload: { mode: authMode, error, clientSide: true },
      }).catch(() => {});
      return;
    }
    setAuthClientError("");
    void trackHomeGameplayEvent({
      eventName: "auth_submit_attempted",
      page: "/",
      source: "auth_modal",
      payload: { mode: authMode },
    }).catch(() => {});
  }

  useEffect(() => {
    const msg = activeAuthState?.error?.trim() || "";
    if (!msg) return;
    const last = authErrorTrackedRef.current;
    if (last && last.mode === authMode && last.msg === msg) return;
    authErrorTrackedRef.current = { mode: authMode, msg };
    void trackHomeGameplayEvent({
      eventName: "auth_submit_failed",
      page: "/",
      source: "auth_modal",
      payload: { mode: authMode, error: msg },
    }).catch(() => {});
  }, [activeAuthState?.error, authMode, trackHomeGameplayEvent]);

  useEffect(() => {
    setAuthClientError("");
  }, [authMode, authName, authPassword, authConsentUserAgreement, authConsentPrivacyPolicy]);

  function getSurveyValue(id: HomeSurveyQuestionId): string {
    switch (id) {
      case "discoverySource":
        return svDiscoverySource;
      case "experienceStage":
        return svExperienceStage;
      case "createFriction":
        return svCreateFriction;
      case "immersionIssue":
        return svImmersionIssue;
      case "coreFunPoint":
        return svCoreFunPoint;
      case "quitReason":
        return svQuitReason;
      case "topFixOne":
        return svTopFixOne;
      case "saveLossConcern":
        return svSaveLossConcern;
      case "recommendWillingness":
        return svRecommendWillingness;
      case "finalSuggestion":
        return svFinalSuggestion;
      default:
        return "";
    }
  }

  function setSurveyValue(id: HomeSurveyQuestionId, value: string) {
    switch (id) {
      case "discoverySource":
        setSvDiscoverySource(value);
        return;
      case "experienceStage":
        setSvExperienceStage(value);
        return;
      case "createFriction":
        setSvCreateFriction(value);
        return;
      case "immersionIssue":
        setSvImmersionIssue(value);
        return;
      case "coreFunPoint":
        setSvCoreFunPoint(value);
        return;
      case "quitReason":
        setSvQuitReason(value);
        return;
      case "topFixOne":
        setSvTopFixOne(value);
        return;
      case "saveLossConcern":
        setSvSaveLossConcern(value);
        return;
      case "recommendWillingness":
        setSvRecommendWillingness(value);
        return;
      case "finalSuggestion":
        setSvFinalSuggestion(value);
        return;
      default:
        return;
    }
  }

  const totalSteps = HOME_SURVEY_FLOW.length;
  const safeStep = Math.max(0, Math.min(totalSteps - 1, surveyStep));
  const curQ = HOME_SURVEY_FLOW[safeStep]!;
  const progressPct = Math.round(((safeStep + 1) / totalSteps) * 100);

  function canGoNext(): boolean {
    if (curQ.kind === "text") return curQ.required ? getSurveyValue(curQ.id).trim().length > 0 : true;
    return getSurveyValue(curQ.id) !== "";
  }

  function handleSurveyStepPrev() {
    const fromStepIndex = Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep));
    void trackSurveyEvent("survey_step_prev", {
      stepIndex: fromStepIndex,
      fromStepIndex,
      toStepIndex: Math.max(0, fromStepIndex - 1),
      questionId: HOME_SURVEY_FLOW[fromStepIndex]?.id ?? "unknown",
    }).catch(() => {});
    setSurveyStep((s) => Math.max(0, s - 1));
  }

  function handleSurveyStepNext() {
    if (!canGoNext()) {
      setSurveyNextHint(true);
      window.setTimeout(() => setSurveyNextHint(false), 1600);
      return;
    }
    setSurveyNextHint(false);
    const fromStepIndex = Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep));
    void trackSurveyEvent("survey_step_next", {
      stepIndex: fromStepIndex,
      fromStepIndex,
      toStepIndex: Math.min(totalSteps - 1, fromStepIndex + 1),
      questionId: HOME_SURVEY_FLOW[fromStepIndex]?.id ?? "unknown",
    }).catch(() => {});
    setSurveyStep((s) => Math.min(totalSteps - 1, s + 1));
  }

  useEffect(() => {
    if (!authOpen) return;
    // When switching mode or reopening, clear transient backend errors from previous submission.
    setAuthFormNonce((n) => n + 1);
  }, [authMode, authOpen]);

  useEffect(() => {
    if (!authOpen) return;
    if (authMode !== "register") return;
    const name = authName.trim();
    if (name.length < 2) {
      setNameCheck({ status: "idle", message: "" });
      return;
    }
    let cancelled = false;
    setNameCheck({ status: "checking", message: "校验中..." });
    const t = window.setTimeout(() => {
      void checkNameAvailability({ name })
        .then((res) => {
          if (cancelled) return;
          if (!res.ok) {
            setNameCheck({ status: "error", message: res.message });
            return;
          }
          if (res.available) setNameCheck({ status: "ok", message: "可用" });
          else setNameCheck({ status: "taken", message: "已被占用" });
        })
        .catch(() => {
          if (cancelled) return;
          setNameCheck({ status: "error", message: "暂时无法校验" });
        });
    }, 380);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [authMode, authName, authOpen]);

  return (
    <>
      <VerseCraftPaperFrame
        dataTestId="home-paper-page"
        fixedViewport
        maxWidthClassName="max-w-[470px] lg:max-w-[640px]"
        contentClassName="pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-[max(0.85rem,env(safe-area-inset-top))] sm:pb-[max(0.95rem,env(safe-area-inset-bottom))] sm:pt-[max(1.65rem,env(safe-area-inset-top))]"
      >
        <header className="relative z-20 flex w-full items-center justify-between gap-4">
          <VerseCraftPaperBrand
            text="VERSECRAFT"
            className="gap-2"
            markClassName="h-10 w-10"
            textClassName="text-[14px] tracking-[0.04em]"
          />

          <div className="flex items-center gap-3">
            {!user ? (
              <button
                type="button"
                onClick={openAuthModal}
                aria-label="登录或注册"
                className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-vc-line bg-vc-paper-raised/90 px-5 vc-reading-serif text-[15px] font-semibold leading-none tracking-[0.02em] text-vc-ink shadow-[0_10px_22px_rgba(62,72,68,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-vc-paper-bright active:scale-[0.97] ${
                  authWarn ? "ring-2 ring-red-500/70" : ""
                }`}
              >
                执笔　登录
              </button>
            ) : null}
          </div>
        </header>

        <div className="relative z-20 mt-3 w-full sm:mt-5">
          {user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-vc-ink-soft">
                  <span className="max-w-[260px] truncate rounded-full border border-vc-line bg-vc-paper-raised/90 px-3 py-1 text-sm font-bold text-vc-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                    {user.name}
                  </span>
                  <span className="rounded-full bg-vc-paper-raised/75 px-2.5 py-1 text-[11px] font-medium text-vc-ink-soft">
                    已登录
                  </span>
                  <span className="rounded-full bg-vc-paper-raised/75 px-2.5 py-1 text-[11px] font-medium text-vc-ink-soft">
                    可跨设备继续
                  </span>
                  <span className="rounded-full bg-vc-paper-raised/75 px-2.5 py-1 text-[11px] font-medium text-vc-ink-soft">
                    云 {hasCloudAnySave ? `${cloudRows.length}` : "0"}
                  </span>
                  <span className="rounded-full bg-vc-paper-raised/75 px-2.5 py-1 text-[11px] font-medium text-vc-ink-soft">
                    本地 {hasLocalAnySave ? `${Object.keys(saveSlots ?? {}).length}` : "0"}
                  </span>
                  <span className="rounded-full bg-vc-paper-raised/75 px-2.5 py-1 text-[11px] font-medium text-vc-ink-soft">
                    问卷 {surveyCompletion === "done" ? "已提交" : "未提交"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full border border-vc-line bg-vc-paper-raised/85 px-5 py-2.5 text-sm font-semibold text-vc-ink transition hover:bg-vc-paper-bright"
                >
                  退出
                </button>
              </div>
            </div>
          ) : (
            canContinueFromHome ? (
              <div className="vc-reading-serif w-full whitespace-nowrap text-center text-[clamp(13px,3.8vw,18px)] leading-none text-vc-ink">
                本机留有可继续的记录。
              </div>
            ) : null
          )}
        </div>

        {authOpen && (
          <HomeAuthModal
            authMode={authMode}
            authFormNonce={authFormNonce}
            authName={authName}
            authPassword={authPassword}
            authConsentUserAgreement={authConsentUserAgreement}
            authConsentPrivacyPolicy={authConsentPrivacyPolicy}
            nameCheck={nameCheck}
            authPending={authPending}
            activeAuthState={activeAuthState}
            activeAuthAction={activeAuthAction}
            activeAuthError={activeAuthError}
            onClose={closeAuthModal}
            onSwitchMode={switchAuthMode}
            onNameChange={setAuthName}
            onPasswordChange={setAuthPassword}
            onConsentUserAgreementChange={setAuthConsentUserAgreement}
            onConsentPrivacyPolicyChange={setAuthConsentPrivacyPolicy}
            onSubmit={handleAuthSubmit}
          />
        )}

      {toast && (
        <div className="pointer-events-none fixed right-8 top-24 z-50 rounded-[18px] border border-vc-seal/45 bg-vc-paper-bright px-4 py-3 text-sm font-medium text-vc-seal shadow-[0_12px_28px_rgba(164,67,60,0.18)] animate-[fadeIn_0.35s_ease-out]">
          {toast}
        </div>
      )}

      <section className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center text-center">
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="animate-fade-in-up mx-auto mt-[clamp(1.45rem,5.1svh,3.9rem)] max-w-2xl">
            <h1 className="vc-reading-serif text-[clamp(2.85rem,13.2vw,3.625rem)] font-semibold leading-none text-[#0f4644] sm:text-[66px] lg:text-[84px]">
              文界工坊
            </h1>
            <p className="vc-reading-serif mt-[clamp(0.85rem,2.8svh,1.35rem)] text-[clamp(0.85rem,3.2vw,1rem)] leading-none tracking-[0.42em] text-vc-ink-soft">
              以字为契，入梦为章
            </p>
            <VerseCraftPaperDivider className="mx-auto mt-[clamp(1rem,3.4svh,1.75rem)] w-[13.6rem]" />
          </div>

          <div className="mx-auto mt-[clamp(1.7rem,5.6svh,4rem)] w-full max-w-[400px]">
            <div className="mx-auto flex w-full flex-col items-stretch justify-center gap-[clamp(0.7rem,2.2svh,1.15rem)]">
              <VerseCraftPaperPillButton
                type="button"
                tone="ink"
                data-testid="home-start-new-button"
                className="animate-fade-in-up min-h-[54px] text-[19px] sm:min-h-[58px] sm:text-[21px]"
                style={{ animationDelay: "80ms" }}
                aria-busy={isStartNewPending || undefined}
                onClick={() => {
                  if (isStartNewPending) return;
                  unlockBgmOnUserGesture();
                  void trackHomeGameplayEvent({
                    eventName: "home_start_new_clicked",
                    page: "/",
                    source: "home_start_new",
                    payload: { entryState, loggedIn: !!user },
                  }).catch(() => {});
                  resetForNewGame();
                  // useTransition 跟踪导航挂起态：点击立刻有反馈，且防止重复触发 reset
                  startNewGameTransition(() => {
                    router.push("/intro");
                  });
                }}
              >
                <span>{isStartNewPending ? "落笔启程…" : "开始新篇"}</span>
                <span className="text-vc-paper-bright/70" aria-hidden>
                  {isStartNewPending ? (
                    <Loader2 size={20} strokeWidth={2.2} className="animate-spin" />
                  ) : (
                    "→"
                  )}
                </span>
              </VerseCraftPaperPillButton>

              {canContinueFromHome ? (
                <VerseCraftPaperPillButton
                  type="button"
                  data-testid="home-continue-button"
                  className="animate-fade-in-up min-h-[54px] text-[19px] sm:min-h-[58px] sm:text-[21px]"
                  style={{ animationDelay: "160ms" }}
                  onClick={openContinuePicker}
                >
                  <span>{homeContinuePrimaryCta()}</span>
                  <span className="text-vc-ink-faint" aria-hidden>
                    →
                  </span>
                </VerseCraftPaperPillButton>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center bg-[#f2eee7]/62 p-4 transition-all duration-500 sm:p-6 ${
          continuePickerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`absolute inset-0 bg-[#efe8dd]/30 transition-all duration-500 ${
            continuePickerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setContinuePickerOpen(false)}
        />
        <div
          data-testid="home-continue-record-modal"
          className={`relative w-full max-w-[760px] rounded-[24px] border border-[#d7ccbd] bg-vc-paper-bright/96 p-[clamp(1.4rem,3vw,2.75rem)] text-[#0f5a52] shadow-[0_26px_76px_rgba(76,61,42,0.22),inset_0_0_0_8px_rgba(248,243,235,0.96),inset_0_0_0_9px_rgba(218,207,191,0.7),inset_0_0_0_20px_rgba(255,253,248,0.9),inset_0_0_0_21px_rgba(226,216,200,0.62)] transition-all duration-500 sm:rounded-[32px] ${
            continuePickerOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-left">
              <h3 className="vc-reading-serif text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-none tracking-normal text-[#0f5a52]">
                选择要继续的记录
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setContinuePickerOpen(false)}
              className="vc-reading-serif shrink-0 rounded-full border border-[#d6cabb] bg-vc-paper-bright px-6 py-2.5 text-[clamp(0.95rem,1.4vw,1.15rem)] text-[#0f5a52] shadow-[0_5px_14px_rgba(78,63,47,0.12)] transition hover:bg-white"
            >
              关闭
            </button>
          </div>

          <div className="mt-[clamp(1.25rem,3vw,2.25rem)] max-h-[52vh] space-y-3 overflow-y-auto text-left pr-1">
            {continueRows.map((r) => {
              const sum = user ? (r.cloudSummary ?? r.localSummary) : (r.localSummary ?? r.cloudSummary);
              const line = summarizeLine(sum);
              const upd = formatShortUpdated(r.displayUpdatedAt);
              const selected = (continuePickerSelectedSlotId || resolvedContinueSlotId) === r.slotId;
              return (
                <div
                  key={r.slotId}
                  onClick={() => setContinuePickerSelectedSlotId(r.slotId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setContinuePickerSelectedSlotId(r.slotId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  data-testid="home-continue-record-row"
                  className={`w-full rounded-[16px] border px-[clamp(0.9rem,2.2vw,1.5rem)] py-[clamp(0.85rem,1.6vw,1.25rem)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f5a52]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-vc-paper-bright ${
                    selected
                      ? "border-[#0f5a52] bg-[#edf4ef] text-[#0f5a52] shadow-[inset_0_0_0_1px_rgba(15,90,82,0.1)]"
                      : "border-[#d8d0c4] bg-vc-paper-bright/84 text-[#0f5a52] hover:border-[#0f5a52]/55 hover:bg-[#f7fbf6]"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="vc-reading-serif text-[clamp(1.15rem,2vw,1.45rem)] font-semibold leading-none">
                        {normalizeContinueLabel(sum?.label ?? r.slotId)}
                      </div>
                      <div className="vc-reading-serif mt-2 text-[clamp(0.9rem,1.4vw,1.1rem)] leading-none text-[#0f5a52]">{line}</div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end sm:gap-6">
                      <div className="vc-reading-serif whitespace-nowrap text-[clamp(0.85rem,1.2vw,1rem)] text-[#0f5a52]">
                        更新 {upd}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTargetSlotId(r.slotId);
                          setDeleteConfirmOpen(true);
                        }}
                        data-testid="home-continue-delete-button"
                        className="vc-reading-serif rounded-full border border-[#d6cabb] bg-vc-paper-bright px-4 py-1.5 text-[clamp(0.85rem,1.2vw,1rem)] font-semibold text-[#0f5a52] shadow-[0_4px_12px_rgba(78,63,47,0.1)] transition hover:border-[#0f5a52]/45 hover:bg-white"
                        aria-label={`删除记录 ${sum?.label ?? r.slotId}`}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-[clamp(1.6rem,4vw,3rem)] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            <button
              type="button"
              onClick={() => setContinuePickerOpen(false)}
              className="vc-reading-serif rounded-full border border-[#d8d0c4] bg-vc-paper-bright px-7 py-2.5 text-[clamp(0.95rem,1.4vw,1.15rem)] font-semibold text-[#0f5a52] shadow-[0_5px_14px_rgba(78,63,47,0.1)] transition hover:bg-white"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="home-continue-confirm-button"
              disabled={!continuePickerSelectedRow}
              onClick={() => {
                const id = continuePickerSelectedSlotId || resolvedContinueSlotId;
                setContinuePickerOpen(false);
                void handleContinueAdventure(id);
              }}
              className="vc-reading-serif rounded-full border border-vc-ink-deep bg-vc-ink-deep px-9 py-2.5 text-[clamp(0.95rem,1.4vw,1.15rem)] font-semibold text-vc-paper-bright shadow-[0_12px_24px_rgba(13,63,57,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] transition hover:bg-vc-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              继续行动 →
            </button>
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[75] flex items-center justify-center p-6 transition-all duration-300 ${
          deleteConfirmOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`absolute inset-0 bg-[#efe8dd]/72 transition-all duration-300 ${
            deleteConfirmOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDeleteConfirmOpen(false)}
        />
        <div
          className={`relative w-full max-w-md rounded-[1.75rem] border border-vc-line-warm bg-[#fbf7f0]/98 p-6 text-vc-ink vc-shadow-modal transition-all duration-300 ${
            deleteConfirmOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="text-left">
            <div className="text-sm font-semibold tracking-widest text-[#0d5a4e]">确认抹除记录？</div>
            <p className="mt-2 text-xs leading-relaxed text-[#4f625c]">
              {user ? "将同时抹除本机与云端（含自动记录）。" : "将抹除本机记录（游客模式无云端）。"}
            </p>
            <p className="mt-3 rounded-xl border border-vc-line-warm bg-vc-paper-bright/80 px-3 py-2 text-xs text-[#4f625c]">
              目标：
              <span className="ml-2 font-semibold text-[#0d5a4e]">
                {deleteTargetDisplay || (deleteTargetSlotId ? "该记录" : "—")}
              </span>
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="rounded-full border border-vc-line-warm bg-vc-paper-bright px-5 py-2.5 text-sm font-semibold text-vc-ink hover:bg-[#f8f2e8]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={async () => {
                const slotId = deleteTargetSlotId;
                setDeleteConfirmOpen(false);
                setDeleteTargetSlotId("");
                if (!slotId) return;

                const autoId = slotId === "main_slot" ? "auto_main" : `auto_${slotId}`;
                setCloudRows((prev) => prev.filter((r) => r.slotId !== slotId && r.slotId !== autoId));
                useGameStore.getState().deleteSaveSlot(slotId);
                useGameStore.getState().deleteSaveSlot(autoId);
                if ((continuePickerSelectedSlotId || resolvedContinueSlotId) === slotId) {
                  setContinuePickerSelectedSlotId("");
                }
                if (user) {
                  await deleteCloudSaveSlot(slotId).catch(() => undefined);
                  await deleteCloudSaveSlot(autoId).catch(() => undefined);
                }
              }}
              className="rounded-full bg-[#8c2f2f] px-5 py-2.5 text-sm font-semibold text-vc-paper-bright transition hover:bg-[#743030]"
            >
              确认删除
            </button>
          </div>
        </div>
      </div>

      <VerseCraftPaperDivider className="relative z-20 mt-[clamp(0.9rem,3.2svh,2.5rem)]" />

      <footer className="relative z-20 w-full pt-[clamp(0.7rem,2.6svh,1.75rem)] vc-reading-serif text-vc-ink" style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}>
        <div className="text-xs">
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-2">
            <div className="flex min-w-0 items-center justify-self-start">
              <FooterHaloLinkButton href="/history" ariaLabel="打开历史记录">
                <Trophy size={22} strokeWidth={2.1} />
              </FooterHaloLinkButton>
            </div>
            <div className="justify-self-center whitespace-nowrap text-center text-[16px] text-vc-ink">
              QQ群 <span className="font-mono">377493954</span>
            </div>
            <div className="flex justify-self-end">
              <FooterHaloIconButton onClick={openSurveyEntry} ariaLabel="产品问卷" tone="blue">
                <BulbIconSvg />
              </FooterHaloIconButton>
            </div>
          </div>

          <div
            className="mt-[clamp(0.85rem,2.7svh,1.75rem)] flex w-full items-center justify-between gap-x-2 whitespace-nowrap text-[12px] text-vc-ink/88 sm:flex-wrap sm:justify-center sm:gap-x-4 sm:text-[15px]"
          >
            <Link className="hover:text-[#0f3c3a]" href="/legal/user-agreement">
              用户协议
            </Link>
            <Link className="hover:text-[#0f3c3a]" href="/legal/privacy-policy">
              隐私政策
            </Link>
            <Link className="hover:text-[#0f3c3a]" href="/legal/contact">
              联系我们
            </Link>
            <button
              type="button"
              onClick={openFooterFeedback}
              className="hover:text-[#0f3c3a]"
            >
              阅读反馈 / 举报
            </button>
            <Link className="hover:text-[#0f3c3a]" href="/legal/content-policy">
              内容规范
            </Link>
          </div>

          <div className="mt-2 text-center text-[11px] text-vc-ink/78 sm:mt-3 sm:text-[12px]">
            {(() => {
              const c = getPublicRuntimeConfig().compliance;
              const beianNumber = (c.beianNumber ?? "").trim();
              const beianUrl = (c.beianUrl ?? "").trim();
              if (!beianNumber) return <span className="text-vc-ink/45">—</span>;
              return (
                <a
                  className="text-vc-ink/78 underline underline-offset-4 decoration-vc-line transition hover:text-[#0f3c3a]"
                  href={beianUrl || "https://beian.miit.gov.cn"}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {beianNumber}
                </a>
              );
            })()}
          </div>
        </div>
      </footer>

      <HomeSurveyModal
        open={surveyOpen}
        onClose={closeSurveyModal}
        showBugFeedback={showBugFeedback}
        onShowBugFeedback={setShowBugFeedback}
        surveyCompletion={surveyCompletion}
        question={curQ}
        safeStep={safeStep}
        totalSteps={totalSteps}
        progressPct={progressPct}
        getSurveyValue={getSurveyValue}
        setSurveyValue={setSurveyValue}
        surveyConsentUserAgreement={surveyConsentUserAgreement}
        surveyConsentPrivacyPolicy={surveyConsentPrivacyPolicy}
        onSurveyConsentUserAgreementChange={setSurveyConsentUserAgreement}
        onSurveyConsentPrivacyPolicyChange={setSurveyConsentPrivacyPolicy}
        onStepPrev={handleSurveyStepPrev}
        onStepNext={handleSurveyStepNext}
        surveyNextHint={surveyNextHint}
        surveyUrl={surveyUrl}
        onOpenExternalSurvey={openExternalSurvey}
        surveySubmitPending={surveySubmitPending}
        onSubmitSurvey={() => void handleSurveySubmit()}
        feedbackSuccess={feedbackSuccess}
        feedbackContent={feedbackContent}
        onFeedbackContentChange={setFeedbackContent}
        feedbackConsentUserAgreement={feedbackConsentUserAgreement}
        feedbackConsentPrivacyPolicy={feedbackConsentPrivacyPolicy}
        onFeedbackConsentUserAgreementChange={setFeedbackConsentUserAgreement}
        onFeedbackConsentPrivacyPolicyChange={setFeedbackConsentPrivacyPolicy}
        feedbackPending={feedbackPending}
        onSubmitFeedback={() => void handleFeedbackSubmit()}
      />
    </VerseCraftPaperFrame>

    </>
  );
}
