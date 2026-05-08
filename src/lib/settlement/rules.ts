export type SettlementGrade = "S" | "A" | "B" | "C" | "D" | "E";

export type SettlementEscapeOutcome =
  | "none"
  | "true_escape"
  | "false_escape"
  | "costly_escape"
  | "doom";

export type SettlementOutcome = SettlementEscapeOutcome | "death" | "abandon";

export function computeSettlementGrade(input: {
  isDead: boolean;
  maxFloor: number;
  killedAnomalies: number;
  survivalHours: number;
  escapeOutcome: SettlementOutcome;
}): SettlementGrade {
  if (input.isDead || input.escapeOutcome === "death") {
    return input.maxFloor >= 6 || input.killedAnomalies >= 3 || input.survivalHours >= 72 ? "D" : "E";
  }
  if (input.escapeOutcome === "true_escape") return "S";
  if (input.escapeOutcome === "costly_escape") {
    return input.maxFloor >= 8 || input.killedAnomalies >= 3 || input.survivalHours >= 96 ? "S" : "A";
  }
  if (input.escapeOutcome === "false_escape") {
    return input.maxFloor >= 7 || input.killedAnomalies >= 4 || input.survivalHours >= 72 ? "A" : "B";
  }
  if (input.maxFloor >= 8 && input.survivalHours >= 72) return "A";
  if (input.maxFloor >= 7 || input.killedAnomalies >= 5 || (input.maxFloor >= 6 && input.survivalHours >= 48)) return "A";
  if (input.maxFloor >= 5 || input.killedAnomalies >= 3 || (input.maxFloor >= 4 && input.killedAnomalies >= 2)) return "B";
  if (input.maxFloor >= 3 || input.killedAnomalies >= 2 || input.survivalHours >= 36) return "C";
  if (input.maxFloor >= 2 || input.killedAnomalies >= 1 || input.survivalHours >= 12) return "D";
  return "E";
}

export function getSettlementGradeCaption(grade: SettlementGrade, escapeOutcome: SettlementOutcome): string {
  if (escapeOutcome === "true_escape") return "你找到了真正的出口，并把规则留在身后";
  if (escapeOutcome === "costly_escape") return "你离开了公寓，但某些代价仍留在门内";
  if (escapeOutcome === "false_escape") return "你看似离开，却踏进了更深一层的循环";
  if (escapeOutcome === "death") return grade === "D" ? "你死在规则边缘，仍留下了可被回看的痕迹" : "死亡合上了本局，也保留了最后一刻的证词";
  if (escapeOutcome === "doom") return "终焉已经落下，而你的痕迹仍未散尽";
  if (grade === "S") return "你找到了真正的出口，并把规则留在身后";
  if (grade === "A") return "你离出口只剩一步，公寓已经记住你的名字";
  if (grade === "B") return "你撕开了几处裂缝，但还没拿到最后的钥匙";
  if (grade === "C") return "你证明了自己能活，却还没证明自己能赢";
  if (grade === "D") return "你摸到过规则的边缘，也付出了足够的代价";
  return "你的意识渐渐消散，但一切还未终焉";
}

export function getSettlementOutcomeTitle(outcome: SettlementOutcome): string {
  switch (outcome) {
    case "true_escape":
      return "真正逃离";
    case "costly_escape":
      return "代价逃离";
    case "false_escape":
      return "假逃离";
    case "doom":
      return "终焉";
    case "death":
      return "死亡";
    case "abandon":
      return "中止";
    case "none":
    default:
      return "未完成";
  }
}

export function getSettlementOutcomeLead(outcome: SettlementOutcome): string {
  switch (outcome) {
    case "true_escape":
      return "真正的门已经在你身后合上，公寓的规则没有再跟出来。";
    case "costly_escape":
      return "你走出了门，但有些关系、记忆或代价被留在门内。";
    case "false_escape":
      return "出口接住了你，也复制了你；循环只是换了更安静的名字。";
    case "doom":
      return "第十日落下，公寓不再伪装成建筑。";
    case "death":
      return "死亡结束了本局，但没有抹掉最后行动留下的证词。";
    case "abandon":
      return "本局在这里中止，未被选择的门仍留在暗处。";
    case "none":
    default:
      return "这是一份从旧存档临时重建的结算记录。";
  }
}

export function formatSettlementFloor(score: number): string {
  if (score >= 8) return "地下二层";
  if (score <= 0) return "地下一层";
  return `第 ${Math.max(1, Math.trunc(score))} 层`;
}

export function resolveSettlementFloorScore(location: string): number {
  if (!location) return 0;
  if (location.startsWith("B2_")) return 8;
  if (location.startsWith("B1_")) return 0;
  const match = location.match(/^(\d)F_/);
  return match ? Number(match[1] ?? 0) : 0;
}
