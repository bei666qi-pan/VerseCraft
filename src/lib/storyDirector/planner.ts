import type { DirectorPlan, StoryDirectorState } from "./types";
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
}): DirectorPlan {
  const d = args.director;
  const s = args.signals;
  const pressureFlags: DirectorPlan["pressureFlags"] = [];
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

  const mustRecallHookCodes = s.hookCodesReady.slice(0, mustAdvance ? 2 : 1);

  const beatMode: DirectorPlan["beatMode"] = (() => {
    if (inCooldown) return "aftershock";
    if (s.nearPeak && budget >= 55) return "peak";
    if (s.falseCalmRisk) return "falseCalmTurns" in d ? "pressure" : "pressure";
    if (mustAdvance && budget >= 28) return "pressure";
    if (s.highPressure && budget >= 35) return "pressure";
    if (s.hooksReady && budget >= 20) return "reveal";
    return "quiet";
  })();

  const softPressureHint =
    beatMode === "quiet"
      ? null
      : beatMode === "reveal"
        ? "让旧线索/旧承诺自然回到场景里，像‘被盯上’或‘被想起’。"
        : beatMode === "aftershock"
          ? "余震窗口：允许喘息，但不要把危险写没；留下一点后果回音。"
          : mustAdvance
            ? "停滞惩罚：先用轻压力推你做选择，不要直接抛系统提示。"
            : "压力上升：让环境/人际/机会产生‘要么现在，要么错过’的感觉。";

  const hardConstraint =
    beatMode === "quiet"
      ? "避免连续解释设定；用行动推进。"
      : "不要写‘系统触发事件/导演安排’；一切必须通过场景与人物行为自然发生。";

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
    softPressureHint,
    hardConstraint,
    suppressions,
    pressureFlags,
  };
}

