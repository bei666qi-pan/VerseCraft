import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import type { StoryDirectorState } from "./types";

export type DirectorSignals = {
  nowTurn: number;
  effectiveProgressScore: number; // 0..100
  progressed: boolean;
  stalled: boolean;

  highPressure: boolean;
  threatHot: boolean;
  debtPileup: boolean;
  promisePileup: boolean;

  hooksReady: boolean;
  hookCodesReady: string[];

  falseCalmRisk: boolean;
  nearPeak: boolean;

  notes: string[];
};

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function countUnresolvedByKind(entries: MemorySpineEntry[], kind: string): number {
  return (entries ?? []).filter((e) => e && e.kind === (kind as any) && (e.status === "active" || e.status === "resolved")).length;
}

export function detectDirectorSignals(args: {
  director: StoryDirectorState;
  nowTurn: number;
  pre: {
    playerLocation: string;
    tasks: GameTaskV2[];
    mainThreatByFloor: Record<string, { phase?: string }>;
    memoryEntries: MemorySpineEntry[];
  };
  post: {
    playerLocation: string;
    tasks: GameTaskV2[];
    mainThreatByFloor: Record<string, { phase?: string }>;
    memoryEntries: MemorySpineEntry[];
  };
  resolvedTurn: any;
}): DirectorSignals {
  const nowTurn = Math.max(0, Math.trunc(args.nowTurn ?? 0));
  const notes: string[] = [];
  const preLoc = String(args.pre.playerLocation ?? "");
  const postLoc = String(args.post.playerLocation ?? "");

  const moved = preLoc && postLoc && preLoc !== postLoc;
  if (moved) notes.push("moved");

  const preTasks = args.pre.tasks ?? [];
  const postTasks = args.post.tasks ?? [];
  const preById = new Map(preTasks.map((t) => [t.id, t.status]));
  const terminalDelta = postTasks.filter((t) => {
    const prev = preById.get(t.id);
    return (t.status === "completed" || t.status === "failed") && prev !== t.status;
  }).length;
  if (terminalDelta > 0) notes.push(`task_terminal:${terminalDelta}`);

  const threatHot = Object.values(args.post.mainThreatByFloor ?? {}).some((x) => {
    const p = String((x as any)?.phase ?? "");
    return p === "active" || p === "suppressed" || p === "breached";
  });
  if (threatHot) notes.push("threat_hot");

  const preMemLen = (args.pre.memoryEntries ?? []).length;
  const postMemLen = (args.post.memoryEntries ?? []).length;
  const memDelta = Math.max(0, postMemLen - preMemLen);
  if (memDelta > 0) notes.push(`mem+${memDelta}`);

  const relUpdates = Array.isArray((args.resolvedTurn as any)?.relationship_updates)
    ? (args.resolvedTurn as any).relationship_updates.length
    : 0;
  if (relUpdates > 0) notes.push(`rel:${relUpdates}`);

  // effective progress score (deterministic, structure-first)
  let score = 0;
  if (moved) score += 18;
  score += Math.min(40, terminalDelta * 22);
  score += Math.min(18, memDelta * 6);
  score += Math.min(12, relUpdates * 3);
  if (Array.isArray((args.resolvedTurn as any)?.main_threat_updates) && (args.resolvedTurn as any).main_threat_updates.length > 0) score += 16;
  if (Array.isArray((args.resolvedTurn as any)?.task_updates) && (args.resolvedTurn as any).task_updates.length > 0) score += 10;
  score = clampInt(score, 0, 100);

  const progressed = score >= 22;
  const stalled = score <= 8;

  const debtCount = countUnresolvedByKind(args.post.memoryEntries ?? [], "debt");
  const promiseCount = countUnresolvedByKind(args.post.memoryEntries ?? [], "promise");
  const debtPileup = debtCount >= 3;
  const promisePileup = promiseCount >= 3;

  const openHooks = uniq(args.director.openHookCodes ?? [], 12);
  const hookCodesReady = openHooks.slice(0, 4);
  const hooksReady = hookCodesReady.length > 0;

  const highPressure = threatHot || debtPileup || promisePileup;
  const falseCalmRisk = !highPressure && hooksReady && (args.director.falseCalmTurns ?? 0) >= 2;
  const nearPeak = highPressure && hooksReady && (terminalDelta >= 1 || memDelta >= 3);

  return {
    nowTurn,
    effectiveProgressScore: score,
    progressed,
    stalled,
    highPressure,
    threatHot,
    debtPileup,
    promisePileup,
    hooksReady,
    hookCodesReady,
    falseCalmRisk,
    nearPeak,
    notes,
  };
}

