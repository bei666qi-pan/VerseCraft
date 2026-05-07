import type { MemorySpineEntry, MemorySpineState } from "./types";

export type MemoryRecallContext = {
  nowHour: number;
  playerLocation: string;
  presentNpcIds: string[];
  activeTaskIds: string[];
  floorId: string;
  mainThreatFloorIdsHot: string[];
  worldFlags: string[];
  professionId: string | null;
};

export type RecalledMemory = { entry: MemorySpineEntry; score: number };

export type ChapterMemorySelectorArgs = {
  chapterId?: string | null;
  chapterOrder?: number | null;
  maxItems?: number;
};

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const v = String(x ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

function floorFromLocation(loc: string): string {
  const s = String(loc ?? "");
  if (s.startsWith("B1_")) return "B1";
  if (s.startsWith("B2_")) return "B2";
  const m = s.match(/^(\d)F_/);
  if (m?.[1]) return m[1];
  if (s === "7" || s.includes("7F")) return "7";
  return "B1";
}

function anchorMatchScore(e: MemorySpineEntry, ctx: MemoryRecallContext): number {
  let score = 0;
  const a = e.anchors ?? {};
  const loc = String(ctx.playerLocation ?? "");
  if (a.locationIds?.some((x) => x === loc)) score += 0.9;
  const floor = floorFromLocation(loc);
  if (a.floorIds?.some((x) => x === floor)) score += 0.5;
  if (a.npcIds?.some((x) => ctx.presentNpcIds.includes(x))) score += 0.75;
  if (a.taskIds?.some((x) => ctx.activeTaskIds.includes(x))) score += 0.65;
  if (a.worldFlags?.some((x) => ctx.worldFlags.includes(x))) score += 0.35;
  if (ctx.mainThreatFloorIdsHot.includes(floor) && e.kind === "danger_hint") score += 0.4;
  return score;
}

function statusBonus(e: MemorySpineEntry): number {
  if (e.status === "active") return 0.25;
  if (e.status === "resolved") return 0.05;
  return 0;
}

function recencyScore(e: MemorySpineEntry, nowHour: number): number {
  const age = Math.max(0, nowHour - (e.lastTouchedAtHour ?? e.createdAtHour));
  const ttl = Math.max(1, e.ttlHours ?? 72);
  // 0..1: 越新越高
  return Math.max(0, Math.min(1, 1 - age / ttl));
}

function normalizeChapterId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChapterOrder(value: unknown): number | null {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function matchesChapter(e: MemorySpineEntry, args: ChapterMemorySelectorArgs): boolean {
  const chapterId = normalizeChapterId(args.chapterId);
  const chapterOrder = normalizeChapterOrder(args.chapterOrder);
  if (!chapterId && chapterOrder === null) return true;
  if (chapterId && e.chapterId === chapterId) return true;
  if (chapterOrder !== null && e.chapterOrder === chapterOrder) return true;
  return false;
}

function isLowConfidenceNarrativeMicroPattern(e: MemorySpineEntry): boolean {
  return e.source === "resolved_turn" && Number(e.confidence ?? 0) < 0.65;
}

function isRecapEligible(e: MemorySpineEntry): boolean {
  if (!e || e.status === "expired") return false;
  if (e.shouldAppearInRecap === false) return false;
  if (isLowConfidenceNarrativeMicroPattern(e) && Number(e.salience ?? 0) < 0.75) return false;
  if (e.shouldAppearInRecap === true) return true;
  if (e.chapterRole === "recap" || e.chapterRole === "payoff" || e.chapterRole === "echo" || e.chapterRole === "hook") return true;
  return e.kind === "relationship_shift" || e.kind === "hook";
}

function chapterMemoryScore(e: MemorySpineEntry): number {
  const status = e.status === "active" ? 0.12 : e.status === "resolved" || e.status === "consumed" ? 0.08 : 0;
  const role =
    e.chapterRole === "recap"
      ? 0.18
      : e.chapterRole === "payoff" || e.chapterRole === "echo"
        ? 0.13
        : e.chapterRole === "hook"
          ? 0.1
          : 0;
  return Number(e.salience ?? 0) * 0.55 + Number(e.confidence ?? 0) * 0.25 + status + role;
}

function selectChapterEntries(
  state: MemorySpineState,
  args: ChapterMemorySelectorArgs,
  predicate: (entry: MemorySpineEntry) => boolean,
  opts?: { relationshipCap?: number; hookCap?: number }
): MemorySpineEntry[] {
  const maxItems = Math.max(1, Math.min(12, args.maxItems ?? 6));
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const scored = entries
    .filter((e) => e && matchesChapter(e, args) && predicate(e))
    .map((entry) => ({ entry, score: chapterMemoryScore(entry) }));
  scored.sort((a, b) => b.score - a.score || b.entry.lastTouchedAtHour - a.entry.lastTouchedAtHour);

  const out: MemorySpineEntry[] = [];
  let relationshipCount = 0;
  let hookCount = 0;
  for (const row of scored) {
    if (row.entry.kind === "relationship_shift") {
      if (relationshipCount >= (opts?.relationshipCap ?? 2)) continue;
      relationshipCount += 1;
    }
    if (row.entry.kind === "hook") {
      if (hookCount >= (opts?.hookCap ?? 2)) continue;
      hookCount += 1;
    }
    out.push(row.entry);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function selectChapterRecapMemoryEntries(
  state: MemorySpineState,
  args: ChapterMemorySelectorArgs
): MemorySpineEntry[] {
  return selectChapterEntries(state, args, isRecapEligible, { relationshipCap: 2, hookCap: 2 });
}

export function selectChapterMustEchoEntries(
  state: MemorySpineState,
  args: ChapterMemorySelectorArgs
): MemorySpineEntry[] {
  const mustEchoKinds = new Set<MemorySpineEntry["kind"]>([
    "promise",
    "debt",
    "relationship_shift",
    "secret_fragment",
    "danger_hint",
    "hook",
  ]);
  return selectChapterEntries(
    state,
    { ...args, maxItems: Math.max(1, Math.min(8, args.maxItems ?? 6)) },
    (entry) =>
      entry.status === "active" &&
      mustEchoKinds.has(entry.kind) &&
      Number(entry.salience ?? 0) >= 0.5 &&
      !(isLowConfidenceNarrativeMicroPattern(entry) && Number(entry.salience ?? 0) < 0.72),
    { relationshipCap: 3, hookCap: 3 }
  );
}

export function selectOpenChapterThreads(
  state: MemorySpineState,
  args: ChapterMemorySelectorArgs
): MemorySpineEntry[] {
  const threadKinds = new Set<MemorySpineEntry["kind"]>([
    "promise",
    "debt",
    "relationship_shift",
    "secret_fragment",
    "route_hint",
    "danger_hint",
    "task_residue",
    "hook",
  ]);
  return selectChapterEntries(
    state,
    { ...args, maxItems: Math.max(1, Math.min(16, args.maxItems ?? 12)) },
    (entry) => entry.status === "active" && threadKinds.has(entry.kind),
    { relationshipCap: 4, hookCap: 4 }
  );
}

export function selectMemoryRecallPacket(state: MemorySpineState, ctx: MemoryRecallContext, opts?: { maxItems?: number }): RecalledMemory[] {
  const maxItems = Math.max(3, Math.min(12, opts?.maxItems ?? 8));
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const nowHour = ctx.nowHour;

  const candidates = entries
    .filter((e) => e && e.status !== "expired" && e.ttlHours > 0)
    .filter((e) => (nowHour - e.lastTouchedAtHour) <= e.ttlHours);

  const scored = candidates.map((e) => {
    const anchor = anchorMatchScore(e, ctx);
    const unresolved = statusBonus(e);
    const recency = recencyScore(e, nowHour);
    const score = anchor * 0.55 + unresolved * 0.2 + e.salience * 0.15 + recency * 0.08 + e.confidence * 0.02;
    return { entry: e, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // 类别去重：避免全是同一 NPC 或同一 kind。
  const out: RecalledMemory[] = [];
  const kindCount = new Map<string, number>();
  const npcCount = new Map<string, number>();
  for (const row of scored) {
    const e = row.entry;
    const kind = e.kind;
    const npc = (e.anchors?.npcIds ?? [])[0] ?? "";
    const k = kindCount.get(kind) ?? 0;
    if (k >= 2) continue;
    if (npc) {
      const n = npcCount.get(npc) ?? 0;
      if (n >= 2) continue;
    }
    out.push(row);
    kindCount.set(kind, k + 1);
    if (npc) npcCount.set(npc, (npcCount.get(npc) ?? 0) + 1);
    if (out.length >= maxItems) break;
  }

  return out;
}

export function buildRecallContext(args: {
  nowHour: number;
  playerLocation: string;
  presentNpcIds: string[];
  activeTaskIds: string[];
  mainThreatByFloor: Record<string, { floorId: string; phase: string }>;
  worldFlags: string[];
  professionId: string | null;
}): MemoryRecallContext {
  const loc = String(args.playerLocation ?? "B1_SafeZone");
  const floor = floorFromLocation(loc);
  const hotFloors = Object.values(args.mainThreatByFloor ?? {})
    .filter((x) => x && (x.phase === "active" || x.phase === "suppressed" || x.phase === "breached"))
    .map((x) => x.floorId)
    .filter((x): x is string => typeof x === "string");
  return {
    nowHour: args.nowHour,
    playerLocation: loc,
    presentNpcIds: uniq(args.presentNpcIds ?? [], 32),
    activeTaskIds: uniq(args.activeTaskIds ?? [], 32),
    floorId: floor,
    mainThreatFloorIdsHot: uniq(hotFloors, 16),
    worldFlags: uniq(args.worldFlags ?? [], 128),
    professionId: args.professionId ?? null,
  };
}

