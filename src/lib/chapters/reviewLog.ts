import type { ChapterProgress } from "./types";

export type ChapterReviewLogEntry = {
  role: "assistant" | "user";
  content: string;
  logIndex: number;
};

type RawLogEntry = {
  role?: unknown;
  content?: unknown;
};

function clampIndex(value: unknown, fallback: number, maxExclusive: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.max(0, Math.min(Math.max(0, maxExclusive - 1), n));
}

export function selectChapterReviewLogEntries(
  logs: readonly RawLogEntry[] | null | undefined,
  progress: ChapterProgress | null | undefined
): ChapterReviewLogEntry[] {
  const source = Array.isArray(logs) ? logs : [];
  if (source.length === 0 || !progress) return [];
  const startRaw =
    typeof progress.startedLogIndex === "number" && Number.isFinite(progress.startedLogIndex)
      ? Math.trunc(progress.startedLogIndex)
      : 0;
  const endRaw =
    typeof progress.completedLogIndex === "number" && Number.isFinite(progress.completedLogIndex)
      ? Math.trunc(progress.completedLogIndex)
      : source.length - 1;
  if (endRaw < startRaw) return [];
  const start = clampIndex(startRaw, 0, source.length);
  const end = clampIndex(endRaw, source.length - 1, source.length);

  return source
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => index >= start && index <= end)
    .filter(({ entry }) => (entry?.role === "assistant" || entry?.role === "user") && typeof entry.content === "string")
    .map(({ entry, index }) => ({
      role: entry.role as "assistant" | "user",
      content: String(entry.content),
      logIndex: index,
    }));
}
