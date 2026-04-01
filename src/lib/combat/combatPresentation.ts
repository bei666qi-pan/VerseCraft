import type {
  CombatDangerTierForPlayer,
  CombatOutcomeTier,
  CombatPrecheckVerdict,
  CombatResolution,
  CombatStyleTag,
  ConflictResultLayer,
  HiddenPostureTier,
} from "./types";

export function dangerTierToPlayerText(tier: CombatDangerTierForPlayer): string {
  switch (tier) {
    case "negligible":
      return "不构成威胁";
    case "low":
      return "危险偏低";
    case "medium":
      return "危险中等";
    case "high":
      return "危险偏高";
    case "extreme":
      return "极高危险";
    default:
      return "危险不明";
  }
}

export function outcomeTierToConflictText(outcome: CombatOutcomeTier): string {
  switch (outcome) {
    case "crush":
      return "完全被压住，几乎没有回合";
    case "overwhelm":
      return "几乎瞬间分出高下";
    case "advantage":
      return "你能占到上风";
    case "edge":
      return "踩着窗口勉强压过";
    case "stalemate":
      return "短暂僵持";
    case "pressured":
      return "你被压着打";
    case "collapse":
      return "局面迅速崩盘";
    case "mutual_harm":
    case "mutual_damage":
      return "互相擦伤，谁也没赚到";
    case "withdraw":
      return "抓住窗口脱离";
    case "forced_retreat":
      return "被迫退走，丢了位置";
    default:
      return "冲突结果不明";
  }
}

export function verdictToPostureTier(verdict: CombatPrecheckVerdict): HiddenPostureTier {
  if (verdict === "favorable") return "upper_hand";
  if (verdict === "contested") return "contested";
  if (verdict === "risky") return "under_pressure";
  if (verdict === "avoid") return "collapse_risk";
  return "contested";
}

export function postureTierToThreatSense(tier: HiddenPostureTier): string {
  if (tier === "dominant") return "你掌控节奏";
  if (tier === "upper_hand") return "你有可争取的压制窗口";
  if (tier === "contested") return "双方都在抢一步机会";
  if (tier === "under_pressure") return "你在被动位，失误代价高";
  return "再硬顶很可能直接崩盘";
}

export function postureTierToOpportunityWindow(tier: HiddenPostureTier): string {
  if (tier === "dominant") return "窗口宽：可连动推进";
  if (tier === "upper_hand") return "窗口短：先拿位置再求结果";
  if (tier === "contested") return "窗口窄：只够换一步";
  if (tier === "under_pressure") return "窗口碎：以止损或脱离为先";
  return "窗口几乎关闭：优先撤离";
}

export function postureTierToActionDirection(tier: HiddenPostureTier): string {
  if (tier === "dominant") return "压住后立刻收束局面，别恋战炫技。";
  if (tier === "upper_hand") return "先卡退路再施压，争取低代价逼退。";
  if (tier === "contested") return "用环境换位，不要赌单次硬拼。";
  if (tier === "under_pressure") return "先保命与脱离，再找反制入口。";
  return "停止正面冲突，立刻转撤离/交易/求援。";
}

export function postureTierToCostWarning(tier: HiddenPostureTier): string {
  if (tier === "dominant" || tier === "upper_hand") return "代价可控，但仍可能留下关系与物资损耗。";
  if (tier === "contested") return "代价中等：位置、关系或器物可能受损。";
  if (tier === "under_pressure") return "代价偏高：容易被迫退位并丢资源。";
  return "代价极高：存在失控与连续反噬风险。";
}

export function outcomeToResultLayer(outcome: CombatOutcomeTier): ConflictResultLayer {
  if (outcome === "overwhelm" || outcome === "advantage" || outcome === "edge") return "suppress_success";
  if (outcome === "withdraw" || outcome === "forced_retreat") return "narrow_pushback";
  if (outcome === "mutual_harm" || outcome === "mutual_damage" || outcome === "stalemate") return "mutual_bruise";
  if (outcome === "pressured") return "forced_withdraw";
  if (outcome === "crush" || outcome === "collapse") return "runaway_collapse";
  return "mutual_bruise";
}

export function resultLayerToPlayerText(layer: ConflictResultLayer): string {
  if (layer === "suppress_success") return "结果层级：压制成功";
  if (layer === "narrow_pushback") return "结果层级：勉强逼退";
  if (layer === "mutual_bruise") return "结果层级：两败俱伤";
  if (layer === "forced_withdraw") return "结果层级：被迫撤离";
  return "结果层级：失控崩盘";
}

/**
 * 叙事结算锚点：不给数字，只给“为什么能赢/为什么会输”的短解释片段。
 * 这些短句适合写进 DM 或 post-guard 的解释摘要。
 */
export function buildCombatExplainSnippets(res: CombatResolution): string[] {
  const out: string[] = [];
  for (const w of res.explain.why.slice(0, 5)) out.push(w);
  if (res.explain.likelyCost === "none") out.push("代价很小，更多像一次被迫让步。");
  if (res.explain.likelyCost === "heavy") out.push("代价不轻：更像一次“扛过去”而不是赢。");
  if (res.explain.collateral === "limited") out.push("破坏被控制在局部，不会夸张扩散。");
  return out;
}

/**
 * 给 codex 的 combatPowerDisplay 语义：只输出“模糊危险级别 + 风格短句”，绝不写裸数字。
 */
export function buildNpcCombatPowerDisplay(args: { dangerText: string; styleHint: string }): string {
  const d = String(args.dangerText ?? "").trim();
  const s = String(args.styleHint ?? "").trim();
  if (d && s) return `${d} · ${s}`;
  return d || s || "危险不明";
}

export function styleTagsToPlayerHint(tags: CombatStyleTag[] | undefined | null): string {
  const t = (tags ?? []).filter(Boolean);
  const uniq = [...new Set(t)].slice(0, 2);
  const one = (x: CombatStyleTag): string => {
    switch (x) {
      case "boundary_guard":
        return "守线卡位";
      case "close_quarters":
        return "近身压迫";
      case "ambush":
        return "伏击短爆发";
      case "tradecraft":
        return "条件与撤离窗口";
      case "mirror_counter":
        return "错位反制";
      case "medical_control":
        return "控制与麻痹";
      case "utility_support":
        return "护送止损";
      case "social_pressure":
        return "心理压迫";
      default:
        return "风格未明";
    }
  };
  if (uniq.length === 0) return "";
  return uniq.map(one).join("、");
}

