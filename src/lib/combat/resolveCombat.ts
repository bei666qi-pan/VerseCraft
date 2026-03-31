import type {
  CombatActorScore,
  CombatConflictKind,
  CombatOutcomeTier,
  CombatResolution,
  SceneCombatContext,
} from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function bandFromDelta(delta: number): CombatResolution["advantageBand"] {
  const d = Math.abs(delta);
  if (d >= 6.5) return "huge";
  if (d >= 3.5) return "clear";
  if (d >= 1.5) return "thin";
  return "even";
}

function outcomeFromDelta(delta: number, kind: CombatConflictKind, scene: SceneCombatContext): CombatOutcomeTier {
  // 安全区与“逃脱/脱离”倾向：更容易收束为 withdraw/stalemate，而非崩盘互伤
  const safeBias = scene.isSafeZone ? 0.9 : 0;
  const d = delta;

  if (kind === "escape") {
    // 安全区“脱离”窗口更大：同等优势更容易成功抽身
    const threshold = 2.4 - safeBias * 0.8;
    if (d >= threshold) return "withdraw";
    if (d <= -4.0) return "forced_retreat";
    return "pressured";
  }

  if (kind === "intimidate") {
    if (d >= 7.2) return "crush";
    if (d >= 4.5) return "overwhelm";
    if (d >= 2.7) return "advantage";
    if (d >= 1.4) return "edge";
    if (d <= -5.6) return "collapse";
    if (d <= -3.8) return "pressured";
    return "stalemate";
  }

  // 明确器械冲突与威胁失控更容易互伤
  const mutualHarmBias = (kind === "weapon_clash" ? 0.8 : 0) + (scene.threatPhase === "breached" ? 0.6 : 0);
  if (Math.abs(d) <= 1.1 && mutualHarmBias >= 1.0) return "mutual_harm";

  if (d >= 8.0) return "crush";
  if (d >= 6.0) return "overwhelm";
  if (d >= 2.5) return "advantage";
  if (d >= 1.2) return "edge";
  if (d <= -6.0) return "collapse";
  if (d <= -2.5) return "pressured";
  return "stalemate";
}

function likelyCostFromOutcome(outcome: CombatOutcomeTier, scene: SceneCombatContext): CombatResolution["explain"]["likelyCost"] {
  if (scene.isSafeZone && outcome === "withdraw") return "none";
  if (outcome === "crush") return "light";
  if (outcome === "overwhelm") return "light";
  if (outcome === "advantage") return "light";
  if (outcome === "edge") return "moderate";
  if (outcome === "stalemate") return "moderate";
  if (outcome === "pressured") return "moderate";
  if (outcome === "forced_retreat") return "heavy";
  if (outcome === "mutual_harm" || outcome === "mutual_damage") return "heavy";
  return "heavy";
}

function collateralFrom(scene: SceneCombatContext, outcome: CombatOutcomeTier): CombatResolution["explain"]["collateral"] {
  if (scene.isSafeZone) return "minor";
  if (scene.floorId === "B2") return "limited";
  if (scene.floorId === "7" && (outcome === "mutual_harm" || outcome === "collapse")) return "limited";
  return outcome === "overwhelm" ? "minor" : outcome === "stalemate" ? "minor" : "limited";
}

export function resolveCombat(args: {
  attacker: CombatActorScore;
  defender: CombatActorScore;
  scene: SceneCombatContext;
  kind: CombatConflictKind;
}): CombatResolution {
  const attacker = args.attacker;
  const defender = args.defender;

  // 场景修正：把 pressure 作为“同时压缩双方容错”的因素，但更不利于防守方（退路被卡）
  const sceneBias = clamp(args.scene.modifiers.pressure * 0.35 + args.scene.modifiers.concealment * 0.15, -1.2, 1.4);
  const delta = (attacker.score - defender.score) + sceneBias;
  const band = bandFromDelta(delta);
  const outcome = outcomeFromDelta(delta, args.kind, args.scene);

  const winner: CombatResolution["winner"] =
    outcome === "crush" || outcome === "overwhelm" || outcome === "advantage" || outcome === "edge" ? "attacker" :
    outcome === "collapse" || outcome === "pressured" || outcome === "forced_retreat" ? "defender" :
    outcome === "withdraw" ? "attacker" :
    "none";

  const why: string[] = [];
  if (args.scene.isSafeZone) why.push("在安全区，冲突更容易被收束为“可控的退让/脱离”。");
  if (args.scene.threatPhase === "active" || args.scene.threatPhase === "breached") why.push("威胁相位升高，动作容错更低。");
  if (band === "huge") why.push("双方差距过大，几乎不需要长时间纠缠。");
  if (band === "thin") why.push("差距很细，胜负取决于一步退路或一次失误。");
  if (outcome === "edge") why.push("优势很薄：更像踩在一个窗口上赢来的。");
  if (outcome === "mutual_harm" || outcome === "mutual_damage") why.push("对抗在狭窄窗口里互相擦伤，谁都没真正占到便宜。");
  if (outcome === "forced_retreat") why.push("你没抓住脱离窗口，被对方逼着退走。");

  // 风格解释（避免裸数）
  const aStyle = attacker.styleTags.slice(0, 2).join("、");
  const dStyle = defender.styleTags.slice(0, 2).join("、");
  if (aStyle) why.push(`进攻方更偏：${aStyle}。`);
  if (dStyle) why.push(`防守方更偏：${dStyle}。`);

  return {
    outcome,
    winner,
    advantageBand: band,
    attacker,
    defender,
    scene: args.scene,
    explain: {
      why,
      likelyCost: likelyCostFromOutcome(outcome, args.scene),
      collateral: collateralFrom(args.scene, outcome),
    },
  };
}

