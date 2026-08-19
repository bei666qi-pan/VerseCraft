import type { PacingChapterControllerPlan, StoryDirectorState } from "./types";
import type { DirectorSignals } from "./signals";

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

export function planStoryBeat(args: {
  director: StoryDirectorState;
  signals: DirectorSignals;
}): PacingChapterControllerPlan {
  const d = args.director;
  const s = args.signals;
  const chapter = d.chapter;
  const pressureFlags: PacingChapterControllerPlan["pressureFlags"] = [];
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

  const beatMode: PacingChapterControllerPlan["beatMode"] = (() => {
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

  const preferredIncidentCode =
    !inCooldown && mustAdvance && budget >= 35
      ? "threat_push_close"
      : !inCooldown && s.debtPileup
        ? "npc_demand_repayment"
        : !inCooldown && s.falseCalmRisk
          ? "false_safe_zone_break"
          : !inCooldown && s.hooksReady && budget >= 30
            ? "silent_following_reveal"
            : null;

  const suppressions = uniq(
    [
      ...(inCooldown ? ["npc_collision_now", "false_safe_zone_break"] : []),
      ...(budget <= 18 ? ["npc_collision_now", "threat_push_close", "false_safe_zone_break"] : []),
    ],
    8
  );

  return {
    beatMode,
    mustAdvance,
    mustRecallHookCodes,
    preferredIncidentCode,
    suppressions,
    pressureFlags,
  };
}
