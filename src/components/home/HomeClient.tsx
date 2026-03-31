"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { deleteCloudSaveSlot, fetchCloudSaves, syncSaveToCloud } from "@/app/actions/save";
import { HOME_CONTINUE_TIME_EPSILON_MS } from "@/lib/save/homeContinue";
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
import Leaderboard from "@/components/Leaderboard";
import { GlassCtaButton } from "@/components/GlassCtaButton";
import { GlassEntryFrame } from "@/components/GlassEntryFrame";
import { useHeartbeat } from "@/hooks/useHeartbeat";
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
import { resolveHomeEntryState, shouldUseResumeShadowFallback } from "@/components/home/continueFallback";
import {
  homeContinueConflictHint,
  homeContinuePickerTitle,
  homeContinuePrimaryCta,
  homeContinueUnavailableToast,
  homeRecoveryFallbackToast,
} from "@/lib/ui/deathContractCopy";

type HomeClientProps = {
  initialUser: { id: string; name: string } | null;
};

type SaveRow = {
  slotId: string;
  data: Record<string, unknown>;
  updatedAt: string | null;
};

function FooterIconButton({
  onClick,
  ariaLabel,
  ariaExpanded,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  ariaExpanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      className="group relative grid h-12 w-12 place-items-center rounded-full bg-white/75 shadow-[0_14px_34px_rgba(15,23,42,0.12)] backdrop-blur-xl transition active:scale-[0.98]"
    >
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/80 to-white/35 opacity-90" />
      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-slate-200/70 transition group-hover:ring-slate-300/70" />
      <span className="relative text-slate-700/70">{children}</span>
    </button>
  );
}

function TrophyIconSvg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6h8v3a4 4 0 0 1-8 0V6Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 6H5a2 2 0 0 0 2 5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 6h2a2 2 0 0 1-2 5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 13v3"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 19h6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 16h4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function PenNibSvg({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 2l7.5 7.5-3.2 3.2a6.2 6.2 0 0 1-8.6 0L4.5 9.5 12 2Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path
        d="M10 13.5 12 22l2-8.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

function FooterHaloIconButton({
  onClick,
  ariaLabel,
  ariaExpanded,
  tone = "neutral",
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  ariaExpanded?: boolean;
  tone?: "neutral" | "blue";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      className="relative"
    >
      <div className="group relative flex h-14 w-14 cursor-pointer items-center justify-center">
        {tone === "blue" ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-r from-indigo-500/30 via-cyan-200/20 to-blue-600/30 opacity-95 blur-[18px] transition-opacity duration-500 group-hover:opacity-100 animate-[halo-pulse_2.4s_ease-in-out_infinite]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-0.5 rounded-full ring-1 ring-white/35 shadow-[0_0_18px_rgba(99,102,241,0.55),0_0_26px_rgba(34,211,238,0.35)] opacity-85 transition-opacity duration-500 group-hover:opacity-100"
            />
          </>
        ) : (
          <div className="absolute -inset-1 rounded-full bg-white/70 blur-[12px] opacity-70 transition group-hover:opacity-90 vc-wait-breath" />
        )}
        <div className="absolute inset-1 rounded-full bg-white/90 backdrop-blur-sm transition-all group-hover:bg-white shadow-[0_0_18px_rgba(226,232,240,0.7)]" />
        <span className="relative z-10 text-slate-700 drop-shadow-[0_0_6px_rgba(71,85,105,0.55)]">
          {children}
        </span>
      </div>
    </button>
  );
}

const INITIAL_AUTH_ACTION_STATE = { success: false, message: "", error: "" };
const SURVEY_LOCAL_CACHE_KEY = `vc_survey_done_${PRODUCT_SURVEY_KEY_HOME}`;
const AUTH_SUCCESS_QUERY_KEY = "auth";
const SURVEY_COPY = {
  entryLabel: "产品问卷",
  title: "产品问卷",
  subtitle: "用于迭代节奏、界面与引导分层，与排行榜成绩无直接关系。",
  estimate: "约 2 分钟，以选择题为主；末尾可留一句话。提交后立即入库，无需跳转外链。",
  later: "稍后再说",
  submitEmbedded: "提交问卷",
  externalBackup: "备用：外链问卷",
  surveyDoneLine: "该设备／账号下本问卷已归档，感谢你的时间。",
  feedbackSecondary: "问题反馈（开放文本）",
  feedbackBack: "返回问卷",
  privacyHint: "提交即表示你已阅读《隐私政策》，我们仅将内容用于产品与体验分析。",
  noLink: "暂未配置外链问卷；请使用上方站内表单。",
  syncHint: "正在向服务器核对是否已提交…",
} as const;

type HomeSurveyQuestionId =
  | "discoverySource"
  | "experienceStage"
  | "createFriction"
  | "immersionIssue"
  | "coreFunPoint"
  | "quitReason"
  | "topFixOne"
  | "saveLossConcern"
  | "recommendWillingness"
  | "finalSuggestion";

type HomeSurveyQuestionConfig =
  | {
      id: Exclude<HomeSurveyQuestionId, "topFixOne" | "finalSuggestion">;
      kind: "single";
      title: string;
      subtitle?: string;
      required: true;
      options: Array<{ value: string; label: string }>;
    }
  | {
      id: "topFixOne" | "finalSuggestion";
      kind: "text";
      title: string;
      subtitle?: string;
      required: boolean;
      maxLen: 500;
      placeholder: string;
    };

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

type AuthMode = "login" | "register";

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
  const homeViewTrackedRef = useRef(false);
  const authErrorTrackedRef = useRef<{ mode: AuthMode; msg: string } | null>(null);
  const surveyStartedTrackedRef = useRef(false);

  const setUser = useGameStore((s) => s.setUser);
  const guestId = useGameStore((s) => s.guestId ?? "guest_home");
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
  const [nameCheck, setNameCheck] = useState<{ status: "idle" | "checking" | "ok" | "taken" | "error"; message: string }>({
    status: "idle",
    message: "",
  });
  const [toast, setToast] = useState<string | null>(null);
  const [leaderboardAutoOpen, setLeaderboardAutoOpen] = useState(false);
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
  // 灯泡点击直接打开问卷，不需要中间提示态
  const [selectedContinueSlotId, setSelectedContinueSlotId] = useState<string>("");
  /** 同槽本地与云端时间不一致时，用户显式选择；禁止静默覆盖 */
  const [syncSourceBySlot, setSyncSourceBySlot] = useState<Record<string, "local" | "cloud">>({});
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

  function slotHasPlayableLocal(data: SaveSlotData | undefined): boolean {
    if (!data) return false;
    const logs = data.logs;
    if (Array.isArray(logs) && logs.length > 0) return true;
    return false;
  }

  const continueRows = useMemo(() => {
    const localEntries = Object.entries(saveSlots ?? {}).filter(([id]) => !id.startsWith("auto_"));
    const cloudBySlot = new Map(cloudRows.filter((r) => !r.slotId.startsWith("auto_")).map((r) => [r.slotId, r]));

    const slotIds = new Set<string>();
    for (const [id] of localEntries) slotIds.add(id);
    for (const r of cloudRows) {
      if (!r.slotId.startsWith("auto_")) slotIds.add(r.slotId);
    }

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

      if (!localData && !cloudRow) continue;
      const localSummary = localData ? extractHomeContinueSummaryFromPayload(localData) : null;
      const cloudSummary = cloudRow ? extractHomeContinueSummaryFromPayload(cloudRow.data) : null;
      const localTs = localSummary?.updatedAtIso ? Date.parse(localSummary.updatedAtIso) : 0;
      const cloudTs = cloudRow?.updatedAt ? Date.parse(cloudRow.updatedAt) : 0;
      const hasLocal = !!localData;
      const hasCloud = !!cloudRow;

      let tag: HomeContinueSourceTag;
      if (hasLocal && !hasCloud) tag = "local";
      else if (!hasLocal && hasCloud) tag = "cloud";
      else if (hasLocal && hasCloud) {
        const delta = Math.abs(localTs - cloudTs);
        tag = delta <= HOME_CONTINUE_TIME_EPSILON_MS ? "synced" : "conflict";
      } else {
        continue;
      }

      const displayUpdatedAt =
        tag === "cloud"
          ? cloudRow?.updatedAt ?? null
          : tag === "local"
            ? localSummary?.updatedAtIso ?? null
            : Math.max(localTs, cloudTs) === localTs
              ? localSummary?.updatedAtIso ?? cloudRow?.updatedAt ?? null
              : cloudRow?.updatedAt ?? localSummary?.updatedAtIso ?? null;

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
    });
  }, [saveSlots, cloudRows, user]);

  const deleteTargetRow = useMemo(() => {
    const id = (deleteTargetSlotId ?? "").trim();
    if (!id) return null;
    return continueRows.find((r) => r.slotId === id) ?? null;
  }, [continueRows, deleteTargetSlotId]);

  const deleteTargetDisplay = useMemo(() => {
    if (!deleteTargetRow) return "";
    const rawLabel =
      deleteTargetRow.localSummary?.label ??
      deleteTargetRow.cloudSummary?.label ??
      (deleteTargetRow.slotId === "main_slot" ? "主线记录" : "未命名记录");
    const label = String(rawLabel ?? "").replaceAll("存档", "记录").replaceAll("进度", "记录");
    const tag = tagLabel(deleteTargetRow.tag);
    return `${label}（${tag}）`;
  }, [deleteTargetRow]);

  const entryState: EntryState = useMemo(() => {
    return resolveHomeEntryState({
      authed: !!user,
      localHasAny: localProgressInfo.hasAny || hasLocalAnySave,
      hasCloudAnySave,
      hasPlayableResumeShadow,
    });
  }, [user, localProgressInfo.hasAny, hasLocalAnySave, hasCloudAnySave, hasPlayableResumeShadow]);

  useEffect(() => {
    if (homeViewTrackedRef.current) return;
    homeViewTrackedRef.current = true;
    void trackGameplayEvent({
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
  }, [entryState, user, localProgressInfo.hasAny, hasLocalAnySave, hasCloudAnySave, hasPlayableResumeShadow]);

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
    if (selectedContinueSlotId && continueRows.some((x) => x.slotId === selectedContinueSlotId)) {
      return selectedContinueSlotId;
    }
    return continueRows[0]!.slotId;
  }, [continueRows, selectedContinueSlotId]);

  const selectedContinueRow = useMemo(
    () => continueRows.find((r) => r.slotId === resolvedContinueSlotId) ?? null,
    [continueRows, resolvedContinueSlotId]
  );

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

  const hasLoginSyncNotice = useMemo(() => {
    if (!user) return false;
    return continueRows.some((r) => r.tag === "conflict");
  }, [user, continueRows]);

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

  useHeartbeat(!!user, guestId, "/");

  useEffect(() => {
    if (!user) return;
    void fetchCloudSaves()
      .then((rows) => setCloudRows(rows as SaveRow[]))
      .catch(() => setCloudRows([]));
  }, [user]);

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
    if (typeof window === "undefined") return;
    try {
      if (window.location.hash === "#home-leaderboard") {
        setLeaderboardAutoOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

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
    void trackGameplayEvent({
      eventName: "survey_entry_exposed",
      page: "/",
      source: "survey",
      payload: { placement: "home_fab" },
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!surveyOpen) return;
    void trackGameplayEvent({
      eventName: "survey_modal_opened",
      page: "/",
      source: "survey",
      payload: {
        mode: showBugFeedback ? "open_feedback" : "product_survey_embedded",
        surveyCompletion,
      },
    }).catch(() => {});
  }, [surveyOpen, showBugFeedback]);

  useEffect(() => {
    if (!surveyOpen) return;
    if (showBugFeedback) return;
    if (surveyCompletion !== "open") return;
    if (surveyStartedTrackedRef.current) return;
    surveyStartedTrackedRef.current = true;
    void trackGameplayEvent({
      eventName: "survey_started",
      page: "/",
      source: "survey_embedded",
      payload: { surveyKey: PRODUCT_SURVEY_KEY_HOME, version: PRODUCT_SURVEY_VERSION_HOME },
    }).catch(() => {});
  }, [surveyOpen, showBugFeedback, surveyCompletion]);

  useEffect(() => {
    if (!surveyOpen) return;
    if (showBugFeedback) return;
    if (surveyCompletion !== "open") return;
    const stepTotal = HOME_SURVEY_FLOW.length;
    const stepIndex = Math.max(0, Math.min(stepTotal - 1, surveyStep));
    const questionId = HOME_SURVEY_FLOW[stepIndex]?.id ?? "unknown";
    const pct = Math.round(((stepIndex + 1) / Math.max(1, stepTotal)) * 100);
    void trackGameplayEvent({
      eventName: "survey_step_viewed",
      page: "/",
      source: "survey_embedded",
      payload: {
        surveyKey: PRODUCT_SURVEY_KEY_HOME,
        version: PRODUCT_SURVEY_VERSION_HOME,
        stepIndex,
        stepTotal,
        questionId,
        progressPct: pct,
      },
    }).catch(() => {});
  }, [surveyOpen, showBugFeedback, surveyCompletion, surveyStep]);

  function openAuthModal() {
    // Avoid side effects inside state updaters (prevents Router/render warnings in React).
    setAuthOpen(true);
    setIsConnecting(true);
    void trackGameplayEvent({
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
    void trackGameplayEvent({
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

  async function handleLogout() {
    await signOut({ redirect: false });
    setUser(null);
    setCloudRows([]);
    setSyncSourceBySlot({});
    router.refresh();
  }

  function openContinuePicker() {
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

    void trackGameplayEvent({
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

    if (row.tag === "conflict") {
      const choice = syncSourceBySlot[slotId];
      if (!choice) {
        setToast("该槽位本地与云端进度不一致，请先选择「保留本地」或「使用云端」——我们不会默默覆盖任一侧。");
        return;
      }
      void trackGameplayEvent({
        eventName: "home_continue_resolved",
        page: "/",
        source: "home_continue",
        payload: { slotId, tag: "conflict", choice },
      }).catch(() => {});
      if (choice === "local") {
        const data = saveSlots[slotId];
        if (!data) {
          setToast("本机记录不可用。");
          return;
        }
        loadGame(slotId);
        const syncRes = await syncSaveToCloud(slotId, data).catch(() => ({ ok: false as const }));
        if (!syncRes.ok) setToast("已载入本地进度；云端同步失败时可稍后在游戏内再次保存。");
      } else {
        const cr = cloudRows.find((c) => c.slotId === slotId);
        if (!cr || !isSaveSlotData(cr.data)) {
          setToast("云端记录不可用。");
          return;
        }
        hydrateFromCloud(slotId, cr.data);
      }
      router.push("/play");
      return;
    }

    void trackGameplayEvent({
      eventName: "home_continue_resolved",
      page: "/",
      source: "home_continue",
      payload: { slotId, tag: row.tag },
    }).catch(() => {});

    if (row.tag === "cloud") {
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
    void trackGameplayEvent({
      eventName: "survey_submit_attempted",
      page: "/",
      source: "survey_embedded",
      payload: {
        surveyKey: PRODUCT_SURVEY_KEY_HOME,
        version: PRODUCT_SURVEY_VERSION_HOME,
        stepIndex: Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep)),
        stepTotal: HOME_SURVEY_FLOW.length,
      },
    }).catch(() => {});

    if (!surveyConsentUserAgreement || !surveyConsentPrivacyPolicy) {
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
      },
    });
    setSurveySubmitPending(false);
    if (!result.success) {
      void trackGameplayEvent({
        eventName: "survey_submit_failed",
        page: "/",
        source: "survey_embedded",
        payload: {
          surveyKey: PRODUCT_SURVEY_KEY_HOME,
          version: PRODUCT_SURVEY_VERSION_HOME,
          message: result.message,
        },
      }).catch(() => {});
      setToast(result.message);
      return;
    }
    setSurveyCompletion("done");
    try {
      localStorage.setItem(SURVEY_LOCAL_CACHE_KEY, "1");
    } catch {
      /* ignore */
    }
    setToast("问卷已提交，感谢你的时间。");
  }

  async function handleFeedbackSubmit() {
    void trackGameplayEvent({
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
      void trackGameplayEvent({
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
    void trackGameplayEvent({
      eventName: "survey_entry_clicked",
      page: "/",
      source: "survey",
      payload: { placement: "home_fab" },
    }).catch(() => {});
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
      void trackGameplayEvent({
        eventName: "survey_exit",
        page: "/",
        source: "survey_embedded",
        payload: {
          surveyKey: PRODUCT_SURVEY_KEY_HOME,
          version: PRODUCT_SURVEY_VERSION_HOME,
          stepIndex,
          stepTotal,
          questionId,
        },
      }).catch(() => {});
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
    void trackGameplayEvent({
      eventName: "survey_external_link_opened",
      page: "/",
      source: "survey",
      payload: { mode: "external_backup", hasUrl: true },
    }).catch(() => {});
  }

  const authPending = loginPending || registerPending;
  const activeAuthState = authMode === "login" ? loginState : registerState;
  const activeAuthAction = authMode === "login" ? loginFormAction : registerFormAction;

  useEffect(() => {
    const msg = activeAuthState?.error?.trim() || "";
    if (!msg) return;
    const last = authErrorTrackedRef.current;
    if (last && last.mode === authMode && last.msg === msg) return;
    authErrorTrackedRef.current = { mode: authMode, msg };
    void trackGameplayEvent({
      eventName: "auth_submit_failed",
      page: "/",
      source: "auth_modal",
      payload: { mode: authMode, error: msg },
    }).catch(() => {});
  }, [activeAuthState?.error, authMode]);

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
      <main className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#f8fafc]">
        <div
          className="pointer-events-none absolute -z-10 top-[-8%] left-[10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.9_0.06_195/0.4)_0%,transparent_70%)]"
          style={{ animation: "haloFloat 14s ease-in-out infinite" }}
        />
        <div
          className="pointer-events-none absolute -z-10 bottom-[-6%] right-[8%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.88_0.08_320/0.35)_0%,transparent_70%)]"
          style={{ animation: "haloFloat 18s ease-in-out infinite reverse" }}
        />
        <div
          className="pointer-events-none absolute -z-10 top-[35%] left-[50%] h-[350px] w-[350px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.92_0.04_270/0.4)_0%,transparent_70%)]"
          style={{ animation: "haloFloat 22s ease-in-out infinite 4s" }}
        />

        <header
          className="relative z-20 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5 sm:px-8"
          style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/70 shadow-[0_18px_60px_rgba(148,163,184,0.25)] backdrop-blur-2xl">
              <Image src="/logo.svg" alt="VerseCraft" width={30} height={30} className="object-cover scale-[1.12]" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-[0.22em] text-slate-700 sm:tracking-[0.5em]">
                VERSECRAFT
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!user ? (
              <button
                type="button"
                onClick={openAuthModal}
                aria-label="登录或注册"
                className={`group relative inline-flex items-center justify-center rounded-full bg-slate-500/65 px-7 py-3 text-sm font-semibold text-white shadow-[0_18px_60px_rgba(148,163,184,0.25)] backdrop-blur-xl transition hover:bg-slate-500/75 ${
                  authWarn ? "ring-2 ring-red-500/70" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-r from-indigo-500/35 via-cyan-200/25 to-blue-600/35 opacity-95 blur-[18px] transition-opacity duration-500 group-hover:opacity-100 animate-[halo-pulse_2.4s_ease-in-out_infinite]"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-0.5 rounded-full ring-1 ring-white/35 shadow-[0_0_18px_rgba(99,102,241,0.55),0_0_26px_rgba(34,211,238,0.35)] opacity-85 transition-opacity duration-500 group-hover:opacity-100"
                />
                <span className="relative tracking-[0.22em] text-slate-100/90 drop-shadow-[0_0_12px_rgba(226,232,240,0.65)]">
                  执笔 登入
                </span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="relative z-20 mx-auto w-full max-w-5xl px-6 sm:px-8">
          {user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                  <span className="max-w-[260px] truncate rounded-full bg-gradient-to-r from-indigo-500/15 via-cyan-300/20 to-blue-500/15 px-3 py-1 text-sm font-bold text-slate-800 shadow-[0_0_18px_rgba(99,102,241,0.2)] ring-1 ring-white/60">
                    {user.name}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                    已登录
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    可跨设备继续
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    云 {hasCloudAnySave ? `${cloudRows.length}` : "0"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    本地 {hasLocalAnySave ? `${Object.keys(saveSlots ?? {}).length}` : "0"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    问卷 {surveyCompletion === "done" ? "已提交" : "未提交"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full border border-slate-200 bg-white/75 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white"
                >
                  退出
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs font-medium text-slate-500">
              {hasLocalAnySave ? "本机留有可继续的记录。登录后可云端备份。" : "可直接以游客开始；登录可云端备份。"}
            </div>
          )}
        </div>

        {authOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={closeAuthModal}
            />
            <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-slate-900/85 px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.9)] backdrop-blur-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-widest text-slate-100">
                    {authMode === "login" ? "登录" : "注册"}
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {authMode === "login"
                      ? "用笔名与密码进入已存在的档案。"
                      : "创建新档案：笔名唯一，创建后可云同步与跨设备继续。"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAuthModal}
                  className="shrink-0 rounded-full border border-slate-600/60 bg-slate-800/80 px-3 py-1 text-xs text-slate-300 hover:border-slate-400 hover:text-slate-100"
                >
                  关闭
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("login");
                          void trackGameplayEvent({
                            eventName: "auth_mode_switched",
                            page: "/",
                            source: "auth_modal",
                            payload: { mode: "login" },
                          }).catch(() => {});
                        }}
                  className={`h-9 rounded-xl text-xs font-semibold tracking-[0.22em] transition ${
                    authMode === "login" ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                  aria-pressed={authMode === "login"}
                >
                  登录
                </button>
                <button
                  type="button"
                        onClick={() => {
                          setAuthMode("register");
                          void trackGameplayEvent({
                            eventName: "auth_mode_switched",
                            page: "/",
                            source: "auth_modal",
                            payload: { mode: "register" },
                          }).catch(() => {});
                        }}
                  className={`h-9 rounded-xl text-xs font-semibold tracking-[0.22em] transition ${
                    authMode === "register" ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                  aria-pressed={authMode === "register"}
                >
                  注册
                </button>
              </div>

              <form
                key={`auth-form-${authMode}-${authFormNonce}`}
                className="relative mt-5 space-y-3"
                action={activeAuthAction}
                onSubmit={() => {
                  void trackGameplayEvent({
                    eventName: "auth_submit_attempted",
                    page: "/",
                    source: "auth_modal",
                    payload: { mode: authMode },
                  }).catch(() => {});
                }}
              >
                <input
                  name="fax_number"
                  type="text"
                  autoComplete="off"
                  aria-hidden={true}
                  tabIndex={-1}
                  className="absolute left-[-9999px] top-[-9999px] z-[-1] opacity-0"
                />
                <input
                  name="name"
                  autoComplete="username"
                  placeholder={authMode === "login" ? "笔名" : "新笔名（唯一）"}
                  className="h-10 w-full rounded-xl border border-white/25 bg-slate-900/40 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                />
                {authMode === "register" ? (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">笔名唯一性</span>
                    <span
                      className={
                        nameCheck.status === "ok"
                          ? "text-emerald-300"
                          : nameCheck.status === "taken"
                            ? "text-rose-300"
                            : nameCheck.status === "error"
                              ? "text-amber-300"
                              : "text-slate-500"
                      }
                    >
                      {nameCheck.status === "checking" ? "校验中…" : nameCheck.message || "请输入至少 2 个字符"}
                    </span>
                  </div>
                ) : null}
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="密码（至少 6 位）"
                  className="h-10 w-full rounded-xl border border-white/25 bg-slate-900/40 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      name="consent_user_agreement"
                      value="1"
                      checked={authConsentUserAgreement}
                      onChange={(e) => setAuthConsentUserAgreement(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-600/60"
                    />
                    <span className="leading-relaxed">
                      我已阅读并同意{" "}
                      <a className="underline underline-offset-2 hover:text-slate-100" href="/legal/user-agreement">
                        用户协议
                      </a>
                      。
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      name="consent_privacy_policy"
                      value="1"
                      checked={authConsentPrivacyPolicy}
                      onChange={(e) => setAuthConsentPrivacyPolicy(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-600/60"
                    />
                    <span className="leading-relaxed">
                      我已阅读并同意{" "}
                      <a className="underline underline-offset-2 hover:text-slate-100" href="/legal/privacy-policy">
                        隐私政策
                      </a>
                      。
                    </span>
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={authPending}
                  className={`h-10 w-full rounded-xl bg-slate-100 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 ${
                    authPending ? "halo-nerve" : ""
                  }`}
                >
                  {authPending ? "处理中..." : authMode === "login" ? "登录并进入" : "注册并进入"}
                </button>
                {!activeAuthState.success && activeAuthState.error && (
                  <div className="mt-3 rounded-xl border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-100">
                    {activeAuthState.error}
                  </div>
                )}
                {activeAuthState.success && activeAuthState.message ? (
                  <div className="mt-3 rounded-xl border border-emerald-400/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
                    {authMode === "login" ? "登录成功：正在进入…" : "注册成功：正在进入…"}
                  </div>
                ) : null}
              </form>
            </div>
          </div>
        )}

      {toast && (
        <div className="pointer-events-none fixed top-24 right-8 z-50 rounded-2xl border border-red-400/50 bg-red-950/65 px-4 py-3 text-sm text-red-100 backdrop-blur-xl shadow-[0_0_24px_rgba(220,38,38,0.3)] animate-[fadeIn_0.35s_ease-out]">
          {toast}
        </div>
      )}

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-10 text-center sm:px-8">
        <div className="w-full max-w-3xl animate-[fadeIn_0.8s_ease-out]">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-4xl font-bold tracking-[0.28em] text-slate-800 drop-shadow-sm sm:text-5xl md:text-6xl">
              文界工坊
            </h1>
            <div className="mx-auto mt-6 h-px w-40 overflow-hidden rounded-full opacity-80 sm:mt-7 sm:w-48" aria-hidden>
              <div className="h-full w-full bg-gradient-to-r from-transparent via-slate-300/55 to-transparent blur-[0.2px]" />
            </div>
            <p className="mt-12 text-sm font-medium tracking-widest text-slate-500 sm:mt-14">
              锻造可能，实现梦想
            </p>
          </div>

          <div className="mx-auto mt-14 w-full max-w-3xl sm:mt-16">
            <div className="mx-auto flex w-full max-w-xl flex-col items-stretch justify-center gap-8 sm:max-w-2xl">
              {hasLoginSyncNotice ? (
                <div className="rounded-xl bg-amber-50/60 px-3 py-2 text-left text-xs font-medium text-amber-950/80">
                  {homeContinueConflictHint()}
                </div>
              ) : null}

              <GlassEntryFrame variant="pill" className="w-full sm:mx-auto">
                <GlassCtaButton
                  variant="pill"
                  pillSize="sm"
                  label={(entryState === "guest_has_progress" || entryState === "authed_has_progress") ? "开始新篇" : "执笔书写"}
                  trailing="→"
                  onClick={() => {
                    unlockBgmOnUserGesture();
                    void trackGameplayEvent({
                      eventName: "home_start_new_clicked",
                      page: "/",
                      source: "home_start_new",
                      payload: { entryState, loggedIn: !!user },
                    }).catch(() => {});
                    resetForNewGame();
                    router.push("/intro");
                  }}
                />
              </GlassEntryFrame>

              {(entryState === "guest_has_progress" || entryState === "authed_has_progress") ? (
                <GlassEntryFrame variant="pill" className="w-full sm:mx-auto">
                  <GlassCtaButton
                    variant="pill"
                    pillSize="sm"
                    label={homeContinuePrimaryCta()}
                    trailing="→"
                    onClick={openContinuePicker}
                  />
                </GlassEntryFrame>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center p-6 transition-all duration-500 ${
          continuePickerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`absolute inset-0 bg-slate-200/55 backdrop-blur-sm transition-all duration-500 ${
            continuePickerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setContinuePickerOpen(false)}
        />
        <div
          className={`relative w-full max-w-2xl rounded-[2rem] bg-white/85 p-7 shadow-[0_0_48px_rgba(15,23,42,0.18)] backdrop-blur-3xl transition-all duration-500 ${
            continuePickerOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-left">
              <h3 className="text-sm font-semibold tracking-widest text-slate-700">{homeContinuePickerTitle()}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                这不是“回到上一刻”。你只是沿着同一条线继续往前走。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContinuePickerOpen(false)}
              className="shrink-0 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs text-slate-500 transition hover:text-slate-800"
            >
              关闭
            </button>
          </div>

          <div className="mt-5 max-h-[50vh] space-y-2 overflow-y-auto text-left">
            {continueRows.map((r) => {
              const sum = r.localSummary ?? r.cloudSummary;
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
                  className={`w-full rounded-2xl border px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 ${
                    selected ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">
                        [{tagLabel(r.tag)}] {normalizeContinueLabel(sum?.label ?? r.slotId)}
                      </div>
                      <div className={`mt-1 text-[11px] ${selected ? "text-white/80" : "text-slate-500"}`}>{line}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className={`text-[11px] font-mono ${selected ? "text-white/75" : "text-slate-400"}`}>更新 {upd}</div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTargetSlotId(r.slotId);
                          setDeleteConfirmOpen(true);
                        }}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                          selected
                            ? "border-white/25 bg-white/10 text-white hover:bg-white/15"
                            : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        }`}
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

          {user && continuePickerSelectedRow?.tag === "conflict" ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-3 text-left">
              <div className="text-xs font-semibold text-slate-700">冲突：选择继续来源</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSyncSourceBySlot((prev) => ({ ...prev, [continuePickerSelectedRow.slotId]: "local" }))}
                  className={`rounded-xl border px-4 py-3 text-xs font-semibold transition ${
                    syncSourceBySlot[continuePickerSelectedRow.slotId] === "local"
                      ? "border-slate-800 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  保留本地
                </button>
                <button
                  type="button"
                  onClick={() => setSyncSourceBySlot((prev) => ({ ...prev, [continuePickerSelectedRow.slotId]: "cloud" }))}
                  className={`rounded-xl border px-4 py-3 text-xs font-semibold transition ${
                    syncSourceBySlot[continuePickerSelectedRow.slotId] === "cloud"
                      ? "border-slate-800 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  使用云端
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setContinuePickerOpen(false)}
              className="rounded-full border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white"
            >
              取消
            </button>
            <button
              type="button"
              disabled={
                !continuePickerSelectedRow ||
                (!!user && continuePickerSelectedRow.tag === "conflict" && !syncSourceBySlot[continuePickerSelectedRow.slotId])
              }
              onClick={() => {
                const id = continuePickerSelectedSlotId || resolvedContinueSlotId;
                setContinuePickerOpen(false);
                void handleContinueAdventure(id);
              }}
              className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {homeContinuePrimaryCta()} →
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
          className={`absolute inset-0 bg-slate-900/25 backdrop-blur-sm transition-all duration-300 ${
            deleteConfirmOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDeleteConfirmOpen(false)}
        />
        <div
          className={`relative w-full max-w-md rounded-[1.75rem] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-3xl transition-all duration-300 ${
            deleteConfirmOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="text-left">
            <div className="text-sm font-semibold tracking-widest text-slate-800">确认抹除记录？</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {user ? "将同时抹除本机与云端（含自动记录）。" : "将抹除本机记录（游客模式无云端）。"}
            </p>
            <p className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-700">
              目标：
              <span className="ml-2 font-semibold text-slate-800">
                {deleteTargetDisplay || (deleteTargetSlotId ? "该记录" : "—")}
              </span>
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="rounded-full border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white"
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
                setSyncSourceBySlot((prev) => {
                  const next = { ...prev };
                  delete next[slotId];
                  delete next[autoId];
                  return next;
                });
                if (user) {
                  await deleteCloudSaveSlot(slotId).catch(() => undefined);
                  await deleteCloudSaveSlot(autoId).catch(() => undefined);
                }
              }}
              className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              确认删除
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />

      <footer className="relative z-20 mx-auto w-full max-w-5xl px-6 pb-8 sm:px-8" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        <div className="border-t border-slate-200/70 pt-5 text-xs text-slate-500">
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-2">
            <div id="home-leaderboard" className="flex min-w-0 items-center justify-self-start">
              <Leaderboard userId={user?.id} triggerPlacement="inline" defaultOpen={leaderboardAutoOpen} />
            </div>
            <div className="justify-self-center whitespace-nowrap text-center text-[11px] text-slate-500 sm:text-xs">
              QQ群 <span className="font-mono text-slate-600">377493954</span>
            </div>
            <div className="flex justify-self-end">
              <FooterHaloIconButton onClick={openSurveyEntry} ariaLabel="产品问卷" tone="blue">
                <BulbIconSvg />
              </FooterHaloIconButton>
            </div>
          </div>

          <div
            className="mt-3 flex w-full items-center justify-start gap-x-3 overflow-x-auto whitespace-nowrap text-[11px] text-slate-500/90 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:gap-x-4 sm:text-xs sm:whitespace-normal sm:overflow-visible"
          >
            <Link className="underline underline-offset-4 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-500" href="/legal/user-agreement">
              用户协议
            </Link>
            <Link className="underline underline-offset-4 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-500" href="/legal/privacy-policy">
              隐私政策
            </Link>
            <Link className="underline underline-offset-4 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-500" href="/legal/contact">
              联系我们
            </Link>
            <button
              type="button"
              onClick={openFooterFeedback}
              className="underline underline-offset-4 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-500"
            >
              测试反馈 / 举报
            </button>
            <Link className="underline underline-offset-4 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-500" href="/legal/content-policy">
              内容规范
            </Link>
            <Link className="underline underline-offset-4 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-500" href="/legal/ai-disclaimer">
              AI 生成说明
            </Link>
            <Link className="underline underline-offset-4 decoration-slate-300/80 hover:text-slate-900 hover:decoration-slate-500" href="/legal/minors">
              未成年人说明
            </Link>
          </div>

          <div className="mt-3 text-center text-slate-500">
            {(() => {
              const c = getPublicRuntimeConfig().compliance;
              const beianNumber = (c.beianNumber ?? "").trim();
              const beianUrl = (c.beianUrl ?? "").trim();
              if (!beianNumber) return <span className="text-slate-400">—</span>;
              return (
                <a
                  className="text-slate-600 underline underline-offset-4 decoration-slate-300/90 transition hover:text-slate-900 hover:decoration-slate-500"
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

      <div
        className={`fixed inset-0 z-[80] flex items-center justify-center p-6 transition-all duration-500 ${
          surveyOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`absolute inset-0 bg-slate-200/50 backdrop-blur-sm transition-all duration-500 ${
            surveyOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeSurveyModal}
        />
        <div
          className={`relative w-full max-w-2xl rounded-[2rem] bg-slate-100/90 p-10 shadow-[0_0_36px_rgba(200,200,200,0.45)] backdrop-blur-3xl transition-all duration-500 ${
            surveyOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <h3 className="text-2xl font-semibold tracking-wide text-slate-700">{SURVEY_COPY.title}</h3>
          {!showBugFeedback ? (
            <>
              <p className="mt-3 text-sm text-slate-500">{SURVEY_COPY.subtitle}</p>

              {surveyCompletion === "loading" ? (
                <p className="mt-6 text-center text-sm text-slate-500">{SURVEY_COPY.syncHint}</p>
              ) : surveyCompletion === "done" ? (
                <div className="mt-6 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-6 text-center">
                  <p className="text-sm font-medium text-emerald-950">{SURVEY_COPY.surveyDoneLine}</p>
                  <button
                    type="button"
                    onClick={() => setShowBugFeedback(true)}
                    className="mt-4 rounded-full border border-emerald-700/30 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50/90"
                  >
                    {SURVEY_COPY.feedbackSecondary}
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-500">
                        进度 {safeStep + 1}/{totalSteps}
                      </div>
                      <div className="w-40 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-slate-800" style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-semibold text-slate-800">{curQ.title}</div>
                      {curQ.subtitle ? (
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{curQ.subtitle}</div>
                      ) : null}

                      {curQ.kind === "single" ? (
                        <select
                          value={getSurveyValue(curQ.id)}
                          onChange={(e) => setSurveyValue(curQ.id, e.target.value)}
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                        >
                          <option value="">请选择</option>
                          {curQ.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <textarea
                            value={getSurveyValue(curQ.id)}
                            onChange={(e) => setSurveyValue(curQ.id, e.target.value.slice(0, curQ.maxLen))}
                            placeholder={curQ.placeholder}
                            className="h-28 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                          />
                          <div className="text-right text-[11px] text-slate-500">
                            {getSurveyValue(curQ.id).length}/{curQ.maxLen}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
                    <label className="flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={surveyConsentUserAgreement}
                        onChange={(e) => setSurveyConsentUserAgreement(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                      <span>
                        我已阅读并同意{" "}
                        <a className="underline underline-offset-2 hover:text-slate-900" href="/legal/user-agreement">
                          用户协议
                        </a>
                        。
                      </span>
                    </label>
                    <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={surveyConsentPrivacyPolicy}
                        onChange={(e) => setSurveyConsentPrivacyPolicy(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                      <span>
                        我已阅读并同意{" "}
                        <a className="underline underline-offset-2 hover:text-slate-900" href="/legal/privacy-policy">
                          隐私政策
                        </a>
                        。
                      </span>
                    </label>
                  </div>

                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void trackGameplayEvent({
                            eventName: "survey_step_prev",
                            page: "/",
                            source: "survey_embedded",
                            payload: {
                              surveyKey: PRODUCT_SURVEY_KEY_HOME,
                              version: PRODUCT_SURVEY_VERSION_HOME,
                              fromStepIndex: Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep)),
                              questionId: HOME_SURVEY_FLOW[Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep))]?.id ?? "unknown",
                            },
                          }).catch(() => {});
                          setSurveyStep((s) => Math.max(0, s - 1));
                        }}
                        disabled={safeStep === 0}
                        className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        上一题
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (!canGoNext()) {
                              setSurveyNextHint(true);
                              window.setTimeout(() => setSurveyNextHint(false), 1600);
                              return;
                            }
                            setSurveyNextHint(false);
                            void trackGameplayEvent({
                              eventName: "survey_step_next",
                              page: "/",
                              source: "survey_embedded",
                              payload: {
                                surveyKey: PRODUCT_SURVEY_KEY_HOME,
                                version: PRODUCT_SURVEY_VERSION_HOME,
                                fromStepIndex: Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep)),
                                questionId: HOME_SURVEY_FLOW[Math.max(0, Math.min(HOME_SURVEY_FLOW.length - 1, surveyStep))]?.id ?? "unknown",
                              },
                            }).catch(() => {});
                            setSurveyStep((s) => Math.min(totalSteps - 1, s + 1));
                          }}
                          disabled={safeStep >= totalSteps - 1}
                          className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          下一题
                        </button>
                        {surveyNextHint ? (
                          <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full border border-amber-200/90 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm">
                            这一题还没选
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={closeSurveyModal}
                      className="rounded-full border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-white"
                    >
                      {SURVEY_COPY.later}
                    </button>
                    {surveyUrl ? (
                      <button
                        type="button"
                        onClick={openExternalSurvey}
                        disabled={!surveyConsentUserAgreement || !surveyConsentPrivacyPolicy}
                        className="rounded-full border border-slate-400 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {SURVEY_COPY.externalBackup}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        surveySubmitPending ||
                        safeStep !== totalSteps - 1
                      }
                      onClick={() => void handleSurveySubmit()}
                      className="rounded-full bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {surveySubmitPending ? "提交中…" : SURVEY_COPY.submitEmbedded}
                    </button>
                  </div>
                </>
              )}

              <p className="mt-4 text-right text-xs text-slate-500">{SURVEY_COPY.privacyHint}</p>
              {surveyCompletion === "open" ? (
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    onClick={() => setShowBugFeedback(true)}
                    className="text-xs text-slate-500 underline-offset-2 transition hover:text-slate-800 hover:underline"
                  >
                    {SURVEY_COPY.feedbackSecondary}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {!feedbackSuccess ? (
                <>
                  <p className="mt-3 text-sm text-slate-500">
                    此为<strong className="font-medium text-slate-700">开放文本反馈</strong>
                    ，与结构化产品问卷分渠道存储，便于逐条跟进 bug 与长尾建议。
                  </p>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
                    <label className="flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={feedbackConsentUserAgreement}
                        onChange={(e) => setFeedbackConsentUserAgreement(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                      <span>
                        我已阅读并同意{" "}
                        <a className="underline underline-offset-2 hover:text-slate-900" href="/legal/user-agreement">
                          用户协议
                        </a>
                        。
                      </span>
                    </label>
                    <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={feedbackConsentPrivacyPolicy}
                        onChange={(e) => setFeedbackConsentPrivacyPolicy(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                      <span>
                        我已阅读并同意{" "}
                        <a className="underline underline-offset-2 hover:text-slate-900" href="/legal/privacy-policy">
                          隐私政策
                        </a>
                        。
                      </span>
                    </label>
                  </div>
                  <textarea
                    value={feedbackContent}
                    onChange={(event) => setFeedbackContent(event.target.value)}
                    placeholder="请输入你的建议或反馈..."
                    className="mt-6 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 outline-none transition-all focus:border-slate-400 focus:shadow-[0_0_0_4px_rgba(148,163,184,0.15)]"
                  />
                  <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowBugFeedback(false)}
                      className="rounded-full border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-white"
                    >
                      {SURVEY_COPY.feedbackBack}
                    </button>
                    <button
                      type="button"
                      disabled={feedbackPending || !feedbackConsentUserAgreement || !feedbackConsentPrivacyPolicy}
                      onClick={() => void handleFeedbackSubmit()}
                      className="rounded-full bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {feedbackPending ? "提交中..." : "提交意见"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-8 flex min-h-44 items-center justify-center">
                  <p className="text-center text-xl font-medium text-slate-700">谢谢您的意见，游戏会因您变得更好！</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>

    </>
  );
}
