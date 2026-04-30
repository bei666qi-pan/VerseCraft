// src/lib/ai/governance/enhancementRulesPure.ts
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

export interface EnhancementGateResult {
  allowed: boolean;
  score: number;
  reasons: string[];
  /** When true, skip random downsample (always attempt if budget allows). */
  forceAttempt: boolean;
}

function parseDmSignals(dmJsonText: string): {
  bgm?: string;
  sanityDamage?: number;
  hasAwardedRare?: boolean;
} {
  const bgm = dmJsonText.match(/"bgm_track"\s*:\s*"([^"]+)"/)?.[1];
  const sd = dmJsonText.match(/"sanity_damage"\s*:\s*(-?\d+)/)?.[1];
  const sanityDamage = sd != null ? Number(sd) : undefined;
  const hasAwardedRare =
    /"I-S|"I-A|"awarded_items"\s*:\s*\[[^\]]*(I-S|I-A)/i.test(dmJsonText) ||
    /S级|稀有奖励|传说道具/.test(dmJsonText);
  return { bgm, sanityDamage, hasAwardedRare };
}

/**
 * Code-enforced gate: premium sensory models must not run on mundane turns.
 * Combines deterministic context/DM signals with control-plane hints.
 */
export function evaluateNarrativeEnhancementGate(args: {
  control: PlayerControlPlane | null;
  rule: PlayerRuleSnapshot;
  playerContext: string;
  latestUserInput: string;
  isFirstAction: boolean;
  accumulatedDmJson: string;
  /** Minimum score to allow enhancement (default 32, historical). */
  gateMinScore?: number;
}): EnhancementGateResult {
  const reasons: string[] = [];
  let score = 0;

  const wantScene = Boolean(args.control?.enhance_scene) && args.rule.high_value_scene;
  const wantNpc = Boolean(args.control?.enhance_npc_emotion) && args.rule.in_dialogue_hint;
  if (!wantScene && !wantNpc) {
    return { allowed: false, score: 0, reasons: ["no_control_signal"], forceAttempt: false };
  }

  if (args.isFirstAction) {
    score += 45;
    reasons.push("first_scene");
  }

  const ctx = `${args.playerContext}\n${args.latestUserInput}`;
  if (/第\s*[7-9]\s*层|七层|八层|九层|地下二层|B2|13\s*楼|深渊|守门人/.test(ctx)) {
    score += 28;
    reasons.push("deep_or_boss_context");
  }

  const sig = parseDmSignals(args.accumulatedDmJson);
  if (
    sig.bgm === "bgm_endgame_high_pressure" ||
    sig.bgm === "bgm_darkmoon_anomaly" ||
    sig.bgm === "bgm_8_boss" ||
    sig.bgm === "bgm_5_darkmoon"
  ) {
    score += 32;
    reasons.push("high_tension_bgm");
  }
  if (typeof sig.sanityDamage === "number" && sig.sanityDamage >= 10) {
    score += 18;
    reasons.push("heavy_sanity_hit");
  }
  if (sig.hasAwardedRare) {
    score += 22;
    reasons.push("rare_reward_signal");
  }
  if (args.rule.in_combat_hint && args.rule.high_value_scene) {
    score += 12;
    reasons.push("combat_atmosphere");
  }

  const minScore = args.gateMinScore ?? 32;
  const forceAttempt = score >= 68;
  const allowed = score >= minScore;
  if (!allowed) {
    reasons.push("below_min_score");
    return { allowed: false, score, reasons, forceAttempt: false };
  }

  return { allowed: true, score, reasons, forceAttempt };
}

/**
 * Stochastic layer on top of gate (reduces steady-state enhancement upstream spend).
 * `forceAttempt` bypasses sampling.
 */
export function sampleEnhancementAttempt(forceAttempt: boolean, score: number): boolean {
  if (forceAttempt) return true;
  if (score >= 55) return Math.random() < 0.55;
  if (score >= 40) return Math.random() < 0.28;
  return Math.random() < 0.12;
}
