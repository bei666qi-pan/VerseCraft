export interface OptionsRepairPlanInput {
  acceptedOptions: string[];
  targetCount?: number;
}

export function shouldTriggerOptionsRepairPass(input: OptionsRepairPlanInput): boolean {
  const target = Math.max(1, Math.min(4, Math.trunc(Number(input.targetCount ?? 4))));
  const acceptedLen = Array.isArray(input.acceptedOptions) ? input.acceptedOptions.length : 0;
  return acceptedLen > 0 && acceptedLen < target;
}

export function getRepairMissingCount(input: OptionsRepairPlanInput): number {
  const target = Math.max(1, Math.min(4, Math.trunc(Number(input.targetCount ?? 4))));
  const acceptedLen = Array.isArray(input.acceptedOptions) ? input.acceptedOptions.length : 0;
  return Math.max(0, target - acceptedLen);
}

export function buildOptionsRepairReason(args: {
  baseReason: string;
  acceptedOptions: string[];
  missingCount: number;
}): string {
  const locked = (Array.isArray(args.acceptedOptions) ? args.acceptedOptions : [])
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0)
    .slice(0, 4);
  const miss = Math.max(0, Math.min(4, Math.trunc(Number(args.missingCount ?? 0))));
  return [
    `${String(args.baseReason ?? "").trim() || "重整选项修复"}`,
    `repair_missing_slots:${miss}`,
    miss > 0 ? `仅补齐${miss}条，不要重写已有候选` : "",
    locked.length > 0 ? `已有合格选项：${locked.join("；")}` : "",
  ]
    .filter((x) => x.length > 0)
    .join(" | ");
}

