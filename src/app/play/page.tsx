"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Keyboard, List, Settings } from "lucide-react";
import { toggleMute, isMuted, updateSanityFilter, setDarkMoonMode, playUIClick } from "@/lib/audioEngine";
import type { Item, StatType } from "@/lib/registry/types";
import { NPCS } from "@/lib/registry/npcs";
import { useGameStore, type CodexEntry, type EchoTalent, type GameTask } from "@/store/useGameStore";
import { useGameStore as usePersistStore } from "@/store/gameStore";
import { useSmoothStream } from "@/hooks/useSmoothStream";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { UnifiedMenuModal } from "@/components/UnifiedMenuModal";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type DMJson = {
  is_action_legal: boolean;
  sanity_damage: number;
  narrative: string;
  is_death: boolean;
  consumes_time?: boolean;
  consumed_items?: string[];
  awarded_items?: Array<{
    id?: string;
    name?: string;
    tier?: string;
    description?: string;
    tags?: string;
    statBonus?: Record<string, number>;
  }>;
  codex_updates?: Array<{
    id: string;
    name: string;
    type: "npc" | "anomaly";
    favorability?: number;
    combatPower?: number;
    personality?: string;
    traits?: string;
    rules_discovered?: string;
    weakness?: string;
  }>;
  options?: string[];
  currency_change?: number;
  new_tasks?: Array<{ id: string; title: string; desc: string; issuer: string; reward: string }>;
  task_updates?: Array<{ id: string; status: "active" | "completed" | "failed" }>;
  player_location?: string;
  npc_location_updates?: Array<{ id: string; to_location: string }>;
};

const MAX_INPUT = 20;

const TALENT_CD: Record<EchoTalent, number> = {
  时间回溯: 6,
  命运馈赠: 7,
  主角光环: 8,
  生命汇源: 10,
  洞察之眼: 8,
  丧钟回响: 24,
};

const STAT_ORDER: StatType[] = ["sanity", "agility", "luck", "charm", "background"];
const STAT_LABELS: Record<StatType, string> = {
  sanity: "理智",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

const NPC_NAME_BY_ID = new Map(NPCS.map((npc) => [npc.id, npc.name]));
const NPC_NAMES = NPCS.map((npc) => npc.name).filter(Boolean);

const LOCATION_LABELS: Record<string, string> = {
  B2_Passage: "B2 通道",
  B2_GatekeeperDomain: "B2 守门领域",
  B1_SafeZone: "B1 安全区",
  B1_Storage: "B1 储物间",
  B1_Laundry: "B1 洗衣房",
  B1_PowerRoom: "B1 配电间",
  "1F_Lobby": "1 楼门厅",
  "1F_PropertyOffice": "1 楼物业办公室",
  "1F_GuardRoom": "1 楼保安室",
  "1F_Mailboxes": "1 楼信箱区",
  "2F_Clinic201": "2 楼 201 诊室",
  "2F_Room202": "2 楼 202 室",
  "2F_Room203": "2 楼 203 室",
  "2F_Corridor": "2 楼走廊",
  "3F_Room301": "3 楼 301 室",
  "3F_Room302": "3 楼 302 室",
  "3F_Stairwell": "3 楼楼梯间",
  "4F_Room401": "4 楼 401 室",
  "4F_Room402": "4 楼 402 室",
  "4F_CorridorEnd": "4 楼走廊尽头",
  "5F_Room501": "5 楼 501 室",
  "5F_Room502": "5 楼 502 室",
  "5F_Studio503": "5 楼 503 画室",
  "6F_Room601": "6 楼 601 室",
  "6F_Room602": "6 楼 602 室",
  "6F_Stairwell": "6 楼楼梯间",
  "7F_Room701": "7 楼 701 室",
  "7F_Bench": "7 楼长椅区",
  "7F_Kitchen": "7 楼厨房",
  "7F_SealedDoor": "7 楼封闭门区",
};

function toSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickNpcNameBySeed(seedText: string): string {
  if (NPC_NAMES.length === 0) return "无名委托人";
  const idx = toSeed(seedText || String(Date.now())) % NPC_NAMES.length;
  return NPC_NAMES[idx] ?? NPC_NAMES[0] ?? "无名委托人";
}

function normalizeIssuerName(rawIssuer: unknown, seedText: string): string {
  const issuer = typeof rawIssuer === "string" ? rawIssuer.trim() : "";
  if (!issuer) return pickNpcNameBySeed(seedText);
  if (issuer === "未知" || issuer.toLowerCase() === "unknown") {
    return pickNpcNameBySeed(seedText);
  }
  if (NPC_NAME_BY_ID.has(issuer)) return NPC_NAME_BY_ID.get(issuer) ?? pickNpcNameBySeed(seedText);
  if (NPC_NAMES.includes(issuer)) return issuer;
  return pickNpcNameBySeed(seedText);
}

function formatLocationLabel(location: string): string {
  if (!location) return "未知区域";
  return LOCATION_LABELS[location] ?? location.replace(/_/g, " ");
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function renderNarrativeText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*(.+)\*\*$/);
    if (m)
      return (
        <strong
          key={i}
          className="inline-block font-bold text-red-600 animate-glitch drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]"
        >
          {m[1]}
        </strong>
      );
    return <span key={i}>{part}</span>;
  });
}

function DMNarrativeBlock({
  content,
  isDarkMoon,
}: {
  content: string;
  isDarkMoon: boolean;
}) {
  const baseClass = isDarkMoon
    ? "space-y-6 leading-[2.2] tracking-wide text-[1.05rem] text-slate-200"
    : "space-y-6 leading-[2.2] tracking-wide text-[1.05rem] text-slate-800";
  const paras = content.split(/\n\n+/).filter(Boolean);
  return (
    <div className={`${baseClass} whitespace-pre-wrap`}>
      {paras.length > 1 ? (
        paras.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {renderNarrativeText(p)}
          </p>
        ))
      ) : (
        <>{renderNarrativeText(content)}</>
      )}
    </div>
  );
}

function safeNumber(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Extract narrative from streaming JSON by finding the exact JSON string boundaries.
 * Scans for the closing unescaped double-quote to avoid ALL JSON key leakage,
 * regardless of key ordering or mid-stream truncation.
 */
function extractNarrative(raw: string): string {
  const keyIdx = raw.indexOf('"narrative"');
  if (keyIdx === -1) return "";
  const colonIdx = raw.indexOf(":", keyIdx + 11);
  if (colonIdx === -1) return "";

  let openQuote = -1;
  for (let j = colonIdx + 1; j < raw.length; j++) {
    const ch = raw[j];
    if (ch === '"') { openQuote = j; break; }
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return "";
  }
  if (openQuote === -1) return "";

  let closeQuote = -1;
  for (let j = openQuote + 1; j < raw.length; j++) {
    if (raw[j] === '\\') { j++; continue; }
    if (raw[j] === '"') { closeQuote = j; break; }
  }

  let text: string;
  if (closeQuote !== -1) {
    text = raw.substring(openQuote + 1, closeQuote);
  } else {
    text = raw.substring(openQuote + 1);
    if (text.endsWith("\\")) text = text.slice(0, -1);
  }

  return text.replace(/\\(["\\/bfnrt])/g, (_, c: string) => {
    switch (c) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case 'b': return '\b';
      case 'f': return '\f';
      default: return c;
    }
  });
}

const FALLBACK_DM: DMJson = {
  is_action_legal: true,
  sanity_damage: 0,
  narrative: "（系统波动）周围的空气似乎扭曲了一瞬，请继续你的行动...",
  is_death: false,
  consumes_time: true,
};

function tryParseDM(raw: string): DMJson | null {
  let cleanContent = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanContent = jsonMatch[0];
  }

  let parsedData: DMJson;
  try {
    parsedData = JSON.parse(cleanContent) as DMJson;
  } catch (e) {
    console.error("JSON Parsing Failed, raw content:", raw);
    return FALLBACK_DM;
  }

  if (
    typeof parsedData?.is_action_legal === "boolean" &&
    typeof parsedData?.sanity_damage === "number" &&
    typeof parsedData?.narrative === "string" &&
    typeof parsedData?.is_death === "boolean"
  ) {
    return parsedData;
  }
  return FALLBACK_DM;
}

function ensureRuntimeActions() {
  const storeAny = useGameStore as any;
  const s = storeAny.getState?.() ?? {};

  // 仅在缺失时注入，避免重复覆盖
  if (typeof s.decrementCooldowns !== "function") {
    storeAny.setState((prev: any) => ({
      ...prev,
      decrementCooldowns: () => {
        storeAny.setState((p: any) => {
          const prevCds = p.talentCooldowns ?? {};
          const nextCds: Record<string, number> = { ...prevCds };
          for (const k of Object.keys(nextCds)) {
            const v = safeNumber(nextCds[k], 0);
            nextCds[k] = v > 0 ? v - 1 : 0;
          }
          return { talentCooldowns: nextCds };
        });
      },
    }));
  }

  if (typeof s.useTalent !== "function") {
    storeAny.setState((prev: any) => ({
      ...prev,
      useTalent: (talent: EchoTalent) => {
        const cdNow = safeNumber(storeAny.getState().talentCooldowns?.[talent], 0);
        if (cdNow > 0) return false;
        const nextCd = TALENT_CD[talent] ?? 0;
        storeAny.setState((p: any) => ({
          talentCooldowns: { ...(p.talentCooldowns ?? {}), [talent]: nextCd },
        }));
        return true;
      },
    }));
  }
}

function formatItem(i: Item): string {
  return `${i.name}（${i.tier}）`;
}

const STAT_MAX = 50;

function MobileStatsPanel({
  stats,
  STAT_LABELS,
  STAT_ORDER,
  isDarkMoon,
}: {
  stats: Record<StatType, number>;
  STAT_LABELS: Record<StatType, string>;
  STAT_ORDER: StatType[];
  isDarkMoon: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`lg:hidden sticky top-0 z-30 rounded-2xl border shadow-lg backdrop-blur-2xl ${
        isDarkMoon
          ? "border-red-900/40 bg-red-950/40"
          : "border-white/10 bg-slate-900/50"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className={`text-sm font-semibold ${isDarkMoon ? "text-red-200" : "text-slate-300"}`}>
          属性 · 理智 {stats.sanity ?? 0}/{STAT_MAX}
        </span>
        <span className={`text-xs ${isDarkMoon ? "text-red-300/80" : "text-slate-400"}`}>
          {expanded ? "收起" : "展开"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/10 px-4 py-4">
          <div className="space-y-2">
            {STAT_ORDER.map((k) => (
              <StatEnergyBar
                key={k}
                statName={STAT_LABELS[k]}
                value={stats[k] ?? 0}
                isSanityDanger={k === "sanity" && (stats[k] ?? 0) <= 3}
                isDarkMoon={isDarkMoon}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatEnergyBar({
  statName,
  value,
  isSanityDanger,
  isDarkMoon,
}: {
  statName: string;
  value: number;
  isSanityDanger: boolean;
  isDarkMoon: boolean;
}) {
  const bar1 = (Math.min(value, 25) / 25) * 100;
  const bar2 = (Math.max(0, value - 25) / 25) * 100;

  const fillGradient = isSanityDanger
    ? "from-red-600 to-red-500"
    : "from-indigo-500 to-blue-400";
  const glowColor = isSanityDanger ? "bg-red-500/50" : "bg-indigo-400/50";
  const bar2Gradient = isSanityDanger
    ? "from-red-500 to-rose-400"
    : "from-purple-500 to-fuchsia-400";

  const labelClass = isSanityDanger
    ? "text-red-400 animate-pulse font-bold"
    : "text-white font-bold tracking-widest";
  const valueClass = isDarkMoon ? "text-red-300/70" : "text-slate-500";
  const trackBg = isDarkMoon ? "bg-red-900/50" : "bg-slate-800/50";

  return (
    <div className="relative mb-6 group">
      {isSanityDanger && (
        <div
          className="absolute -inset-2 bg-red-500/10 blur-xl rounded-full z-[-1] animate-pulse"
          aria-hidden
        />
      )}
      <div className="flex justify-between items-end mb-2">
        <span className={`text-sm font-medium tracking-widest ${labelClass}`}>
          {statName}
        </span>
        <span className={`text-xs font-mono ${valueClass}`}>{value} / {STAT_MAX}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className={`relative h-1.5 w-full rounded-full overflow-hidden border border-white/5 ${trackBg}`}>
          <div
            className={`absolute top-0 left-0 h-full bg-gradient-to-r ${fillGradient} transition-all duration-700 ease-out`}
            style={{ width: `${bar1}%` }}
          />
          {bar1 > 0 && (
            <div
              className={`absolute top-0 left-0 h-full blur-sm opacity-50 ${glowColor}`}
              style={{ width: `${bar1}%` }}
            />
          )}
        </div>
        <div className={`relative h-1.5 w-full rounded-full overflow-hidden border border-white/5 ${trackBg}`}>
          <div
            className={`absolute top-0 left-0 h-full bg-gradient-to-r ${bar2Gradient} transition-all duration-700 ease-out`}
            style={{ width: `${bar2}%` }}
          />
          {bar2 > 0 && !isSanityDanger && (
            <div
              className="absolute top-0 left-0 h-full bg-purple-400/50 blur-sm opacity-50"
              style={{ width: `${bar2}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlayPage() {
  const router = useRouter();
  const lastAutoSaveRef = useRef(0);

  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);

  const stats = useGameStore((s) => s.stats);
  const inventory = useGameStore((s) => s.inventory);
  const talent = useGameStore((s) => s.talent);
  const talentCooldowns = useGameStore((s) => s.talentCooldowns);
  const logs = useGameStore((s) => s.logs ?? []);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const advanceTime = useGameStore((s) => s.advanceTime);
  const setStats = useGameStore((s) => s.setStats);
  const rewindTime = useGameStore((s) => s.rewindTime);
  const popLastNLogs = useGameStore((s) => s.popLastNLogs);
  const codex = useGameStore((s) => s.codex ?? {});
  const mergeCodex = useGameStore((s) => s.mergeCodex);
  const hasReadParchment = useGameStore((s) => s.hasReadParchment ?? false);
  const hasCheckedCodex = useGameStore((s) => s.hasCheckedCodex ?? false);
  const warehouse = useGameStore((s) => s.warehouse ?? []);
  const setHasReadParchment = useGameStore((s) => s.setHasReadParchment);
  const setHasCheckedCodex = useGameStore((s) => s.setHasCheckedCodex);
  const currentOptions = useGameStore((s) => s.currentOptions ?? []);
  const setCurrentOptions = useGameStore((s) => s.setCurrentOptions);
  const inputMode = useGameStore((s) => s.inputMode ?? "options");
  const toggleInputMode = useGameStore((s) => s.toggleInputMode);
  const originium = useGameStore((s) => s.originium ?? 0);
  const tasks = useGameStore((s) => s.tasks ?? []);
  const addOriginium = useGameStore((s) => s.addOriginium);
  const addTask = useGameStore((s) => s.addTask);
  const updateTaskStatus = useGameStore((s) => s.updateTaskStatus);
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const setPlayerLocation = useGameStore((s) => s.setPlayerLocation);
  const updateNpcLocation = useGameStore((s) => s.updateNpcLocation);
  const intrusionFlashUntil = useGameStore((s) => s.intrusionFlashUntil ?? 0);
  const isGameStarted = useGameStore((s) => s.isGameStarted ?? false);
  const activeMenu = usePersistStore((s) => s.activeMenu);
  const setActiveMenu = usePersistStore((s) => s.setActiveMenu);
  const [showIntrusionFlash, setShowIntrusionFlash] = useState(false);

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [rawDmBuffer, setRawDmBuffer] = useState("");
  const [liveNarrative, setLiveNarrative] = useState("");
  const [showDarkMoonOverlay, setShowDarkMoonOverlay] = useState(false);
  const [showApocalypseOverlay, setShowApocalypseOverlay] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [audioMuted, setAudioMuted] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredOpening = useRef(false);
  const userScrolledUpRef = useRef(false);

  const day = time.day ?? 0;
  const hour = time.hour ?? 0;
  const isDarkMoon = day >= 3 && day < 10;
  const isApocalypse = day >= 10;
  useHeartbeat(isHydrated && isGameStarted);

  const sanity = stats.sanity ?? 0;
  const displayLocation = useMemo(() => formatLocationLabel(playerLocation), [playerLocation]);

  const talentCdLeft = useMemo(() => {
    if (!talent) return 0;
    return safeNumber(talentCooldowns?.[talent], 0);
  }, [talent, talentCooldowns]);

  useEffect(() => {
    ensureRuntimeActions();
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    void Promise.resolve(useGameStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, [isMounted, setHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isGameStarted) {
      router.replace("/");
    }
  }, [isHydrated, isGameStarted, router]);

  useEffect(() => {
    if (!isHydrated) return;
    const t = useGameStore.getState().time ?? { day: 0, hour: 0 };
    if (t.day >= 10 && !showApocalypseOverlay) {
      setShowApocalypseOverlay(true);
    }
  }, [isHydrated, showApocalypseOverlay]);

  const { text: smoothNarrative, isComplete: smoothComplete, isThinking: smoothThinking } = useSmoothStream(
    liveNarrative,
    isStreaming
  );

  const prevIsStreamingRef = useRef(false);
  const onScrollContainer = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight, scrollHeight } = el;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 10;
    userScrolledUpRef.current = !atBottom;
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    if (userScrolledUpRef.current) return;
    if (isStreaming) {
      el.scrollTop = el.scrollHeight;
    } else {
      if (prevIsStreamingRef.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevIsStreamingRef.current = isStreaming;
  }, [smoothNarrative, isStreaming]);

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
    if (!isMounted || !isHydrated) return;
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
  }, [isMounted, isHydrated]);

  useEffect(() => {
    if (!isMounted || !isHydrated || isStreaming || hasTriggeredOpening.current) return;
    const currentLogs = useGameStore.getState().logs ?? [];
    if (currentLogs.length === 0) {
      hasTriggeredOpening.current = true;
      void sendAction(
        '【系统强制指令：玩家刚刚苏醒。请直接输出第一人称开场白。必须以“一股庞大的知识粗暴地灌进了我的脑子……”开头。在叙事中自然地告诉玩家：1. 这里是如月公寓，共7层，每层有一只无法被徒手杀死的诡异；2. 目前所在的B1层没有诡异，但不要轻易相信其他被称为“原住民”的NPC；3. 关键规则教学：在叙事结尾，以脑海中的神秘低语或羊皮纸上的血字的形式，隐晦地提示玩家：“你可以跟随直觉做出选择（点击选项），或亲自在脑海中构思你的下一步行动（切换为文字填空）”。切记：所有提示必须完美融入惊悚世界观，绝对不可打破第四面墙，语气要冷酷、诡异！】',
        true
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendAction is stable, avoid re-trigger
  }, [isMounted, isHydrated, isStreaming]);

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
    const handlePageHide = () => autoSaveProgress();
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

  async function sendAction(action: string, bypassLengthCheck?: boolean) {
    if (isStreaming) return;
    const trimmed = action.trim();
    if (!trimmed) return;
    if (!bypassLengthCheck && trimmed.length > MAX_INPUT) return;

    setIsStreaming(true);
    setRawDmBuffer("");
    setLiveNarrative("");

    useGameStore.getState().pushLog({ role: "user", content: trimmed });

    const diceRoll = Math.floor(Math.random() * 100) + 1;
    const actionPayload = `【系统暗骰：本次行动检定值为 ${diceRoll}/100 (1为大成功，100为大失败)】\n玩家行动：${trimmed}`;

    const history = useGameStore.getState().logs ?? [];
    const messages: ChatMessage[] = history.map((l, idx) => {
      const isLastUser = idx === history.length - 1 && l.role === "user";
      return {
        role: l.role as ChatRole,
        content: isLastUser ? actionPayload : l.content,
      };
    });

    const playerContext = useGameStore.getState().getPromptContext();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        playerContext,
      }),
    });

    if (!res.ok || !res.body) {
      setIsStreaming(false);
      setLiveNarrative(`连接失败：${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    let raw = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buf.indexOf("\n\n");
          if (idx === -1) break;
          const event = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const lines = event.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const chunk = line.slice(5).trimStart();
            raw += chunk;
            setRawDmBuffer(raw);

            const partial = extractNarrative(raw);
            setLiveNarrative((prev) => {
              if (partial.length > prev.length) return partial;
              return prev;
            });
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    }

    const parsed = tryParseDM(raw);
    if (!parsed) {
      setIsStreaming(false);
      setLiveNarrative(
        "深渊 DM 输出解析失败。请尝试缩短动作描述，或稍后重试。"
      );
      return;
    }

    useGameStore.getState().pushLog({
      role: "assistant",
      content: parsed.narrative,
      reasoning: undefined,
    });

    setLiveNarrative("");

    if (Array.isArray(parsed.consumed_items) && parsed.consumed_items.length > 0) {
      useGameStore.getState().consumeItems(parsed.consumed_items);
    }

    const validTiers = ["S", "A", "B", "C", "D"] as const;
    if (Array.isArray(parsed.awarded_items) && parsed.awarded_items.length > 0) {
      const items: Item[] = parsed.awarded_items
        .filter((r) => r && typeof r === "object" && typeof (r as Record<string, unknown>).name === "string")
        .map((r, idx) => {
          const o = r as Record<string, unknown>;
          const id =
            typeof o.id === "string" && o.id
              ? o.id
              : `I-AWARD-${Date.now()}-${idx}`;
          const name = String(o.name ?? "未知道具");
          const tier = validTiers.includes(String(o.tier) as (typeof validTiers)[number])
            ? (String(o.tier) as Item["tier"])
            : "B";
          return {
            id,
            name,
            tier,
            description: typeof o.description === "string" ? o.description : name,
            tags: typeof o.tags === "string" ? o.tags : "loot",
            statBonus: (o.statBonus as Item["statBonus"]) ?? undefined,
          } satisfies Item;
        });
      if (items.length > 0) {
        useGameStore.getState().addItems(items);
        useGameStore.getState().pushLog({
          role: "assistant",
          content: "**获得了新物品，已放入书包**",
          reasoning: undefined,
        });
      }
    }

    if (Array.isArray(parsed.codex_updates) && parsed.codex_updates.length > 0) {
      const entries: CodexEntry[] = parsed.codex_updates.filter(
        (u): u is { id: string; name: string; type: "npc" | "anomaly" } =>
          u && typeof u.id === "string" && typeof u.name === "string" && (u.type === "npc" || u.type === "anomaly")
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
      mergeCodex(entries);
    }

    const dmg = clampInt(parsed.sanity_damage ?? 0, 0, 9999);
    if (dmg > 0) {
      const cur = useGameStore.getState().stats.sanity ?? 0;
      useGameStore.getState().setStats({ sanity: Math.max(0, cur - dmg) });
    }

    if (Array.isArray(parsed.options) && parsed.options.length > 0) {
      const validOpts = parsed.options
        .filter((o): o is string => typeof o === "string" && o.length > 0)
        .slice(0, 4);
      setCurrentOptions(validOpts);
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
      const storeAny = useGameStore as any;
      storeAny.getState().decrementCooldowns();
      const prevTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      advanceTime();
      useGameStore.getState().tryOriginiumDrop();
      const nextTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      if (prevTime.day < 3 && nextTime.day === 3 && nextTime.hour === 0) {
        setShowDarkMoonOverlay(true);
      }
      if (nextTime.day >= 10) {
        setShowApocalypseOverlay(true);
      }
    }

    setIsStreaming(false);

    const sanityAfter = useGameStore.getState().stats.sanity ?? 0;

    if (parsed.is_death || sanityAfter <= 0) {
      useGameStore.getState().clearSaveForDeath();
      setTimeout(() => router.push("/settlement"), 2000);
    }
  }

  function onSubmit() {
    const trimmed = input.trim();
    if (trimmed.length > MAX_INPUT) {
      setInputError("输入不可超过20个字符");
      return;
    }
    setInputError("");
    void sendAction(input);
    setInput("");
  }

  function onUseTalent() {
    if (!talent) return;
    if (talentCdLeft > 0) return;
    const storeAny = useGameStore as { getState: () => { useTalent: (t: EchoTalent) => boolean } };
    const ok = storeAny.getState().useTalent(talent);
    if (!ok) return;

    switch (talent) {
      case "时间回溯": {
        rewindTime();
        popLastNLogs(2);
        break;
      }
      case "命运馈赠": {
        void sendAction(
          '【系统强制干预：玩家发动了"命运馈赠"天赋。请在接下来的叙事中，顺理成章地给予玩家一个随机的世界观相关物品，并用红色加粗标出。】',
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
        const hist = useGameStore.getState().historicalMaxSanity ?? 50;
        setStats({ sanity: hist });
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
          '【系统强制干预：玩家发动了"丧钟回响"。请在叙事中安排一种极度诡异的死法，强制处决当前场景中的一名恶意NPC或诡异（若存在）。】',
          true
        );
        break;
      }
    }
  }

  function onUseItem(item: Item) {
    if (item.id === "I-PARCHMENT") setHasReadParchment(true);
    const text = `我使用了道具：【${item.name}】`;
    void sendAction(text);
    setActiveMenu(null);
  }

  const withTransition = useCallback((fn: () => void) => {
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        flushSync(fn);
      });
    } else {
      fn();
    }
  }, []);

  function onSaveAndExit() {
    useGameStore.getState().saveGame("auto_save");
    setShowExitModal(false);
    router.push("/");
  }

  function onAbandonAndDie() {
    setStats({ sanity: 0 });
    setShowExitModal(false);
  }

  if (!isMounted || !isHydrated || !isGameStarted) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#0f172a] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
          <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
          <p className="text-sm text-slate-400">读取世界线中...</p>
        </div>
      </main>
    );
  }

  const displayMessages = logs.map((l) => ({ role: l.role as ChatRole, content: l.content }));

  return (
    <main
      className={`min-h-[100dvh] transition-all duration-1000 ${
        isDarkMoon
          ? "bg-gradient-to-b from-red-950/20 via-red-950/10 to-black text-red-100"
          : "bg-background text-foreground"
      }`}
    >
      {showDarkMoonOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-700"
          aria-hidden
        >
          <p className="animate-pulse text-3xl font-bold tracking-widest text-red-600 md:text-5xl">
            暗月已至
          </p>
        </div>
      )}

      {showApocalypseOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-1000"
          aria-hidden
        >
          <p className="animate-pulse text-center text-xl font-bold tracking-widest text-white md:text-3xl">
            十日已至，一切终焉。
          </p>
        </div>
      )}

      {showIntrusionFlash && (
        <div className="pointer-events-none fixed inset-0 z-[60] animate-pulse border-[6px] border-red-600/40 shadow-[inset_0_0_60px_rgba(220,38,38,0.15)]" aria-hidden />
      )}

      <header className="relative z-40 flex w-full flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-slate-900/20 px-4 py-3 shadow-sm backdrop-blur-xl md:flex-nowrap md:gap-4 md:px-6 md:py-4">
        <div className="flex items-center gap-4">
          <div className="relative group flex items-center">
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-indigo-500/30 to-blue-500/30 opacity-70 blur-xl transition-opacity group-hover:opacity-100" aria-hidden />
            <h1 className="relative z-10 text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 drop-shadow-md md:text-3xl">
              意识潜入
            </h1>
          </div>
          <div className="hidden items-center rounded-full border border-cyan-400/20 bg-cyan-950/30 px-4 py-1.5 shadow-[0_0_12px_rgba(34,211,238,0.15)] backdrop-blur-md md:flex">
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-cyan-400/70">位置</span>
            <span className="ml-2 text-xs font-bold text-cyan-300 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]">{displayLocation}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowExitModal(true)}
            className="rounded-full border border-red-500/30 bg-red-950/50 px-6 py-2 text-sm font-bold tracking-widest text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all backdrop-blur-md hover:bg-red-900/70"
          >
            退出
          </button>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-6 max-md:pb-28 md:px-6 md:py-8">
      {showExitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal
          aria-labelledby="exit-modal-title"
        >
          <div className="mx-4 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
            <h2 id="exit-modal-title" className="text-lg font-semibold text-slate-100">
              意识脱离申请
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              选择封存意识可保存进度并返回首页；选择放弃躯壳将直接触发死亡。
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onSaveAndExit}
                className="rounded-xl border border-white/60 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 shadow-[0_0_12px_rgba(59,130,246,0.4)] transition hover:bg-white/10 hover:shadow-[0_0_16px_rgba(59,130,246,0.5)]"
              >
                封存意识 (保存并退出)
              </button>
              <button
                type="button"
                onClick={onAbandonAndDie}
                className="rounded-xl bg-gradient-to-r from-red-700 to-red-800 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] transition hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]"
              >
                放弃躯壳 (直接抹杀)
              </button>
            </div>
          </div>
        </div>
      )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-4">
            {/* Mobile: 吸顶可折叠 | PC: 侧边栏 */}
            <MobileStatsPanel
              stats={stats}
              STAT_LABELS={STAT_LABELS}
              STAT_ORDER={STAT_ORDER}
              isDarkMoon={isDarkMoon}
            />
            <div
              className={`hidden lg:block rounded-3xl border p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] ${
                isDarkMoon
                  ? "border-red-900/40 bg-red-950/30 backdrop-blur-2xl"
                  : "border-white/10 bg-slate-900/40 backdrop-blur-2xl"
              }`}
            >
              <h2 className={`mb-5 text-sm font-semibold tracking-widest ${isDarkMoon ? "text-red-200" : "text-slate-300"}`}>
                属性
              </h2>
              <div className="space-y-2">
                {STAT_ORDER.map((k) => (
                  <StatEnergyBar
                    key={k}
                    statName={STAT_LABELS[k]}
                    value={stats[k] ?? 0}
                    isSanityDanger={k === "sanity" && (stats[k] ?? 0) <= 3}
                    isDarkMoon={isDarkMoon}
                  />
                ))}
              </div>
            </div>
          </aside>

          <section className="lg:col-span-8">
            <div
              className={`relative rounded-2xl border ${
                isDarkMoon ? "border-red-900/50 bg-red-950/30" : "border-border bg-white"
              }`}
            >
              {/* Echo Talent: inside narrative card, top-right */}
              <div className="absolute top-4 right-4 z-20">
                <div className="relative group rounded-full border border-white/20 bg-slate-900/70 backdrop-blur-xl shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                  {talent && talentCdLeft === 0 && !isStreaming && (
                    <div
                      className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-600 opacity-70 blur transition-opacity duration-500 group-hover:opacity-100 animate-[pulse_3s_ease-in-out_infinite]"
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={onUseTalent}
                    disabled={!talent || talentCdLeft > 0 || isStreaming}
                    className={`relative rounded-full px-5 py-2 font-bold tracking-widest transition-all ${
                      talent && talentCdLeft === 0 && !isStreaming
                        ? "bg-slate-900/80 backdrop-blur-xl border border-white/20 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] hover:bg-slate-800/90"
                        : "bg-slate-900/30 border border-slate-700/50 text-slate-500 cursor-not-allowed grayscale"
                    }`}
                  >
                    {talent ? (
                      talentCdLeft > 0 ? (
                        <>{talent} (冷却: {talentCdLeft} 时)</>
                      ) : (
                        <>发动：{talent}</>
                      )
                    ) : (
                      <>未选择回响天赋</>
                    )}
                  </button>
                </div>
              </div>

              <div className={`border-b px-5 py-4 ${isDarkMoon ? "border-red-900/50" : "border-border"}`}>
                <h2 className={`text-sm font-semibold ${isDarkMoon ? "text-red-200" : ""}`}>叙事主视窗</h2>
              </div>

              <div
                ref={scrollRef}
                onScroll={onScrollContainer}
                className="h-[54dvh] min-h-[200px] overflow-y-auto overscroll-contain px-5 py-5"
                style={{ overflowAnchor: "auto" }}
              >
                <div className="space-y-4">
                  {displayMessages.map((m, idx) => (
                    <div
                      key={`${m.role}-${idx}`}
                      className={`animate-[fadeIn_0.8s_ease-out] rounded-2xl border px-4 py-3 text-sm leading-7 ${
                        isDarkMoon
                          ? m.role === "user"
                            ? "border-red-900/40 bg-red-950/50 text-red-100"
                            : "border-red-900/40 bg-red-950/20 text-red-100"
                          : m.role === "user"
                            ? "border-border bg-muted text-neutral-900"
                            : "border-border bg-white text-neutral-900"
                      }`}
                    >
                      <div
                        className={`mb-1 text-xs font-semibold ${
                          isDarkMoon ? "text-red-300/90" : "text-neutral-600"
                        }`}
                      >
                        {m.role === "user" ? "你" : "DM"}
                      </div>
                      <div className={m.role === "assistant" ? "" : "whitespace-pre-wrap"}>
                        {m.role === "assistant" ? (
                          m.content.includes("获得了新物品，已放入书包") ? (
                            <p className="font-bold text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]">
                              {m.content.replace(/\*\*/g, "")}
                            </p>
                          ) : (
                            <DMNarrativeBlock content={m.content} isDarkMoon={isDarkMoon} />
                          )
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>
                  ))}

                  {isStreaming ? (
                    <div
                      className={`min-h-[100px] animate-[fadeIn_0.8s_ease-out] rounded-2xl border px-4 py-3 text-sm ${
                        isDarkMoon
                          ? "border-red-900/40 bg-red-950/20 text-red-100"
                          : "border-border bg-white text-neutral-900"
                      }`}
                    >
                      <div className={`mb-1 text-xs font-semibold ${isDarkMoon ? "text-red-300/90" : "text-neutral-600"}`}>
                        DM
                      </div>
                      {smoothThinking ? (
                        <div className="flex items-center gap-3 py-2">
                          <div className="relative flex h-6 w-6 items-center justify-center">
                            <div className="absolute inset-0 rounded-full border-[3px] border-slate-200/20" />
                            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                          </div>
                          <span className="animate-pulse bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-sm font-medium tracking-widest text-transparent">
                            深渊 DM 正在推演...
                          </span>
                        </div>
                      ) : (
                        <div className={isDarkMoon ? "space-y-6 leading-[2.2] tracking-wide text-[1.05rem] text-slate-200" : "space-y-6 leading-[2.2] tracking-wide text-[1.05rem] text-slate-800"}>
                          <span className="whitespace-pre-wrap">
                            {renderNarrativeText(smoothNarrative)}
                          </span>
                          {!smoothComplete && (
                            <span
                              className="ml-1 inline-block h-5 w-1.5 align-middle bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                              aria-hidden
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ) : liveNarrative ? (
                    <div
                      className={`animate-[fadeIn_0.8s_ease-out] rounded-2xl border px-4 py-3 text-sm ${
                        isDarkMoon
                          ? "border-red-900/40 bg-red-950/20 text-red-100"
                          : "border-border bg-white text-neutral-900"
                      }`}
                    >
                      <div className={`mb-1 text-xs font-semibold ${isDarkMoon ? "text-red-300/90" : "text-neutral-600"}`}>
                        DM
                      </div>
                      <DMNarrativeBlock content={liveNarrative} isDarkMoon={isDarkMoon} />
                    </div>
                  ) : (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkMoon
                          ? "border-red-900/40 bg-red-950/20 text-red-300/80"
                          : "border-border bg-white text-neutral-600"
                      }`}
                    >
                    </div>
                  )}
                </div>
              </div>

              <div className={`border-t p-4 ${isDarkMoon ? "border-red-900/50" : "border-border"}`}>
                {!hasReadParchment && logs.length === 0 ? (
                  <p className={`py-3 text-center text-sm ${isDarkMoon ? "text-red-400/70" : "text-neutral-500"}`}>
                    你需要先查看行囊中的羊皮纸...
                  </p>
                ) : isStreaming ? (
                  <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-white/10 bg-white/10 px-8 py-12 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      <div
                        className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400/80 border-r-purple-400/60 animate-spin"
                        style={{
                          boxShadow:
                            "0 0 20px rgba(99, 102, 241, 0.4), 0 0 40px rgba(139, 92, 246, 0.2), inset 0 0 20px rgba(99, 102, 241, 0.1)",
                        }}
                        aria-hidden
                      />
                      <div
                        className="absolute inset-2 rounded-full border-2 border-transparent border-b-cyan-400/50 border-l-indigo-400/50 animate-spin"
                        style={{
                          animationDirection: "reverse",
                          animationDuration: "2s",
                          boxShadow: "0 0 12px rgba(34, 211, 238, 0.3)",
                        }}
                        aria-hidden
                      />
                    </div>
                    <p
                      className={`text-center text-sm font-medium tracking-wide ${isDarkMoon ? "text-red-200/90" : "text-slate-700"} animate-[breathe_2s_ease-in-out_infinite]`}
                      style={{ textShadow: "0 0 16px rgba(99, 102, 241, 0.5)" }}
                    >
                      深渊正在推演命运的选项，请稍候...
                    </p>
                  </div>
                ) : (() => {
                  const showOpts = inputMode === "options" && currentOptions.length > 0;
                  return (
                    <div className="relative">
                      {/* Layer A: Options grid */}
                      <div
                        className={`transition-all duration-300 ease-in-out ${
                          showOpts
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-4 pointer-events-none absolute inset-0"
                        }`}
                      >
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {currentOptions.map((option, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => { playUIClick(); void sendAction(option, true); }}
                              disabled={isStreaming}
                              className="relative group p-4 text-left bg-slate-900/50 backdrop-blur-2xl border border-white/15 rounded-[1.5rem] ring-1 ring-white/5 hover:bg-slate-800/70 hover:border-indigo-400/60 hover:ring-2 hover:ring-white/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.35),0_10px_30px_-10px_rgba(99,102,241,0.25)] transition-all duration-300 hover:-translate-y-1 overflow-hidden disabled:opacity-40"
                              style={{ animationDelay: `${idx * 80}ms` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-purple-500/0 to-cyan-500/0 group-hover:from-indigo-500/15 group-hover:via-purple-500/10 group-hover:to-cyan-500/15 transition-all duration-300" />
                              <div className="absolute -inset-px rounded-[1.5rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-indigo-500/20 via-transparent to-purple-500/20 blur-sm" aria-hidden />
                              <span className="relative z-10 text-sm md:text-base text-white/95 group-hover:text-white font-medium tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                                {option}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className={`text-xs ${isDarkMoon ? "text-red-300/60" : "text-neutral-500"}`}>
                            选择一个行动，或切换至手动输入
                          </span>
                          <button
                            type="button"
                            onClick={() => withTransition(toggleInputMode)}
                            className="flex items-center gap-1.5 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium tracking-widest text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all duration-300 hover:bg-indigo-500/20 hover:border-indigo-400/60"
                          >
                            <Keyboard size={14} strokeWidth={1.5} />
                            <span>手动输入</span>
                          </button>
                        </div>
                      </div>

                      {/* Layer B: Text input */}
                      <div
                        className={`transition-all duration-300 ease-in-out ${
                          showOpts
                            ? "opacity-0 -translate-y-4 pointer-events-none absolute inset-0"
                            : "opacity-100 translate-y-0"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <input
                            value={input}
                            onChange={(e) => {
                              setInput(e.target.value);
                              setInputError("");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") onSubmit();
                            }}
                            placeholder="输入指令，最多20字"
                            inputMode="text"
                            enterKeyHint="done"
                            className={`min-h-[44px] h-12 w-full rounded-xl border px-4 text-base outline-none transition md:text-sm ${
                              isDarkMoon
                                ? "border-red-900/50 bg-red-950/50 text-red-100 placeholder:text-red-400/50 focus:border-red-700"
                                : "border-border bg-white focus:border-neutral-400"
                            }`}
                            disabled={isStreaming}
                          />
                          <button
                            type="button"
                            onClick={onSubmit}
                            disabled={isStreaming || input.trim().length === 0}
                            className={`min-h-[44px] h-12 shrink-0 rounded-xl px-6 text-base font-semibold transition disabled:opacity-40 md:text-sm ${
                              isDarkMoon ? "bg-red-900 text-red-100" : "bg-foreground text-background"
                            }`}
                          >
                            确认
                          </button>
                        </div>
                        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-xs ${isDarkMoon ? "text-red-300/80" : "text-neutral-600"}`}>
                          <span>字数：{input.trim().length}/{MAX_INPUT}</span>
                          <div className="flex items-center gap-3">
                            {inputError ? (
                              <span className="text-red-500 font-medium">{inputError}</span>
                            ) : (
                              <span className={input.trim().length > MAX_INPUT ? "text-red-500" : ""}>
                                {input.trim().length > MAX_INPUT
                                  ? "动作过长：将被公寓拒绝。"
                                  : isStreaming
                                    ? "深渊 DM 正在推演..."
                                    : "保持简短。保持真实。"}
                              </span>
                            )}
                            {currentOptions.length > 0 && !isStreaming && (
                              <button
                                type="button"
                                onClick={() => withTransition(toggleInputMode)}
                                className="flex items-center gap-1.5 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium tracking-widest text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all duration-300 hover:bg-indigo-500/20 hover:border-indigo-400/60"
                              >
                                <List size={14} strokeWidth={1.5} />
                                <span>返回选项</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 底部 Action Bar: 设置 | 意识潜入区 | 时间 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center px-4 py-4 md:bottom-6 md:px-8 md:pb-6">
        <div
          className="flex w-full max-w-4xl flex-row items-center justify-between gap-6 rounded-2xl border border-white/10 bg-slate-900/40 px-6 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl md:px-8"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {/* 左侧: 设置按钮 - Apple Liquid Glass 光效 */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setActiveMenu("settings")}
              className="group relative flex h-12 min-h-12 items-center justify-center overflow-hidden rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-white shadow-[0_0_20px_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
              title="设置"
            >
              <div
                className="absolute inset-[-80%] animate-[spin_8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.4)_90deg,transparent_180deg,rgba(255,255,255,0.3)_270deg,transparent_360deg)] opacity-80"
                aria-hidden
              />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]" aria-hidden />
              <Settings className="relative z-10 h-5 w-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" strokeWidth={1.5} />
            </button>
          </div>

          {/* 中间: 意识潜入输入区占位，实际输入在叙事卡片内 */}
          <div className="min-w-0 flex-1" />

          {/* 右侧: 时间显示 */}
          <div className="flex shrink-0 items-center font-mono text-sm text-slate-400 tabular-nums">
            {day} 日 {hour} 时
          </div>
        </div>
      </div>

      <UnifiedMenuModal
        activeMenu={activeMenu}
        onClose={() => setActiveMenu(null)}
        onUseItem={onUseItem}
        isStreaming={isStreaming}
      />

    </main>
  );
}

