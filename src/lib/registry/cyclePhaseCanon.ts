/**
 * Cycle Phase Canon — 如月公寓 10 天循环周期与各阶段行为数据
 *
 * 公寓以 10 天为单位循环运转——并非自然昼夜，而是消化系统的节律性代谢。
 * DM 编排时根据当前周期日调整 anomaly 活跃度、NPC 行为倾向和叙事基调。
 */

// ── 周期相位 ──

/**
 * 10 天循环的四阶段划分
 * 每个阶段对应不同的消化活跃度与安全窗口
 */
export const CYCLE_PHASES = {
  /** 平静期——消化最弱，NPC 最清醒，安全窗口最大 */
  QUIESCENCE: {
    days: [1, 2] as readonly number[],
    label: "平静期",
    description: "消化活动最低谷。公寓如同普通旧楼，异常现象减少。NPC 认知最清晰、记忆最完整。",
    anomalyActivity: "low" as const,
    safetyWindow: "wide" as const,
    flashFlowChance: 0.05,
    narrativeTone: "日常微恐",
  },
  /** 校准期——消化系统自检，异常开始活跃 */
  CALIBRATION: {
    days: [3, 4, 5, 6] as readonly number[],
    label: "校准期",
    description: "公寓对内部空间进行计量和标记。空间微变、门牌错位、走廊延申常见。NPC 开始出现记忆模糊。",
    anomalyActivity: "moderate" as const,
    safetyWindow: "diminishing" as const,
    flashFlowChance: 0.20,
    narrativeTone: "不安蔓延",
  },
  /** 前兆期——消化高峰临近，异常高度活跃 */
  PRECURSOR: {
    days: [7, 8] as readonly number[],
    label: "前兆期",
    description: "消化系统进入预备状态。异常事件频发，记忆气泡大量涌出，幻觉和空间扭曲显著。NPC 戒备心普遍增强。",
    anomalyActivity: "high" as const,
    safetyWindow: "narrow" as const,
    flashFlowChance: 0.45,
    narrativeTone: "恐惧升级",
  },
  /** 修正窗口——消化攻击最猛烈，也是逆转/逃脱的唯一可能窗口 */
  CORRECTION_WINDOW: {
    days: [9, 10] as readonly number[],
    label: "修正窗口期",
    description: "消化的最高峰阶段。公寓全力尝试消化所有残余生命。异常具象化，B2 裂隙完全打开。也是触发退出链的唯一时间窗口。",
    anomalyActivity: "critical" as const,
    safetyWindow: "minimal" as const,
    flashFlowChance: 0.70,
    narrativeTone: "绝境求生",
  },
} as const;

/** 周期阶段的联合类型 */
export type CyclePhase = keyof typeof CYCLE_PHASES;

/** 异常活跃度等级 */
export type AnomalyActivity = "low" | "moderate" | "high" | "critical";

/** 安全窗口宽度 */
export type SafetyWindow = "wide" | "diminishing" | "narrow" | "minimal";

// ── 每日节奏 ──

/** 公寓内一天的时间比例 */
export const DAY_NIGHT_CYCLE = {
  /** 日间时长（小时） */
  dayHours: 10,
  /** 夜间时长（小时） */
  nightHours: 14,
  /** 总周期（小时） */
  totalHours: 24,
} as const;

/** 玩家每日休息阈值 */
export const DAILY_RHYTHM = {
  /** 建议醒睡节奏 */
  suggestedSleepWindow: "日间 6h + 夜间 4h 分段睡眠",
  /** 连续不休息上限（小时） */
  maxAwakeSafe: 20,
} as const;

// ── Flash Flow 记忆闪流 ──

/** 记忆闪流（Flash Flow）参数 */
export const FLASH_FLOW = {
  /** 单次闪流持续时间范围（秒） */
  durationRange: [30, 180] as readonly [number, number],
  /** 闪流可能携带的信息类型 */
  contentTypes: [
    "死者记忆碎片",
    "空间重影回放",
    "未来可能性的投射阴影",
    "其他锚位的共鸣片段",
    "公寓消化前的一次记忆代谢",
  ] as readonly string[],
  /** 闪流期间认知豁免概率 */
  sanDamageReduction: 0.3,
  /** 闪流后可能获得临时洞察 */
  insightChance: 0.15,
} as const;

// ── 各异常体在各周期的活跃度 ──

/** 各异常体在周期各阶段的活跃倍率 */
export const ANOMALY_CYCLE_ACTIVITY: Record<string, Record<CyclePhase, number>> = {
  "A-001":   { QUIESCENCE: 0.1, CALIBRATION: 0.4, PRECURSOR: 0.7, CORRECTION_WINDOW: 1.0 },
  "A-002":   { QUIESCENCE: 0.2, CALIBRATION: 0.5, PRECURSOR: 0.8, CORRECTION_WINDOW: 1.0 },
  "A-003":   { QUIESCENCE: 0.1, CALIBRATION: 0.3, PRECURSOR: 0.6, CORRECTION_WINDOW: 0.9 },
  "A-004":   { QUIESCENCE: 0.3, CALIBRATION: 0.6, PRECURSOR: 0.9, CORRECTION_WINDOW: 1.0 },
  "A-005":   { QUIESCENCE: 0.0, CALIBRATION: 0.2, PRECURSOR: 0.5, CORRECTION_WINDOW: 0.8 },
  "A-006":   { QUIESCENCE: 0.1, CALIBRATION: 0.4, PRECURSOR: 0.7, CORRECTION_WINDOW: 1.0 },
  "A-007":   { QUIESCENCE: 0.2, CALIBRATION: 0.5, PRECURSOR: 0.8, CORRECTION_WINDOW: 1.0 },
  "A-008":   { QUIESCENCE: 0.5, CALIBRATION: 0.5, PRECURSOR: 0.5, CORRECTION_WINDOW: 0.5 },
} as const;

// ── 辅助函数 ──

/** 根据天数获取当前周期相位 */
export function getPhaseByDay(day: number): CyclePhase {
  const d = ((day - 1) % 10) + 1; // 归一化到 1-10
  if (d <= 2) return "QUIESCENCE";
  if (d <= 6) return "CALIBRATION";
  if (d <= 8) return "PRECURSOR";
  return "CORRECTION_WINDOW";
}

/** 构建 DM 可读的周期上下文块 */
export function buildCyclePhaseBlock(day: number): string {
  const phase = getPhaseByDay(day);
  const phaseData = CYCLE_PHASES[phase];
  return (
    `【当前周期】第 ${day} 天 — ${phaseData.label}\n` +
    `${phaseData.description}\n` +
    `异常活跃度：${phaseData.anomalyActivity} | 安全窗口：${phaseData.safetyWindow}\n` +
    `叙事基调：${phaseData.narrativeTone}`
  );
}
