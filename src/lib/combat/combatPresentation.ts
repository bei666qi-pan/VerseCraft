import type { CombatDangerTierForPlayer, CombatOutcomeTier, CombatResolution, CombatStyleTag } from "./types";

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
    case "overwhelm":
      return "几乎瞬间分出高下";
    case "advantage":
      return "你能占到上风";
    case "stalemate":
      return "短暂僵持";
    case "pressured":
      return "你被压着打";
    case "collapse":
      return "局面迅速崩盘";
    case "mutual_harm":
      return "互相擦伤，谁也没赚到";
    case "withdraw":
      return "抓住窗口脱离";
    default:
      return "冲突结果不明";
  }
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

