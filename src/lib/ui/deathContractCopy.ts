export type DeathContractPenaltyDigest = {
  timeSkipHours: number;
  lostItemCount: number;
  lootedItemCount: number;
  failedTaskCount: number;
  respawnAnchorLabel?: string | null;
};

export const DEATH_CONTRACT_SLOGANS = {
  core: "死亡不是回到过去，而是带着代价被锚点强行拉回现实。",
  recovery: "恢复是工程兜底，不是玩法赦免。",
  revive: "复活是时间、物资、关系、局势都付出代价后的继续。",
} as const;

export function settlementReviveCtaTitle(): string {
  return "继续行动：锚点复生（付出代价）";
}

export function settlementReviveCtaSubtitle(d: DeathContractPenaltyDigest): string {
  const parts: string[] = [];
  if (Number.isFinite(d.timeSkipHours) && d.timeSkipHours > 0) parts.push(`时间前推 +${Math.trunc(d.timeSkipHours)}h`);
  if (Number.isFinite(d.lostItemCount) && d.lostItemCount > 0) parts.push(`行囊清空 ${Math.trunc(d.lostItemCount)} 件`);
  if (Number.isFinite(d.lootedItemCount) && d.lootedItemCount > 0) parts.push(`掉落被夺/遗失 ${Math.trunc(d.lootedItemCount)} 件`);
  if (Number.isFinite(d.failedTaskCount) && d.failedTaskCount > 0) parts.push(`失约/落空 ${Math.trunc(d.failedTaskCount)} 项`);
  if (parts.length === 0) return "世界没有停下：你只是被拽回现实。";
  return parts.slice(0, 3).join(" · ");
}

export function settlementReviveContractHeadline(): string {
  return "锚点契约";
}

export function settlementReviveContractBody(): string {
  return [
    DEATH_CONTRACT_SLOGANS.core,
    "你可以继续，但后果不会被抹平。",
  ].join("\n");
}

export function settlementRecoveryDisclaimer(): string {
  return DEATH_CONTRACT_SLOGANS.recovery;
}

export function homeContinuePrimaryCta(): string {
  return "继续行动";
}

export function homeContinuePickerTitle(): string {
  return "选择要继续的记录";
}

export function homeContinueConflictHint(): string {
  return "同槽时间不一致：继续行动时会在弹窗内让你选择来源。";
}

export function homeContinueUnavailableToast(): string {
  return "无法载入该记录。";
}

export function homeRecoveryFallbackToast(): string {
  return "本地异常恢复不可用。";
}

