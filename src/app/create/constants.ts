import type { StatType } from "@/lib/registry/types";
import type { EchoTalent } from "@/store/useGameStore";

export const GENDER_OPTIONS = ["男", "女", "其他"] as const;
export type GenderOption = (typeof GENDER_OPTIONS)[number];

export const PERSONALITY_RE = /^[\u4e00-\u9fa5]{2,6}$/;

export const BASE_STATS: Record<StatType, number> = {
  sanity: 10,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};

export const EXTRA_POINTS = 30;

export const CREATE_STAT_ORDER = [
  "sanity",
  "agility",
  "luck",
  "charm",
  "background",
] as const satisfies readonly StatType[];

export const STAT_LABELS: Record<StatType, string> = {
  sanity: "精神",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

export const STAT_DESCRIPTIONS: Record<StatType, string> = {
  sanity: "精神越高，越能抵抗叙事侵蚀。",
  agility: "敏捷越高，越能在危机中找到转机",
  luck: "幸运越高，越能得到关键提示",
  charm: "魅力越高，越能改变对话走向",
  background: "出身越高，越能获得更多原石\n初始原石 = 10 + 出身。",
};

export const TALENTS: readonly {
  key: EchoTalent;
  title: string;
  cd: string;
  desc: string;
}[] = [
  { key: "时间回溯", title: "时间回溯", cd: "冷却：6 小时", desc: "退回至 1 小时前，删除最近 2 条记录。" },
  { key: "命运馈赠", title: "命运馈赠", cd: "冷却：10 小时", desc: "尝试获得额外灵感，但可能引发风险。" },
  { key: "主角光环", title: "主角光环", cd: "冷却：8 小时", desc: "短时间降低失败惩罚，并触发 1 次收益事件。" },
  { key: "生命汇源", title: "生命汇源", cd: "冷却：10 小时", desc: "立即恢复最多 20 点精神。" },
  { key: "洞察之眼", title: "洞察之眼", cd: "冷却：8 小时", desc: "提示当前最可靠的推进方向。" },
  { key: "丧钟回响", title: "丧钟回响", cd: "冷却：30 小时", desc: "清除当前场景中的恶意目标，部分目标免疫。" },
] as const;

export function isValidCreatePersonality(value: string): boolean {
  return PERSONALITY_RE.test(value.trim());
}

export function baseStatTotal(): number {
  return CREATE_STAT_ORDER.reduce((sum, stat) => sum + BASE_STATS[stat], 0);
}

export function sumCreateStats(stats: Record<StatType, number>): number {
  return CREATE_STAT_ORDER.reduce((sum, stat) => sum + stats[stat], 0);
}

export function calculateRemainingPoints(stats: Record<StatType, number>): number {
  return EXTRA_POINTS - (sumCreateStats(stats) - baseStatTotal());
}

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
