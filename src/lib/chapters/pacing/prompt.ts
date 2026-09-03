import type { PacingChapterState } from "./types";

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

export type ValidatedPacingChapterDigest = {
  tension: number;
  stallCount: number;
  beatModeHint: "quiet" | "pressure" | "reveal" | "collision" | "countdown" | "peak" | "aftershock";
  pressureFlags: string[];
  mustRecallHookCodes: string[];
  chapterId: string | null;
};

/** Server-side validation for untrusted client pacing/chapter signals. */
export function validatePacingChapterDigest(value: unknown): ValidatedPacingChapterDigest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const beats = new Set(["quiet", "pressure", "reveal", "collision", "countdown", "peak", "aftershock"]);
  const beat = typeof raw.beatModeHint === "string" && beats.has(raw.beatModeHint) ? raw.beatModeHint : "quiet";
  const codes = (input: unknown, cap: number) => Array.isArray(input)
    ? [...new Set(input.filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 128))
        .filter(Boolean))].slice(0, cap)
    : [];
  const chapter = raw.chapter && typeof raw.chapter === "object" && !Array.isArray(raw.chapter)
    ? raw.chapter as Record<string, unknown>
    : {};
  return {
    tension: Math.max(0, Math.min(100, Math.trunc(Number(raw.tension) || 0))),
    stallCount: Math.max(0, Math.min(9, Math.trunc(Number(raw.stallCount) || 0))),
    beatModeHint: beat as ValidatedPacingChapterDigest["beatModeHint"],
    pressureFlags: codes(raw.pressureFlags, 6),
    mustRecallHookCodes: codes(raw.mustRecallHookCodes, 4),
    chapterId: typeof chapter.chapterId === "string" ? codes([chapter.chapterId], 1)[0] ?? null : null,
  };
}

export function buildPacingSignalsForServer(args: {
  tension: number;
  stallCount: number;
  beatModeHint: string;
  pressureFlags: string[];
  mustRecallHookCodes: string[];
  chapter?: PacingChapterState | null;
}): {
  tension: number;
  stallCount: number;
  beatModeHint: string;
  pressureFlags: string[];
  mustRecallHookCodes: string[];
  chapter?: {
    chapterId: string;
    title: string;
    phase: string;
    shouldClose: boolean;
    nextTitle: string | null;
  };
  digest: string;
} {
  const t = Math.max(0, Math.min(100, Math.trunc(args.tension ?? 0)));
  const stall = Math.max(0, Math.min(9, Math.trunc(args.stallCount ?? 0)));
  const beat = clampText(args.beatModeHint ?? "", 20) || "quiet";
  const flags = (args.pressureFlags ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 6);
  const recall = (args.mustRecallHookCodes ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 4);
  const chapter = args.chapter
    ? {
        chapterId: args.chapter.currentChapterId,
        title: clampText(args.chapter.chapterTitle, 80),
        phase: args.chapter.chapterPhase,
        shouldClose: args.chapter.closeCandidate?.shouldClose === true,
        nextTitle: args.chapter.nextChapterSeed?.title ?? args.chapter.closeCandidate?.nextChapterTitleCandidate ?? null,
      }
    : undefined;
  const chapterDigest = chapter
    ? `;chapter=${chapter.chapterId};close=${chapter.shouldClose ? "1" : "0"};next=${chapter.nextTitle ?? ""}`
    : "";
  const digest = clampText(
    `t=${t};stall=${stall};beat=${beat};flags=${flags.join(",")};recall=${recall.join(",")}${chapterDigest}`,
    220
  );
  return { tension: t, stallCount: stall, beatModeHint: beat, pressureFlags: flags, mustRecallHookCodes: recall, ...(chapter ? { chapter } : {}), digest };
}
