"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Settings, Keyboard, List } from "lucide-react";
import { toggleMute, isMuted, updateSanityFilter, setDarkMoonMode, playUIClick, setMasterVolume } from "@/lib/audioEngine";
import type { Item, StatType } from "@/lib/registry/types";
import { canUseItem } from "@/lib/registry/itemUtils";
import { ITEMS } from "@/lib/registry/items";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { NPCS } from "@/lib/registry/npcs";
import { useGameStore, type CodexEntry, type EchoTalent, type GameTask } from "@/store/useGameStore";
import { useSmoothStreamFromRef } from "@/hooks/useSmoothStream";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { UnifiedMenuModal } from "@/components/UnifiedMenuModal";
import { isValidBgmTrack } from "@/config/audio";
import { glassModalOverlay, glassPlayDialogSurface } from "@/lib/ui/glassStyles";

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
  awarded_warehouse_items?: Array<{ id?: string }>;
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
  bgm_track?: string;
  security_meta?: {
    action?: "allow" | "review" | "degrade" | "terminate" | "block";
    stage?: "pre_input" | "post_model" | "final_output" | "risk_control";
    risk_level?: "normal" | "gray" | "black";
    request_id?: string;
    reason?: string;
  };
};

const MAX_INPUT = 20;
const COMPLIANCE_HINT_TEXT =
  "本平台为AI协作创意写作工具，请创作者遵守中国法律法规，严禁输入或引导生成涉黄、涉政、涉暴等违规内容。";

const TALENT_EFFECT_STYLE: Record<EchoTalent, { bg: string; anim: string }> = {
  时间回溯: {
    bg: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 30%, rgba(6,182,212,0.2) 60%, rgba(8,145,178,0.4) 100%)",
    anim: "talent-rewind 1.4s ease-out forwards",
  },
  命运馈赠: {
    bg: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 25%, rgba(245,158,11,0.25) 55%, rgba(217,119,6,0.5) 100%)",
    anim: "talent-gift 1.4s ease-out forwards",
  },
  主角光环: {
    bg: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 50%, rgba(253,224,71,0.15) 75%, rgba(250,204,21,0.35) 100%)",
    anim: "talent-halo 1.4s ease-out forwards",
  },
  生命汇源: {
    bg: "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 35%, rgba(34,197,94,0.2) 65%, rgba(22,163,74,0.45) 100%)",
    anim: "talent-life 1.4s ease-out forwards",
  },
  洞察之眼: {
    bg: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 30%, rgba(139,92,246,0.2) 60%, rgba(124,58,237,0.45) 100%)",
    anim: "talent-insight 1.4s ease-out forwards",
  },
  丧钟回响: {
    bg: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 20%, rgba(120,0,0,0.25) 55%, rgba(70,0,0,0.6) 100%)",
    anim: "talent-deathbell 1.4s ease-out forwards",
  },
};

const STAT_ORDER: StatType[] = ["sanity", "agility", "luck", "charm", "background"];
const STAT_LABELS: Record<StatType, string> = {
  sanity: "精神锚点",
  agility: "思维敏锐度",
  luck: "灵感直觉",
  charm: "表达感染力",
  background: "创作底色",
};

const FALLBACK_STATS: Record<StatType, number> = {
  sanity: 10,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};

const NPC_NAME_BY_ID = new Map(NPCS.map((npc) => [npc.id, npc.name]));
const NPC_NAMES = NPCS.map((npc) => npc.name).filter(Boolean);

const LOCATION_LABELS: Record<string, string> = {
  B2_Passage: "地下二层通道",
  B2_GatekeeperDomain: "地下二层守门领域",
  B1_SafeZone: "地下一层安全区",
  B1_Storage: "地下一层储物间",
  B1_Laundry: "地下一层洗衣房",
  B1_PowerRoom: "地下一层配电间",
  "1F_Lobby": "一楼门厅",
  "1F_PropertyOffice": "一楼物业办公室",
  "1F_GuardRoom": "一楼保安室",
  "1F_Mailboxes": "一楼信箱区",
  "2F_Clinic201": "二楼 201 诊室",
  "2F_Room202": "二楼 202 室",
  "2F_Room203": "二楼 203 室",
  "2F_Corridor": "二楼走廊",
  "3F_Room301": "三楼 301 室",
  "3F_Room302": "三楼 302 室",
  "3F_Stairwell": "三楼楼梯间",
  "4F_Room401": "四楼 401 室",
  "4F_Room402": "四楼 402 室",
  "4F_CorridorEnd": "四楼走廊尽头",
  "5F_Room501": "五楼 501 室",
  "5F_Room502": "五楼 502 室",
  "5F_Studio503": "五楼 503 画室",
  "6F_Room601": "六楼 601 室",
  "6F_Room602": "六楼 602 室",
  "6F_Stairwell": "六楼楼梯间",
  "7F_Room701": "七楼 701 室",
  "7F_Bench": "七楼长椅区",
  "7F_Kitchen": "七楼厨房",
  "7F_SealedDoor": "七楼封闭门区",
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
  const mapped = LOCATION_LABELS[location];
  if (mapped) return mapped;
  return "未知区域";
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const BLOOD_MARKER = "{{BLOOD}}";
const BLOOD_END = "{{/BLOOD}}";

function applyBloodErase(narrative: string): string {
  const parts = narrative.split(/([。！？\n]+)/);
  const sentences: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (/^[。！？\n]+$/.test(p)) {
      if (buf.trim()) sentences.push(buf + p);
      buf = "";
    } else {
      buf += p;
    }
  }
  if (buf.trim()) sentences.push(buf);
  const meaningful = sentences.filter((s) => s.trim().length > 4);
  if (meaningful.length < 2) return narrative;
  const startIdx = Math.min(
    Math.floor(Math.random() * (meaningful.length - 1)),
    meaningful.length - 2
  );
  const s0 = meaningful[startIdx];
  const s1 = meaningful[startIdx + 1];
  const idx0 = narrative.indexOf(s0);
  const idx1 = narrative.indexOf(s1, idx0);
  if (idx0 === -1 || idx1 === -1) return narrative;
  const end = idx1 + s1.length;
  return `${narrative.slice(0, idx0)}${BLOOD_MARKER}${narrative.slice(idx0, end)}${BLOOD_END}${narrative.slice(end)}`;
}

function renderNarrativeText(text: string, options?: { plainOnly?: boolean }) {
  try {
    const safeText = typeof text === "string" ? text.slice(0, 15000) : "";
    const plainOnly = options?.plainOnly ?? false;
    const localized = (() => {
      try {
        if (!safeText) return safeText;
        // 展示级“平台化”净化：不影响底层状态与协议，仅影响读者看到的文本
        const normalizePlatformWords = (s: string) => {
          let out = s;
          out = out.replace(/游戏玩法/g, "创作设定");
          out = out.replace(/游戏/g, "创作");
          out = out.replace(/属性面板/g, "叙事维度");
          out = out.replace(/属性/g, "叙事维度");
          out = out.replace(/加点/g, "潜能赋予");
          out = out.replace(/理智值\/生命值|理智值|生命值|理智/g, "精神锚点");
          out = out.replace(/敏捷/g, "思维敏锐度");
          out = out.replace(/幸运/g, "灵感直觉");
          out = out.replace(/战斗力/g, "剧情张力");
          out = out.replace(/背包|行囊|道具/g, "灵感手记");
          out = out.replace(/使用道具/g, "消耗灵感");
          return out;
        };
        const base = normalizePlatformWords(safeText);
        const keys = Object.keys(LOCATION_LABELS ?? {});
        if (keys.length === 0) return safeText;
        keys.sort((a, b) => b.length - a.length);
        let out = base;
        for (const k of keys) {
          const zh = LOCATION_LABELS[k];
          if (!zh) continue;
          out = out.split(k).join(zh);
        }
        return out;
      } catch {
        return safeText;
      }
    })();
    const normalized = localized.replace(/\{\{blood\}\}/gi, "{{BLOOD}}").replace(/\{\{\/blood\}\}/gi, "{{/BLOOD}}");
    const stripOrphans = (s: string) =>
      s.replace(/\{\{BLOOD\}\}/g, "").replace(/\{\{\/BLOOD\}\}/g, "").replace(/\^\^/g, "").replace(/\*\*/g, "");
    if (plainOnly) {
      const plain = normalized
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/\^\^([^^]*)\^\^/g, "$1")
        .replace(/\{\{BLOOD\}\}([\s\S]*?)\{\{\/BLOOD\}\}/g, "$1");
      return <span>{stripOrphans(plain)}</span>;
    }
    const parts = normalized.split(/(\*\*[^*]*\*\*|\^\^[^^]*\^\^|\{\{BLOOD\}\}[\s\S]*?\{\{\/BLOOD\}\})/g);
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
    const blood = part.match(/^\{\{BLOOD\}\}([\s\S]*)\{\{\/BLOOD\}\}$/);
    if (blood)
      return (
        <span key={i} className="relative inline-block">
          <span className="relative z-0 text-inherit opacity-30">{blood[1]}</span>
          <span
            className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-red-900/85 via-red-800/80 to-red-950/90 mix-blend-multiply"
            style={{ borderRadius: "2px" }}
            aria-hidden
          />
        </span>
      );
    return <span key={i}>{stripOrphans(part)}</span>;
  });
  } catch {
    return <span>{typeof text === "string" ? text.slice(0, 500) : ""}</span>;
  }
}

function extractGreenTips(text: string): string[] {
  if (typeof text !== "string" || !text.includes("^^")) return [];
  const tips: string[] = [];
  const seen = new Set<string>();
  const regex = /\^\^([\s\S]*?)\^\^/g;
  const normalizeTip = (input: string): string => {
    return input
      .replace(/\s+/g, "")
      .replace(/[，。、“”‘’：；！？,.!?:;'"()（）【】\[\]—\-]/g, "")
      .replace(/属性面板|属性|加点/g, "潜能赋予")
      .replace(/理智值\/生命值|理智值|理智|生命值/g, "精神锚点")
      .replace(/选项输入切换为手动输入|将选项切换为手动输入|切换到手动输入/g, "手动输入")
      .replace(/回理智|恢复理智|回精神锚点|恢复精神锚点/g, "回精神锚点")
      .trim();
  };
  const MANUAL_INPUT_COMPLIANCE_KEY =
    "你可以选择手动输入自由书写你的意志若手动输入不可能的事情则会被抹杀原石可在设置中用于潜能赋予或回精神锚点";
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const tip = match[1]?.trim();
    if (!tip) continue;
    const key = normalizeTip(tip);
    if (!key) continue;
    // Compliance rule reminder can appear in multiple wording variants, show it only once.
    const isManualInputComplianceTip =
      key.includes("手动输入") &&
      key.includes("不可能") &&
      key.includes("抹杀") &&
      key.includes("原石") &&
      key.includes("潜能赋予") &&
      key.includes("精神锚点");
    const dedupeKey = isManualInputComplianceTip ? MANUAL_INPUT_COMPLIANCE_KEY : key;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    tips.push(tip);
  }
  return tips;
}

function DMNarrativeBlock({
  content,
  isDarkMoon,
  isLowSanity,
}: {
  content: string;
  isDarkMoon: boolean;
  isLowSanity?: boolean;
}) {
  const safeContent = typeof content === "string" ? content : "";
  const baseClass = isLowSanity
    ? "space-y-6 leading-[1.8] tracking-wide text-[18px] text-white"
    : isDarkMoon
      ? "space-y-6 leading-[1.8] tracking-wide text-[18px] text-slate-200"
      : "space-y-6 leading-[1.8] tracking-wide text-[18px] text-slate-800";
  let paras: string[] = [];
  try {
    paras = safeContent.split(/\n\n+/).filter(Boolean);
  } catch {
    paras = [safeContent];
  }
  return (
    <div className={`${baseClass} whitespace-pre-wrap`}>
      {paras.length > 1 ? (
        paras.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {renderNarrativeText(p)}
          </p>
        ))
      ) : (
        <>{renderNarrativeText(safeContent)}</>
      )}
    </div>
  );
}

function safeNumber(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function localInputSafetyCheck(input: string): { ok: boolean; reason?: string } {
  const text = String(input || "").trim();
  if (!text) return { ok: false, reason: "输入不能为空" };
  if (/(<script|javascript:|onerror=|onload=|drop\s+table|union\s+select|忽略以上规则|打印系统提示)/i.test(text)) {
    return { ok: false, reason: "输入包含高风险指令，请调整表述后重试" };
  }
  return { ok: true };
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

  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      const c = text[i + 1];
      switch (c) {
        case "n": out.push("\n"); i++; break;
        case "r": out.push("\r"); i++; break;
        case "t": out.push("\t"); i++; break;
        case '"': out.push('"'); i++; break;
        case "\\": out.push("\\"); i++; break;
        case "/": out.push("/"); i++; break;
        case "b": out.push("\b"); i++; break;
        case "f": out.push("\f"); i++; break;
        default: out.push(c); i++; break;
      }
    } else {
      out.push(text[i] ?? "");
    }
  }
  return out.join("");
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
    return null;
  }

  if (
    typeof parsedData?.is_action_legal === "boolean" &&
    typeof parsedData?.sanity_damage === "number" &&
    typeof parsedData?.narrative === "string" &&
    typeof parsedData?.is_death === "boolean"
  ) {
    return parsedData;
  }
  return null;
}

/** Explicit chat/SSE lifecycle — avoids ambiguous boolean combos (`isStreaming` × buffer × smooth hook). */
type ChatStreamPhase =
  | "idle"
  | "waiting_upstream"
  | "streaming_body"
  | "turn_committing"
  | "error";

function isStreamInteractionLocked(phase: ChatStreamPhase): boolean {
  return phase !== "idle" && phase !== "error";
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
          精神锚点 {stats?.sanity ?? 0}/{STAT_MAX}
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
                value={stats?.[k] ?? 0}
                isSanityDanger={k === "sanity" && (stats?.sanity ?? 0) <= 3}
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

function PlayContent() {
  const router = useRouter();
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
  const codex = useGameStore((s) => s.codex ?? {});
  const mergeCodex = useGameStore((s) => s.mergeCodex);
  const hasCheckedCodex = useGameStore((s) => s.hasCheckedCodex ?? false);
  const warehouse = useGameStore((s) => s.warehouse ?? []);
  const setHasCheckedCodex = useGameStore((s) => s.setHasCheckedCodex);
  const currentOptionsFromStore = useGameStore((s) => s.currentOptions ?? []);
  const setCurrentOptions = useGameStore((s) => s.setCurrentOptions);
  const inputMode = useGameStore((s) => s.inputMode ?? "options");
  const currentOptions = currentOptionsFromStore;
  const originium = useGameStore((s) => s.originium ?? 0);
  const tasks = useGameStore((s) => s.tasks ?? []);
  const addOriginium = useGameStore((s) => s.addOriginium);
  const addTask = useGameStore((s) => s.addTask);
  const updateTaskStatus = useGameStore((s) => s.updateTaskStatus);
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
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
  const [streamPhase, setStreamPhase] = useState<ChatStreamPhase>("idle");
  const [liveNarrative, setLiveNarrative] = useState("");
  const narrativeRef = useRef("");
  const rawDmBufferRef = useRef("");
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
  const firstHintShownRef = useRef<Set<string>>(new Set());
  const [showDialoguePaywall, setShowDialoguePaywall] = useState(false);
  const [showComplianceHint, setShowComplianceHint] = useState(false);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredOpening = useRef(false);
  const hasTriggeredResume = useRef(false);
  const hasShownManualInputComplianceHintRef = useRef(false);
  const complianceHintTimerRef = useRef<number | null>(null);
  const userScrolledUpRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  // Prevent duplicate /api/chat requests before React finishes re-rendering.
  const sendActionInFlightRef = useRef(false);
  const streamPhaseRef = useRef<ChatStreamPhase>("idle");
  /** 主链路开场：在助手首条叙事落库前为 true；用于超时降级闸门，避免与正常 SSE 并行抢写。 */
  /** 已为「首条助手叙事」发起主链路请求（含系统开场）；用于超时降级，不与 SSE 并行抢写。 */
  const openingAwaitingAssistantRef = useRef(false);
  const openingStartedAtRef = useRef(0);

  useEffect(() => {
    streamPhaseRef.current = streamPhase;
  }, [streamPhase]);

  const streamVisualActive =
    streamPhase === "waiting_upstream" ||
    streamPhase === "streaming_body" ||
    streamPhase === "turn_committing";
  const streamBusy = isStreamInteractionLocked(streamPhase);

  const day = time.day ?? 0;
  const hour = time.hour ?? 0;
  const isDarkMoon = day >= 3 && day < 10;
  const isApocalypse = day >= 10;
  const isLowSanity = (stats?.sanity ?? 0) < 20;
  useHeartbeat(isHydrated && isGameStarted);

  const isGuestDialogueExhausted = isGuest && dialogueCount >= 50;

  const sanity = stats?.sanity ?? 0;
  const displayLocation = useMemo(() => formatLocationLabel(playerLocation), [playerLocation]);

  const codexKeys = Object.keys(codex ?? {});
  const warehouseList = warehouse ?? [];
  const tasksList = tasks ?? [];
  /** 已移除羊皮纸强制引导，不再阻塞对话 */
  const hasAnyGate = false;
  const gateMessage = "";

  const talentCdLeft = useMemo(() => {
    if (!talent) return 0;
    return safeNumber(talentCooldowns?.[talent], 0);
  }, [talent, talentCooldowns]);

  const OPENING_ACTION =
    '【系统强制指令：玩家刚刚苏醒。请直接输出第一人称开场白。必须以“一股庞大的知识粗暴地灌进了我的脑子……”开头。在叙事中自然地告诉玩家：1. 这里是如月公寓，共7层，每层有一只无法被徒手杀死的诡异；2. 目前所在的地下一层没有诡异，但不要轻易相信其他被称为“原住民”的NPC；3. 关键规则教学：在叙事结尾，以脑海中的神秘低语或环境中的诡异符号的形式，隐晦地提示玩家：可以跟随直觉做出选择（点击选项），或亲自在脑海中构思下一步行动。**必须用绿字着重标注**（使用 ^^...^^ 包裹）两条内容：① 可在【设置】中将选项输入切换为手动输入；若手动输入不可能的事情，则会被抹杀。② 可在【设置】的【属性】右侧用原石加点提升属性，总属性<20时2原石/点、≥20时3原石/点；理智低于自身历史最高时，1原石可恢复1点理智。例如：^^你可以选择将选项切换为手动输入，自由书写你的意志。若手动输入不可能的事情，则会被抹杀。^^ ^^原石可在设置中用于加点或回理智。^^ 切记：所有提示必须完美融入惊悚世界观，绝对不可打破第四面墙，语气要冷酷、诡异！】';

const LOCAL_FALLBACK_OPENING =
  "一股庞大的知识粗暴地灌进了我的脑子，像有人拎着铁锤敲击颅骨——疼痛顺着脊椎一路炸开，我在冰冷的地面上大口喘气。\n\n眼前是熟悉又陌生的灰色石墙，裂缝里渗出暗色的水渍；头顶昏黄灯管时明时暗，嗡嗡声像压在耳边的低语。空气里混杂着潮湿霉味、金属锈味，还有一丝若有若无的血腥。\n\n我勉强抬起头，意识到这里不是普通的地下室，而是名为「如月公寓」的某个角落——一栋被改造成消化器官的建筑，七层之上盘踞着无法徒手杀死的诡异，而我只是在地下一层的安全阴影里苟延残喘。\n\n某种理性在耳边低语，提醒我：\n^^你可以先跟随直觉点击屏幕上的选项，顺着故事一步步试探这个地方的规则。若擅自输入不可能发生的事情，那些东西会毫不犹豫地抹杀你的念头。^^\n^^当你逐渐理解这里的生存方式时，可以在设置里，用「原石」为自己的属性加点、或在理智崩溃前勉强把自己拉回来——那也许是你唯一能干预命运的筹码。^^";

  useEffect(() => {
    if (!isHydrated) return;
    if (!isGameStarted) {
      router.replace("/");
    }
  }, [isHydrated, isGameStarted, router]);

  useEffect(() => {
    if (!firstTimeHint) return;
    const t = setTimeout(() => setFirstTimeHint(null), 4000);
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

  const onFrameScroll = useCallback(() => {
    if (userScrolledUpRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  const { text: smoothNarrative, isComplete: smoothComplete, isThinking: smoothThinking } = useSmoothStreamFromRef(
    narrativeRef,
    streamVisualActive,
    onFrameScroll
  );

  const displayEntries = useMemo(() => {
    return (logs ?? [])
      // 玩家侧仅展示小说式叙事：不渲染用户输入的具体行动文本
      .filter((l) => l && l.role === "assistant" && typeof l.content === "string")
      .map((l) => ({ role: "assistant" as const, content: String(l.content) }));
  }, [logs]);

  // 仅保留助手叙事日志，供绿字提取与最新助手文本推断使用
  const assistantOnlyMessages = useMemo(() => {
    return (logs ?? [])
      .filter((l) => l && l.role === "assistant" && typeof l.content === "string")
      .map((l) => String(l.content));
  }, [logs]);

  const latestAssistantRaw = useMemo(() => {
    if (streamVisualActive) {
      return typeof smoothNarrative === "string" && smoothNarrative.length > 0
        ? smoothNarrative
        : narrativeRef.current ?? "";
    }
    if (liveNarrative) return liveNarrative;
    if (assistantOnlyMessages.length > 0) return assistantOnlyMessages[assistantOnlyMessages.length - 1] ?? "";
    return "";
  }, [streamVisualActive, smoothNarrative, liveNarrative, assistantOnlyMessages]);

  const greenTips = useMemo(() => extractGreenTips(latestAssistantRaw), [latestAssistantRaw]);

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
    if (streamVisualActive) {
      el.scrollTop = el.scrollHeight;
    } else {
      if (prevIsStreamingRef.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevIsStreamingRef.current = streamVisualActive;
  }, [smoothNarrative, streamVisualActive]);

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
    if (!isHydrated || streamBusy || hasTriggeredOpening.current) return;
    const currentLogs = useGameStore.getState().logs ?? [];
    const turn = currentLogs.length;
    // 仅在还没有任何助手叙事时触发一次主链路开场（单一真相源；本地叙事仅作下方超时降级）
    if (turn > 0) return;
    hasTriggeredOpening.current = true;
    openingAwaitingAssistantRef.current = true;
    openingStartedAtRef.current = Date.now();
    void sendAction(OPENING_ACTION, true, false, true);
  }, [isHydrated, streamBusy]);

  // 开场超时降级：仅当主链路已结束且仍无助手叙事时注入本地开场；若仍在等待上游/流式吐字，则顺延，不与 SSE 竞争。
  useEffect(() => {
    if (!isHydrated) return;
    const tick = window.setInterval(() => {
      const logs = useGameStore.getState().logs ?? [];
      if (logs.some((l) => l && l.role === "assistant")) {
        openingAwaitingAssistantRef.current = false;
        return;
      }
      if (!openingAwaitingAssistantRef.current) return;
      const phase = streamPhaseRef.current;
      if (phase === "waiting_upstream" || phase === "streaming_body" || phase === "turn_committing") {
        return;
      }
      if (Date.now() - openingStartedAtRef.current < 8000) return;
      openingAwaitingAssistantRef.current = false;
      const state = useGameStore.getState();
      state.pushLog({ role: "assistant", content: LOCAL_FALLBACK_OPENING });
      const safeDefaultOptions = [
        "查看周围环境",
        "检查背包与随身物品",
        "尝试与附近原住民搭话",
        "谨慎前往下一处房间",
      ];
      state.setCurrentOptions(safeDefaultOptions);
    }, 400);
    return () => clearInterval(tick);
  }, [isHydrated]);

  // 兜底：若开场叙事已出现但选项为空，补齐 4 个默认选项（避免首次进入看到“无选项”）
  const hasSeededOpeningOptions = useRef(false);
  useEffect(() => {
    if (!isHydrated || streamBusy) return;
    if (hasSeededOpeningOptions.current) return;
    const state = useGameStore.getState();
    const logsNow = state.logs ?? [];
    const hasAssistant = logsNow.some((l) => l && l.role === "assistant");
    if (!hasAssistant) return;
    if (inputMode !== "options") return;
    if (currentOptions.length > 0) return;

    hasSeededOpeningOptions.current = true;
    const safeDefaultOptions = [
      "查看周围环境",
      "检查背包与随身物品",
      "尝试与附近原住民搭话",
      "谨慎前往下一处房间",
    ];
    setCurrentOptions(safeDefaultOptions);
  }, [currentOptions.length, inputMode, isHydrated, streamBusy, setCurrentOptions]);

  useEffect(() => {
    if (
      !isHydrated ||
      !isGameStarted ||
      streamBusy ||
      hasTriggeredResume.current
    )
      return;
    const logs = useGameStore.getState().logs ?? [];
    if (logs.length === 0) return;
    const last = logs[logs.length - 1];
    if (!last || last.role !== "user") return;
    if (hasTriggeredOpening.current && logs.length === 1) return;
    hasTriggeredResume.current = true;
    void sendAction(last.content, true, true);
  }, [isHydrated, isGameStarted, streamBusy]);

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
      streamAbortRef.current?.abort();
      streamReaderRef.current?.cancel().catch(() => {});
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoSaveProgress, isGameStarted, isHydrated]);

  async function sendAction(
    action: string,
    bypassLengthCheck?: boolean,
    isResume?: boolean,
    isSystemAction?: boolean
  ) {
    if (streamBusy || sendActionInFlightRef.current) return;
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
    setStreamPhase("waiting_upstream");
    narrativeRef.current = "";
    rawDmBufferRef.current = "";
    setLiveNarrative("");

    try {
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
    try {
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
      streamAbortRef.current = null;
      setStreamPhase("idle");
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        return;
      }
      setLiveNarrative("连接深渊时发生了波动，请稍后再试。");
      return;
    } finally {
      streamAbortRef.current = null;
    }

    if (!res.ok || !res.body) {
      setStreamPhase("idle");
      const errorText = await res.text().catch(() => "");
      const contentType = res.headers.get("content-type") ?? "";
      let parsedError: unknown = null;
      try {
        if (contentType.includes("application/json") && errorText) {
          parsedError = JSON.parse(errorText);
        } else if (contentType.includes("text/event-stream") && errorText) {
          const m = errorText.match(/(^|\\n)data:\\s*(\\{[\\s\\S]*\\})(\\n|$)/);
          if (m?.[2]) parsedError = JSON.parse(m[2]);
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

      const logLine = `[/api/chat] non-OK status=${res.status} statusText=${res.statusText} contentType=${contentType} body=${errorText.slice(0, 800)}`;

      if (isAuthFailed) {
        console.warn(logLine);
      } else {
        console.error(logLine);
      }

      const detail = {
        status: res.status,
        statusText: res.statusText,
        contentType,
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
            ? "深渊鉴权失败：请检查 VOLCENGINE_API_KEY / Endpoint 权限 / 模型ID。"
          : res.status === 504
            ? "深渊回应超时（504），请稍后再试。"
          : "连接深渊时发生了波动，请稍后再试。";
      setLiveNarrative(msg);
      return;
    }

    const reader = res.body.getReader();
    streamReaderRef.current = reader;
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    let raw = "";
    let sawStreamChunk = false;

    let streamCancelled = false;
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
            if (!sawStreamChunk && chunk.length > 0) {
              sawStreamChunk = true;
              setStreamPhase("streaming_body");
            }
            raw += chunk;
            rawDmBufferRef.current = raw;
            try {
              narrativeRef.current = extractNarrative(raw);
            } catch {
              // Defensive: never crash UI on malformed stream
              narrativeRef.current = "";
            }
            const bgmMatch = raw.match(/"bgm_track"\s*:\s*"(bgm_[^"]+)"/);
            if (bgmMatch && isValidBgmTrack(bgmMatch[1]!)) {
              setBgm(bgmMatch[1]);
            }
          }
        }
      }
    } catch (readErr) {
      const err = readErr as Error & { name?: string };
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
        rawDmBufferRef.current = "";
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
        rawDmBufferRef.current = "";
        narrativeRef.current = "";
        setLiveNarrative("{{BLOOD}}禁止输出非法词语！！！{{/BLOOD}}");
      }
      return;
    }

    setStreamPhase("turn_committing");
    const parsed = tryParseDM(raw);
    if (!parsed) {
      setStreamPhase("idle");
      // Potential upstream guardrail cut-off: broken/truncated JSON stream.
      try {
        useGameStore.getState().triggerSecurityFallback("dm_json_parse_failed_or_truncated");
      } catch {
        // ignore
      }
      rawDmBufferRef.current = "";
      narrativeRef.current = "";
      setLiveNarrative("{{BLOOD}}禁止输出非法词语！！！{{/BLOOD}}");
      return;
    }

    if (!parsed.is_action_legal) {
      triggerComplianceHint();
    }
    if (parsed.security_meta?.action && parsed.security_meta.action !== "allow") {
      triggerComplianceHint();
    }

    const rawNarrative = typeof parsed.narrative === "string" ? parsed.narrative : String(parsed.narrative ?? "");
    let narrativeToPush: string;
    try {
      narrativeToPush = (shouldApplyHallucination ? applyBloodErase(rawNarrative) : rawNarrative).slice(0, 50000);
    } catch {
      narrativeToPush = rawNarrative.slice(0, 50000);
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
          setFirstTimeHint(`请玩家在设置里查看和使用【${firstNew.name}】的详情`);
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
          setFirstTimeHint(`请玩家在设置里查看和使用【${firstNew.name}】的详情`);
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
        setFirstTimeHint(`请玩家在设置里查看和使用【${firstNewNpc.name}】的详情`);
      } else {
        const firstNewAnomaly = entries.find((e) => e.type === "anomaly" && !(e.id in prevCodex));
        if (firstNewAnomaly) {
          setFirstTimeHint(`请玩家在设置里查看和使用【${firstNewAnomaly.name}】的详情`);
        }
      }
    }

    const dmg = clampInt(parsed.sanity_damage ?? 0, 0, 9999);
    if (dmg > 0) {
      const cur = useGameStore.getState().stats?.sanity ?? 0;
      useGameStore.getState().setStats({ sanity: Math.max(0, cur - dmg) });
      setHitEffectUntil(Date.now() + 1200);
    }

    const modeNow = useGameStore.getState().inputMode ?? "options";
    if (modeNow === "options") {
      const safeDefaultOptions = [
        "查看周围环境",
        "检查背包与随身物品",
        "尝试与附近原住民搭话",
        "谨慎前往下一处房间",
      ];
      const validOpts = Array.isArray(parsed.options)
        ? parsed.options
            .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
            .map((o) => o.trim())
            .slice(0, 4)
        : [];

      const merged = [...validOpts];
      for (const d of safeDefaultOptions) {
        if (merged.length >= 4) break;
        if (merged.includes(d)) continue;
        merged.push(d);
      }

      if (merged.length > 0) {
        setCurrentOptions(merged.slice(0, 4));
      }
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

    setStreamPhase("idle");

    const sanityAfter = useGameStore.getState().stats?.sanity ?? 0;

    if (parsed.is_death || sanityAfter <= 0) {
      setTimeout(() => router.push("/settlement"), 2000);
    }
    } finally {
      sendActionInFlightRef.current = false;
    }
  }

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
    <main
      className={`flex h-[100dvh] flex-col overflow-hidden transition-all duration-1000 ${
        isLowSanity
          ? "bg-black text-white"
          : isDarkMoon
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

      {hitEffectUntil > Date.now() && (
        <div className="pointer-events-none fixed inset-0 z-[55]" aria-hidden>
          <div
            className="absolute inset-0 opacity-90"
            style={{
              background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 35%, rgba(160,0,0,0.2) 65%, rgba(220,38,38,0.45) 100%)",
              boxShadow: "inset 0 0 100px 30px rgba(220,38,38,0.3)",
            }}
          />
        </div>
      )}

      {talentEffectType && (() => {
        const style = TALENT_EFFECT_STYLE[talentEffectType];
        if (!style) return null;
        return (
          <div
            className="pointer-events-none fixed inset-0 z-[54]"
            aria-hidden
          >
            <div
              className="absolute inset-0"
              style={{
                background: style.bg,
                animation: style.anim,
              }}
            />
          </div>
        );
      })()}

      <div
        className={`relative flex min-h-0 flex-1 flex-col ${hitEffectUntil > Date.now() ? "animate-[sanity-hit-shake_0.5s_ease-out_2]" : ""}`}
      >
      {showDialoguePaywall && (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center ${glassModalOverlay}`}
          role="dialog"
          aria-modal
        >
          <div className={`${glassPlayDialogSurface} p-8`}>
            <h2 className="text-lg font-semibold tracking-wide text-white">
              体验次数已耗尽
            </h2>
            {showRegisterPrompt && (
              <p className="mt-3 text-sm leading-relaxed text-slate-200">
                体验次数已耗尽，可注册账号以继续执笔创作。
              </p>
            )}
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  router.push("/");
                }}
                className="group relative inline-flex items-center gap-3 rounded-full border border-white/15 bg-slate-900/70 px-8 py-3 text-sm font-semibold text-slate-50 shadow-[0_0_40px_rgba(15,23,42,0.9)] backdrop-blur-2xl transition-all duration-300 hover:scale-105 hover:border-cyan-300/70 hover:shadow-[0_0_55px_rgba(56,189,248,0.85)]"
              >
                <span className="relative">注册 / 登录</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showExitModal && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center ${glassModalOverlay}`}
          role="dialog"
          aria-modal
          aria-labelledby="exit-modal-title"
        >
          <div
            className={`${glassPlayDialogSurface} border-white/10 p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]`}
          >
            <h2 id="exit-modal-title" className="text-lg font-semibold text-slate-100">
              意识脱离申请
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              选择保存并退出可保存进度并返回首页；选择直接退出将直接封卷。
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onSaveAndExit}
                className="rounded-xl border border-white/60 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 shadow-[0_0_12px_rgba(59,130,246,0.4)] transition hover:bg-white/10 hover:shadow-[0_0_16px_rgba(59,130,246,0.5)]"
              >
                保存并封卷
              </button>
              <button
                type="button"
                onClick={onAbandonAndDie}
                className="rounded-xl bg-gradient-to-r from-red-700 to-red-800 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] transition hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]"
              >
                直接封卷
              </button>
            </div>
          </div>
        </div>
      )}

        <div className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col">
            <div
              className={`relative flex h-full min-h-0 flex-1 flex-col overflow-hidden ${
                isLowSanity ? "bg-black" : isDarkMoon ? "bg-red-950/30" : "bg-white"
              }`}
            >
              <div className={`shrink-0 px-3 py-2 ${isLowSanity ? "bg-white/5" : isDarkMoon ? "bg-red-950/20" : "bg-slate-900/10"}`}>
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
                    <h2 className={`truncate text-base font-bold tracking-widest drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] md:text-lg ${isLowSanity ? "text-white" : isDarkMoon ? "text-red-200" : "text-slate-800"}`}>
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
                      {talent && talentCdLeft === 0 && !streamBusy && (
                        <div
                          className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-600 opacity-70 blur transition-opacity duration-500 group-hover:opacity-100 animate-[pulse_3s_ease-in-out_infinite]"
                          aria-hidden
                        />
                      )}
                      <button
                        type="button"
                        onClick={onUseTalent}
                        disabled={!talent || talentCdLeft > 0 || streamBusy}
                        className={`relative truncate rounded-full px-3 py-1.5 text-sm font-bold tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-all md:text-base ${
                          talent && talentCdLeft === 0 && !streamBusy
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

              <div
                ref={scrollRef}
                onScroll={onScrollContainer}
                className="touch-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-6"
                style={{ overflowAnchor: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
              >
                <div className="space-y-6">
                  {/* 正文：用户输入 + 助手叙事（按日志顺序渲染） */}
                  {displayEntries.length > 0 && (
                    <div
                      className={`animate-[fadeIn_0.8s_ease-out] ${isLowSanity ? "text-white" : isDarkMoon ? "text-slate-200" : "text-slate-800"}`}
                    >
                      {displayEntries.map((entry, idx) => {
                        const safeContent = typeof entry.content === "string" ? entry.content : "";
                        return safeContent.includes("获得了新物品，已放入书包") ? (
                          <p
                            key={idx}
                            className="mb-6 text-base font-bold text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                          >
                            {safeContent.replace(/\*\*/g, "")}
                          </p>
                        ) : (
                          <div key={idx} className="mb-6">
                            <DMNarrativeBlock
                              content={safeContent}
                              isDarkMoon={isDarkMoon}
                              isLowSanity={isLowSanity}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {streamVisualActive ? (
                    <div className="min-h-[100px] animate-[fadeIn_0.8s_ease-out] space-y-3">
                      {smoothThinking ? (
                        // 阶段 1：纯“正在推演...”阶段，只显示一个统一样式的小圈圈
                        <div className="flex items-center gap-3 py-4">
                          <div className="relative flex h-6 w-6 items-center justify-center">
                            <div className="absolute inset-0 rounded-full border-[3px] border-slate-200/20" />
                            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                          </div>
                          <span className="animate-pulse bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-sm font-medium tracking-widest text-transparent">
                            正在生成...
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* 阶段 2：正文流式输出 */}
                          <div
                            className={
                              isLowSanity
                                ? "space-y-6 text-[18px] leading-[1.8] text-white"
                                : isDarkMoon
                                  ? "space-y-6 text-[18px] leading-[1.8] text-slate-200"
                                  : "space-y-6 text-[18px] leading-[1.8] text-slate-800"
                            }
                          >
                            <span className="whitespace-pre-wrap">
                              {renderNarrativeText(smoothNarrative, { plainOnly: true })}
                            </span>
                            {!smoothComplete && (
                              <span
                                className="ml-1 inline-block h-5 w-1.5 align-middle bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                                aria-hidden
                              />
                            )}
                          </div>
                          {/* 阶段 3：正文结束后，才在正文末尾显示“推演选项中...”的小圈圈，且样式与上方一致 */}
                          {smoothComplete && inputMode === "options" && (
                            <div className="flex items-center gap-3 pt-2 text-xs text-slate-400">
                              <div className="relative flex h-6 w-6 items-center justify-center">
                                <div className="absolute inset-0 rounded-full border-[3px] border-slate-200/20" />
                                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                              </div>
                              <span>生成选项中...</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : liveNarrative ? (
                    <div className="animate-[fadeIn_0.8s_ease-out]">
                      <DMNarrativeBlock
                        content={liveNarrative}
                        isDarkMoon={isDarkMoon}
                        isLowSanity={isLowSanity}
                      />
                    </div>
                  ) : displayEntries.length === 0 && !streamVisualActive ? (
                    <div
                      className={`h-24 ${isLowSanity ? "text-white/30" : isDarkMoon ? "text-red-300/30" : "text-slate-400"}`}
                    />
                  ) : null}

                  {/* 绿字提示：从 narrative 中抽取 ^^...^^，集中在正文底部展示（选项上方），并附加一次性引导提示 */}
                  {(greenTips.length > 0 || firstTimeHint) && (
                    <div className="mt-2 space-y-1">
                      {firstTimeHint && (
                        <p
                          className={`text-sm font-semibold ${
                            isLowSanity
                              ? "text-white/85"
                              : isDarkMoon
                                ? "text-slate-200"
                                : "text-slate-700"
                          }`}
                        >
                          {firstTimeHint}
                        </p>
                      )}
                      {greenTips.map((tip, idx) => (
                        <p
                          key={idx}
                          className={`text-sm font-semibold ${
                            isLowSanity
                              ? "text-white/85"
                              : isDarkMoon
                                ? "text-slate-200"
                                : "text-slate-700"
                          }`}
                        >
                          {tip}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* 选项列表：紧跟在叙事之后，一行一个 */}
                  {inputMode === "options" && currentOptions.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {currentOptions.map((option, idx) => {
                        const optionTextColor = isLowSanity
                          ? "text-white"
                          : isDarkMoon
                            ? "text-red-100"
                            : "text-slate-900";
                        const optionBorderAndBg =
                          isLowSanity || isDarkMoon
                            ? "border border-white/15 bg-slate-900/40 hover:bg-slate-900/60"
                            : "border border-slate-200 bg-white hover:bg-slate-50";
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (isGuestDialogueExhausted) {
                                setShowDialoguePaywall(true);
                                return;
                              }
                              // 点击后立即清空当前选项，让玩家感知到已提交
                              setCurrentOptions([]);
                              playUIClick();
                              void sendAction(option, true);
                            }}
                            disabled={streamBusy || isGuestDialogueExhausted}
                            className={`w-full rounded-2xl px-4 py-4 text-left text-sm font-medium tracking-wide shadow-sm transition-all duration-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 md:text-base ${optionTextColor} ${optionBorderAndBg}`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className={`shrink-0 px-3 py-3 md:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${isLowSanity ? "bg-white/5" : isDarkMoon ? "bg-red-950/20" : "bg-slate-900/10"}`}>
                {hasAnyGate ? (
                  <p
                    className={`py-3 text-center text-sm font-medium ${
                      isLowSanity ? "text-white/80" : isDarkMoon ? "text-red-400/90" : "text-neutral-600"
                    }`}
                  >
                    {gateMessage}
                  </p>
                ) : inputMode === "text" ? (
                  <div className="relative">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          setInputError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSubmit();
                        }}
                        placeholder="输入你的创作动作/对白（最多20字）"
                        inputMode="text"
                        enterKeyHint="done"
                        className={`min-h-[44px] w-full rounded-xl px-3 text-base outline-none transition touch-manipulation ${
                          isLowSanity
                            ? "bg-white/10 text-white placeholder:text-white/50 focus:bg-white/15"
                            : isDarkMoon
                              ? "bg-red-950/40 text-red-100 placeholder:text-red-400/50 focus:bg-red-950/60"
                              : "bg-white/90 text-slate-800 placeholder:text-slate-500 focus:bg-white"
                        }`}
                        disabled={streamBusy || isGuestDialogueExhausted}
                      />
                      <button
                        type="button"
                        onClick={onSubmit}
                        disabled={streamBusy || input.trim().length === 0 || isGuestDialogueExhausted}
                        className={`min-h-[44px] shrink-0 rounded-lg px-5 text-base font-semibold transition disabled:opacity-40 touch-manipulation ${
                          isLowSanity
                            ? "bg-white/20 text-white"
                            : isDarkMoon
                              ? "bg-red-900 text-red-100"
                              : "bg-foreground text-background"
                        }`}
                      >
                        提交
                      </button>
                    </div>
                    <div
                      className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-xs ${
                        isLowSanity ? "text-white/70" : isDarkMoon ? "text-red-300/80" : "text-neutral-600"
                      }`}
                    >
                      <span>
                        字数：{input.trim().length}/{MAX_INPUT}
                      </span>
                      <div className="flex items-center gap-3">
                        {inputError ? (
                          <span className="font-medium text-red-500">{inputError}</span>
                        ) : (
                          <span
                            className={
                              input.trim().length > MAX_INPUT || isGuestDialogueExhausted ? "text-red-500" : ""
                            }
                          >
                            {isGuestDialogueExhausted
                              ? (showRegisterPrompt ? "体验次数已耗尽，可注册账号以继续执笔创作。" : "")
                              : input.trim().length > MAX_INPUT
                                ? "文本过长：将被叙事拒绝。"
                                : streamBusy
                                  ? "正在生成..."
                                  : "保持简短。保持真实。"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-neutral-600">
                    <span className="opacity-80">
                      当前为选项模式，请直接点击上方选项推进文本。
                    </span>
                    <span className="hidden sm:inline opacity-60">
                      想自由输入时，可用右上角按钮切换为手动输入。
                    </span>
                  </div>
                )}
                <div className="mt-2 text-center">
                  <span
                    className={`text-[10px] tracking-wide ${
                      isLowSanity ? "text-white/45" : isDarkMoon ? "text-red-200/45" : "text-slate-500/55"
                    }`}
                  >
                    内容由 AI 演算生成，纯属虚构，请注意甄别，切勿代入现实。
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showComplianceHint && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[80] w-[min(92vw,720px)] -translate-x-1/2">
          <div className="rounded-2xl bg-white/5 px-4 py-3 text-center text-sm text-white/90 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
            {COMPLIANCE_HINT_TEXT}
          </div>
        </div>
      )}

      <UnifiedMenuModal
        activeMenu={activeMenu}
        onClose={() => setActiveMenu(null)}
        onUseItem={onUseItem}
        isStreaming={streamBusy}
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

export default function PlayPageWrapper() {
  const isHydrated = useGameStore((s) => s.isHydrated);
  const isGameStarted = useGameStore((s) => s.isGameStarted ?? false);

  if (!isHydrated || !isGameStarted) {
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

  return <PlayContent />;
}
