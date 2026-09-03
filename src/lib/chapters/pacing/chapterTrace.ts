import type { ChapterCloseDecision, ChapterPhase, NextChapterSeed } from "./types";

export type ChapterReasonerTraceEntry = {
  turn: number;
  chapterId: string;
  phaseBefore: ChapterPhase | null;
  phaseAfter: ChapterPhase | null;
  closeDecision: ChapterCloseDecision | null;
  mustEchoMemoryIds: string[];
  selectedThreadIds: string[];
  nextChapterSeed: NextChapterSeed | null;
  reason: string;
  suppressedGameyUi: true;
};

export const CHAPTER_REASONER_TRACE_GLOBAL_KEY = "__VERSECRAFT_CHAPTER_REASONER_TRACE__";
export const CHAPTER_REASONER_TRACE_MAX_ENTRIES = 80;

type TraceStore = {
  __VERSECRAFT_CHAPTER_REASONER_TRACE__?: ChapterReasonerTraceEntry[];
};

function clampText(value: unknown, max: number, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.length <= max ? text : text.slice(0, max);
}

function uniqStrings(values: unknown, maxItems: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const list = Array.isArray(values) ? values : [];
  for (const value of list) {
    const text = clampText(value, 120);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cloneCloseDecision(value: ChapterCloseDecision | null): ChapterCloseDecision | null {
  return value ? { ...value } : null;
}

function cloneNextChapterSeed(value: NextChapterSeed | null): NextChapterSeed | null {
  return value
    ? {
        ...value,
        mustEchoMemoryIds: [...(value.mustEchoMemoryIds ?? [])],
        inheritedThreadIds: [...(value.inheritedThreadIds ?? [])],
      }
    : null;
}

function normalizeTraceEntry(entry: ChapterReasonerTraceEntry): ChapterReasonerTraceEntry {
  return {
    turn: Number.isFinite(entry.turn) ? Math.max(0, Math.trunc(entry.turn)) : 0,
    chapterId: clampText(entry.chapterId, 120, "unknown"),
    phaseBefore: entry.phaseBefore ?? null,
    phaseAfter: entry.phaseAfter ?? null,
    closeDecision: cloneCloseDecision(entry.closeDecision),
    mustEchoMemoryIds: uniqStrings(entry.mustEchoMemoryIds, 12),
    selectedThreadIds: uniqStrings(entry.selectedThreadIds, 16),
    nextChapterSeed: cloneNextChapterSeed(entry.nextChapterSeed),
    reason: clampText(entry.reason, 240, "chapter_reasoner_update"),
    suppressedGameyUi: true,
  };
}

function getMutableTraceRing(): ChapterReasonerTraceEntry[] {
  const store = globalThis as unknown as TraceStore;
  if (!Array.isArray(store.__VERSECRAFT_CHAPTER_REASONER_TRACE__)) {
    store.__VERSECRAFT_CHAPTER_REASONER_TRACE__ = [];
  }
  return store.__VERSECRAFT_CHAPTER_REASONER_TRACE__;
}

export function recordChapterReasonerTrace(entry: ChapterReasonerTraceEntry): void {
  try {
    const ring = getMutableTraceRing();
    ring.push(normalizeTraceEntry(entry));
    if (ring.length > CHAPTER_REASONER_TRACE_MAX_ENTRIES) {
      ring.splice(0, ring.length - CHAPTER_REASONER_TRACE_MAX_ENTRIES);
    }
  } catch {
    // Debug trace must never affect the turn workflow.
  }
}

export function getChapterReasonerTrace(): ChapterReasonerTraceEntry[] {
  return getMutableTraceRing().map(normalizeTraceEntry);
}

export function clearChapterReasonerTrace(): void {
  getMutableTraceRing().length = 0;
}
