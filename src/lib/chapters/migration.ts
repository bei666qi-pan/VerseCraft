import { CHAPTER_DEFINITIONS, getFirstChapterDefinition } from "./definitions";
import { createChapterProgress } from "./engine";
import type { ChapterProgress, ChapterState } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
}

function normalizeProgress(raw: unknown, fallback: ChapterProgress): ChapterProgress {
  const record = asRecord(raw);
  const status = record.status;
  const safeStatus =
    status === "locked" || status === "active" || status === "completed" || status === "reviewing"
      ? status
      : fallback.status;
  return {
    ...fallback,
    ...record,
    chapterId: typeof record.chapterId === "string" ? record.chapterId : fallback.chapterId,
    status: safeStatus,
    startedAt: typeof record.startedAt === "number" ? record.startedAt : fallback.startedAt,
    completedAt: typeof record.completedAt === "number" ? record.completedAt : fallback.completedAt,
    turnCount: Math.max(0, Math.trunc(Number(record.turnCount ?? fallback.turnCount) || 0)),
    narrativeCharCount: Math.max(0, Math.trunc(Number(record.narrativeCharCount ?? fallback.narrativeCharCount) || 0)),
    keyChoiceCount: Math.max(0, Math.trunc(Number(record.keyChoiceCount ?? fallback.keyChoiceCount) || 0)),
    completedBeatIds: normalizeStringArray(record.completedBeatIds),
    stateChangeCount: Math.max(0, Math.trunc(Number(record.stateChangeCount ?? fallback.stateChangeCount) || 0)),
    lastObjectiveText:
      typeof record.lastObjectiveText === "string" ? record.lastObjectiveText : fallback.lastObjectiveText,
    startedLogIndex:
      typeof record.startedLogIndex === "number" ? Math.max(0, Math.trunc(record.startedLogIndex)) : fallback.startedLogIndex ?? null,
    completedLogIndex:
      typeof record.completedLogIndex === "number" ? Math.max(0, Math.trunc(record.completedLogIndex)) : fallback.completedLogIndex ?? null,
  };
}

export function createInitialChapterState(now = Date.now()): ChapterState {
  const first = getFirstChapterDefinition();
  const progressByChapterId = Object.fromEntries(
    CHAPTER_DEFINITIONS.map((definition) => [
      definition.id,
      createChapterProgress(definition, definition.id === first.id ? "active" : "locked", now),
    ])
  );
  return {
    currentChapterId: first.id,
    activeChapterId: first.id,
    reviewChapterId: null,
    completedChapterIds: [],
    unlockedChapterIds: [first.id],
    progressByChapterId,
    summariesByChapterId: {},
    lastChapterEndAt: null,
    pendingChapterEndId: null,
  };
}

export function normalizeChapterState(raw: unknown, now = Date.now()): ChapterState {
  const base = createInitialChapterState(now);
  const record = asRecord(raw);
  if (Object.keys(record).length === 0) return base;
  const completedChapterIds = normalizeStringArray(record.completedChapterIds);
  const unlockedChapterIds = Array.from(
    new Set([base.activeChapterId, ...normalizeStringArray(record.unlockedChapterIds), ...completedChapterIds])
  );
  const activeChapterId =
    typeof record.activeChapterId === "string" && unlockedChapterIds.includes(record.activeChapterId)
      ? record.activeChapterId
      : base.activeChapterId;
  const reviewChapterId =
    typeof record.reviewChapterId === "string" && completedChapterIds.includes(record.reviewChapterId)
      ? record.reviewChapterId
      : null;
  const rawProgress = asRecord(record.progressByChapterId);
  const progressByChapterId = Object.fromEntries(
    CHAPTER_DEFINITIONS.map((definition) => {
      const fallback = base.progressByChapterId[definition.id];
      const normalized = normalizeProgress(rawProgress[definition.id], fallback);
      const status =
        completedChapterIds.includes(definition.id)
          ? "completed"
          : definition.id === activeChapterId
            ? "active"
            : unlockedChapterIds.includes(definition.id)
              ? normalized.status === "locked" ? "locked" : normalized.status
              : "locked";
      return [definition.id, { ...normalized, status }];
    })
  );
  const summariesRaw = asRecord(record.summariesByChapterId);
  return {
    currentChapterId: reviewChapterId ?? activeChapterId,
    activeChapterId,
    reviewChapterId,
    completedChapterIds,
    unlockedChapterIds,
    progressByChapterId,
    summariesByChapterId: summariesRaw as ChapterState["summariesByChapterId"],
    lastChapterEndAt: typeof record.lastChapterEndAt === "number" ? record.lastChapterEndAt : null,
    pendingChapterEndId:
      typeof record.pendingChapterEndId === "string" && completedChapterIds.includes(record.pendingChapterEndId)
        ? record.pendingChapterEndId
        : null,
  };
}
