import type { ChapterPacingPlan, ChapterPacingState } from "./types";
import type { ChapterPacingSignals } from "./signals";

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

export function planChapterPacing(args: {
  pacing: ChapterPacingState;
  signals: ChapterPacingSignals;
}): ChapterPacingPlan {
  const d = args.pacing;
  const s = args.signals;
  const chapter = d.chapter;
  const pressureFlags: ChapterPacingPlan["pressureFlags"] = [];
  if (s.stalled) pressureFlags.push("stalling");
  if (s.threatHot) pressureFlags.push("high_threat");
  if (s.debtPileup) pressureFlags.push("debt_pileup");
  if (s.promisePileup) pressureFlags.push("promise_pileup");
  if (s.hooksReady) pressureFlags.push("hooks_ready");

  // budget/cooldown aware beat mode
  const cooldownSincePeak = s.nowTurn - (d.recentPeakTurn ?? 0);
  const inCooldown = cooldownSincePeak <= 1;
  const budget = clampInt(d.pressureBudget ?? 45, 0, 100);
  const mustAdvance = s.stalled || (d.stallCount ?? 0) >= 2;

  const mustRecallHookCodes = uniq(
    [
      ...(s.hookCodesReady ?? []),
      ...(chapter?.mustEchoMemoryIds ?? []),
    ],
    mustAdvance ? 3 : 2
  );

  const beatMode: ChapterPacingPlan["beatMode"] = (() => {
    if (inCooldown) return "aftershock";
    if (chapter?.closeCandidate?.shouldClose || chapter?.chapterPhase === "closing") return "aftershock";
    if (s.nearPeak && budget >= 55) return "peak";
    if (chapter?.chapterPhase === "choice" && budget >= 35) return "collision";
    if ((chapter?.chapterPhase === "echo" || chapter?.chapterPhase === "reveal") && budget >= 20) return "reveal";
    if (s.falseCalmRisk) return "falseCalmTurns" in d ? "pressure" : "pressure";
    if (mustAdvance && budget >= 28) return "pressure";
    if (s.highPressure && budget >= 35) return "pressure";
    if (s.hooksReady && budget >= 20) return "reveal";
    return "quiet";
  })();

  return {
    beatMode,
    mustAdvance,
    mustRecallHookCodes,
    pressureFlags,
  };
}
