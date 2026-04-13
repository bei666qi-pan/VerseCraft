"use client";

import { pruneMemorySpine } from "@/lib/memorySpine/prune";
import { normalizeDirectorState } from "@/lib/storyDirector/postTurn";
import { normalizeIncidentQueue } from "@/lib/storyDirector/queue";
import { normalizeEscapeMainline } from "@/lib/escapeMainline/reducer";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";

export const RESUME_SHADOW_KEY = "versecraft-resume-shadow";
const RESUME_SHADOW_VERSION = 1;

export type ResumeShadowSnapshot = {
  version: 1;
  updatedAt: string;
  isGameStarted: boolean;
  currentSaveSlot: string;
  playerLocation: string;
  time: { day: number; hour: number };
  logs: Array<{ role: string; content: string; reasoning?: string }>;
  inventory: unknown[];
  warehouse: unknown[];
  tasks: unknown[];
  codex: Record<string, unknown>;
  /** Phase-2: hot memory spine snapshot (small & pruned). */
  memorySpine?: unknown;
  /** Phase-4: story director snapshot (small). */
  storyDirector?: unknown;
  /** Phase-4: incident queue snapshot (small). */
  incidentQueue?: unknown;
  /** Phase-5: escape mainline snapshot (small). */
  escapeMainline?: unknown;
  /** 固定开场白是否钉在顶部（本局永久展示）。 */
  openingNarrativePinned?: unknown;
  currentOptions: string[];
  inputMode: "options" | "text";
  currentBgm: string;
  stats: Record<string, number>;
  originium: number;
  professionState?: unknown;
};

export type ResumeShadowSummary = {
  updatedAtIso: string;
  day: number;
  hour: number;
  locationId: string;
  activeTasksCount: number;
  professionLabel: string | null;
};

function toPlainObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(String(n ?? ""));
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function truncateText(v: unknown, maxLen: number): string {
  const s = typeof v === "string" ? v : String(v ?? "");
  return s.slice(0, maxLen);
}

function normalizeResumeOptions(options: unknown, maxCount = 8): string[] {
  if (!Array.isArray(options)) return [];
  return filterNarrativeActionOptions(
    options.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()),
    maxCount
  );
}

/**
 * 生成“崩溃恢复快照”：独立于 zustand 主 persist，且同步写 localStorage。
 * 该快照用于“突然刷新/崩溃”兜底，只保留继续执笔必需字段，避免全量 store 落盘过重。
 */
export function buildResumeShadowSnapshot(state: Record<string, unknown>): ResumeShadowSnapshot {
  const rawLogs = Array.isArray(state.logs) ? state.logs : [];
  const logs = rawLogs
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .slice(-120)
    .map((x) => ({
      role: truncateText(x.role, 24),
      content: truncateText(x.content, 2400),
      ...(typeof x.reasoning === "string" ? { reasoning: truncateText(x.reasoning, 1200) } : {}),
    }));

  const rawTasks = Array.isArray(state.tasks) ? state.tasks : [];
  const tasks = rawTasks.filter((x) => !!x && typeof x === "object" && !Array.isArray(x)).slice(-80);

  const codexObj = toPlainObject(state.codex) ?? {};
  const codexEntries = Object.entries(codexObj).slice(0, 200);
  const codex: Record<string, unknown> = {};
  for (const [k, v] of codexEntries) {
    if (!k) continue;
    const row = toPlainObject(v);
    if (!row) continue;
    codex[k] = {
      id: truncateText(row.id, 64),
      name: truncateText(row.name, 80),
      type: truncateText(row.type, 16),
      known_info: truncateText(row.known_info, 300),
      favorability: typeof row.favorability === "number" ? row.favorability : undefined,
      trust: typeof row.trust === "number" ? row.trust : undefined,
      fear: typeof row.fear === "number" ? row.fear : undefined,
    };
  }

  const timeObj = toPlainObject(state.time) ?? {};
  const time = {
    day: clampInt(timeObj.day, 0, 999),
    hour: clampInt(timeObj.hour, 0, 23),
  };
  const nowHour = time.day * 24 + time.hour;

  const currentOptions = normalizeResumeOptions(state.currentOptions, 8);

  const statsObj = toPlainObject(state.stats) ?? {};
  const stats = {
    sanity: clampInt(statsObj.sanity, 0, 999),
    agility: clampInt(statsObj.agility, 0, 999),
    luck: clampInt(statsObj.luck, 0, 999),
    charm: clampInt(statsObj.charm, 0, 999),
    background: clampInt(statsObj.background, 0, 999),
  };

  // Phase-2: memory spine (best-effort, capped) — must not bloat localStorage.
  const memorySpine = (() => {
    const raw = toPlainObject((state as any).memorySpine);
    if (!raw) return undefined;
    try {
      const pruned = pruneMemorySpine(raw as any, nowHour, { maxEntries: 48 });
      // extra hard cap on serialized size
      const json = JSON.stringify(pruned);
      if (json.length > 6000) return { v: 1, entries: (pruned as any).entries?.slice(0, 24) ?? [] };
      return pruned;
    } catch {
      return undefined;
    }
  })();

  const storyDirector = (() => {
    const raw = toPlainObject((state as any).storyDirector);
    if (!raw) return undefined;
    try {
      return normalizeDirectorState(raw as any, 0);
    } catch {
      return undefined;
    }
  })();
  const incidentQueue = (() => {
    const raw = toPlainObject((state as any).incidentQueue);
    if (!raw) return undefined;
    try {
      const q = normalizeIncidentQueue(raw as any);
      const json = JSON.stringify(q);
      if (json.length > 5200) return { v: 1, items: (q as any).items?.slice(0, 6) ?? [] };
      return q;
    } catch {
      return undefined;
    }
  })();

  const escapeMainline = (() => {
    const raw = toPlainObject((state as any).escapeMainline);
    if (!raw) return undefined;
    try {
      const timeObj = toPlainObject((state as any).time) ?? { day: 0, hour: 0 };
      const nowHour = clampInt((timeObj as any).day, 0, 999) * 24 + clampInt((timeObj as any).hour, 0, 23);
      const s = normalizeEscapeMainline(raw as any, nowHour);
      const json = JSON.stringify(s);
      if (json.length > 5200) return { ...s, routeFragments: (s as any).routeFragments?.slice(0, 4) ?? [] };
      return s;
    } catch {
      return undefined;
    }
  })();

  return {
    version: RESUME_SHADOW_VERSION,
    updatedAt: new Date().toISOString(),
    isGameStarted: state.isGameStarted === true,
    currentSaveSlot: typeof state.currentSaveSlot === "string" && state.currentSaveSlot ? state.currentSaveSlot : "main_slot",
    playerLocation:
      typeof state.playerLocation === "string" && state.playerLocation.trim() ? state.playerLocation.trim() : "B1_SafeZone",
    time,
    logs,
    inventory: (Array.isArray(state.inventory) ? state.inventory : []).slice(-120),
    warehouse: (Array.isArray(state.warehouse) ? state.warehouse : []).slice(-120),
    tasks,
    codex,
    ...(memorySpine ? { memorySpine } : {}),
    ...(storyDirector ? { storyDirector } : {}),
    ...(incidentQueue ? { incidentQueue } : {}),
    ...(escapeMainline ? { escapeMainline } : {}),
    ...(typeof (state as any).openingNarrativePinned === "boolean"
      ? { openingNarrativePinned: (state as any).openingNarrativePinned }
      : {}),
    currentOptions,
    inputMode: state.inputMode === "text" ? "text" : "options",
    currentBgm: typeof state.currentBgm === "string" && state.currentBgm ? state.currentBgm : "bgm_1_calm",
    stats,
    originium: clampInt(state.originium, 0, 999999),
    ...(state.professionState ? { professionState: state.professionState } : {}),
  };
}

export function writeResumeShadowSnapshot(snapshot: ResumeShadowSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RESUME_SHADOW_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore localStorage quota / privacy mode failure
  }
}

export function writeResumeShadowFromState(state: Record<string, unknown>): void {
  writeResumeShadowSnapshot(buildResumeShadowSnapshot(state));
}

export function readResumeShadowSnapshot(): ResumeShadowSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RESUME_SHADOW_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj.version !== RESUME_SHADOW_VERSION) return null;
    const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : "";
    if (!updatedAt) return null;
    const timeObj = toPlainObject(obj.time);
    if (!timeObj) return null;
    return {
      version: 1,
      updatedAt,
      isGameStarted: obj.isGameStarted === true,
      currentSaveSlot: typeof obj.currentSaveSlot === "string" && obj.currentSaveSlot ? obj.currentSaveSlot : "main_slot",
      playerLocation:
        typeof obj.playerLocation === "string" && obj.playerLocation ? obj.playerLocation : "B1_SafeZone",
      time: {
        day: clampInt(timeObj.day, 0, 999),
        hour: clampInt(timeObj.hour, 0, 23),
      },
      logs: Array.isArray(obj.logs) ? (obj.logs as ResumeShadowSnapshot["logs"]) : [],
      inventory: Array.isArray(obj.inventory) ? obj.inventory : [],
      warehouse: Array.isArray(obj.warehouse) ? obj.warehouse : [],
      tasks: Array.isArray(obj.tasks) ? obj.tasks : [],
      codex: toPlainObject(obj.codex) ?? {},
      ...(obj.memorySpine ? { memorySpine: obj.memorySpine } : {}),
      ...(obj.storyDirector ? { storyDirector: obj.storyDirector } : {}),
      ...(obj.incidentQueue ? { incidentQueue: obj.incidentQueue } : {}),
      ...(obj.escapeMainline ? { escapeMainline: obj.escapeMainline } : {}),
      ...(obj.openingNarrativePinned !== undefined ? { openingNarrativePinned: obj.openingNarrativePinned } : {}),
      currentOptions: normalizeResumeOptions(obj.currentOptions, 8),
      inputMode: obj.inputMode === "text" ? "text" : "options",
      currentBgm: typeof obj.currentBgm === "string" && obj.currentBgm ? obj.currentBgm : "bgm_1_calm",
      stats: (toPlainObject(obj.stats) as Record<string, number> | null) ?? {},
      originium: clampInt(obj.originium, 0, 999999),
      ...(obj.professionState ? { professionState: obj.professionState } : {}),
    };
  } catch {
    return null;
  }
}

export function clearResumeShadowSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RESUME_SHADOW_KEY);
  } catch {
    // ignore
  }
}

export function isResumeShadowPlayable(snapshot: ResumeShadowSnapshot | null): boolean {
  if (!snapshot || !snapshot.isGameStarted) return false;
  if ((snapshot.logs?.length ?? 0) > 0) return true;
  if ((snapshot.inventory?.length ?? 0) > 0) return true;
  if ((snapshot.tasks?.length ?? 0) > 0) return true;
  if ((snapshot.time?.day ?? 0) > 0 || (snapshot.time?.hour ?? 0) > 0) return true;
  return false;
}

export function extractResumeShadowSummary(snapshot: ResumeShadowSnapshot | null): ResumeShadowSummary | null {
  if (!snapshot) return null;
  const activeTasksCount = (snapshot.tasks ?? []).filter((t) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) return false;
    const status = (t as { status?: unknown }).status;
    return status === "active" || status === "available";
  }).length;
  const ps =
    snapshot.professionState && typeof snapshot.professionState === "object" && !Array.isArray(snapshot.professionState)
      ? (snapshot.professionState as { currentProfession?: string | null })
      : null;
  return {
    updatedAtIso: snapshot.updatedAt,
    day: clampInt(snapshot.time?.day, 0, 999),
    hour: clampInt(snapshot.time?.hour, 0, 23),
    locationId: snapshot.playerLocation || "B1_SafeZone",
    activeTasksCount,
    professionLabel: typeof ps?.currentProfession === "string" && ps.currentProfession ? ps.currentProfession : null,
  };
}
