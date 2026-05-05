export type SettlementGrade = "S" | "A" | "B" | "C" | "D" | "E";

export type SettlementEscapeOutcome =
  | "none"
  | "true_escape"
  | "false_escape"
  | "costly_escape"
  | "doom";

export function computeSettlementGrade(input: {
  isDead: boolean;
  maxFloor: number;
  killedAnomalies: number;
  survivalHours: number;
  escapeOutcome: SettlementEscapeOutcome;
}): SettlementGrade {
  if (input.isDead) return "E";
  if (input.escapeOutcome === "true_escape" || input.escapeOutcome === "costly_escape") return "S";
  if (input.maxFloor >= 8 && input.survivalHours >= 72) return "A";
  if (input.maxFloor >= 7 || input.killedAnomalies >= 5 || (input.maxFloor >= 6 && input.survivalHours >= 48)) return "A";
  if (input.maxFloor >= 5 || input.killedAnomalies >= 3 || (input.maxFloor >= 4 && input.killedAnomalies >= 2)) return "B";
  if (input.maxFloor >= 3 || input.killedAnomalies >= 2 || input.survivalHours >= 36) return "C";
  if (input.maxFloor >= 2 || input.killedAnomalies >= 1 || input.survivalHours >= 12) return "D";
  return "E";
}

export function getSettlementGradeCaption(grade: SettlementGrade, escapeOutcome: SettlementEscapeOutcome): string {
  if (grade === "S") return "你找到了真正的出口，并把规则留在身后";
  if (grade === "A") return "你离出口只剩一步，公寓已经记住你的名字";
  if (grade === "B") return "你撕开了几处裂缝，但还没拿到最后的钥匙";
  if (grade === "C") return "你证明了自己能活，却还没证明自己能赢";
  if (grade === "D") return "你摸到过规则的边缘，也付出了足够的代价";
  if (escapeOutcome === "doom") return "终焉已经落下，而你的痕迹仍未散尽";
  return "你的意识渐渐消散，但一切还未终焉";
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
