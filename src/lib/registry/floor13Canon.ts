/**
 * Floor 13 Canon — 「13楼」未消化层的空间规则与风险
 *
 * 13楼不是物理楼层——它是公寓消化系统无法处理的残余空间碎片聚集而成的
 * 认知盲层。存在于 7F 顶部与屋顶之间的折叠空间裂隙中，只在特定条件下
 * 可被感知和进入。
 *
 * DM 编排时的硬参考。
 */

import type { FloorId } from "./types";

// ── 空间特征 ──

/** 13 楼空间基本常数 */
export const FLOOR13_CONSTANTS = {
  /** 时间流速倍率——外部 1 分钟 ≈ 内部 1.3 分钟 */
  timeDilation: 1.3,
  /** 最大安全停留时间（分钟） */
  maxSafeStayMinutes: 20,
  /** 临界时间——超过此时间后存活概率急剧下降（分钟） */
  criticalThresholdMinutes: 30,
  /** 存在形式 */
  nature: "7F 与屋顶之间的折叠空间裂隙；未消化的记忆与人格残片聚集区",
  /** 出入口特征 */
  entrance: "偶然出现在 7F 走廊尽头的非连续墙缝；触发条件不固定，多在修正窗口期敞开",
} as const;

/** 13 楼内部空间特征 */
export const FLOOR13_ENVIRONMENT = {
  /** 可见度 */
  visibility: "半透明灰色雾霭，能见度 3-5 米",
  /** 温度（摄氏度） */
  temperature: 8,
  /** 湿度 */
  humidity: "异常干燥",
  /** 气味 */
  odor: "旧纸张、铁锈、消毒水混合味",
  /** 背景声 */
  ambientSound: "极低频嗡鸣，偶有人声碎片（语气重复）",
  /** 地面质感 */
  floorTexture: "潮湿水泥地，但踩上去完全不湿",
} as const;

// ── 回声人群（Echo Crowd）──

/** 13 楼回声人群统计 */
export const FLOOR13_ECHO_CROWD = {
  /** 总人数——约 70% 的 238 名被困者 */
  totalCount: 166,
  /** 占被困者比例 */
  proportionOfTotal: 0.7,
  /** 回声类型比例——完全循环片段占多数 */
  echoTypeDistribution: {
    /** 完全循环——重复最后几小时记忆的无意识回声 */
    fullLoop: 0.65,
    /** 半清醒——有基本感知但无法互动 */
    semiConscious: 0.25,
    /** 碎片残留——只有模糊情绪残留 */
    fragmentResidue: 0.10,
  },
  /** 回声交互深度 */
  interactionLevels: [
    "无视（最普遍）——回声不对外界刺激做任何反应",
    "重复语句——回声重复固定短语，但不构成对话",
    "情绪传播——回声的情绪感染进入者",
    "深层共鸣（罕见）——短暂产生单向信息传递",
  ] as readonly string[],
} as const;

// ── 风险阈值 ──

/** 在 13 楼停留的时间风险等级 */
export const FLOOR13_RISK_THRESHOLDS = {
  /** 0-5 分钟：安全窗口，可自由探索 */
  safe: { maxMinutes: 5, description: "感觉寒冷和不安，无实际伤害" },
  /** 5-20 分钟：注意力下降，轻度方向感丧失 */
  caution: { maxMinutes: 20, description: "轻度的自体感模糊——偶尔忘记自己是活人" },
  /** 20-30 分钟：严重认知损伤，记忆干扰 */
  dangerous: { maxMinutes: 30, description: "回声记忆开始覆盖自身记忆，对话能力下降" },
  /** 30+ 分钟：生存概率急速下降 */
  critical: { maxMinutes: Infinity, description: "认知边界消融，可能无法区分自身与他人的记忆" },
} as const;

/** 13 楼内可获取的特殊物品 */
export const FLOOR13_SPECIAL_ITEMS = [
  "记忆结晶——有人格残片固化的源质异形体",
  "残响音叉——能捕捉最近 24 小时的空间回声",
  "未寄出的信——某住户的未完告白，可能是任务道具",
  "时间偏移石英——离开 13 楼后自然碎裂，但能短暂抵抗公寓消化",
] as const;

/** 构建 DM 可读的 13 楼上下文块 */
export function buildFloor13Block(): string {
  const lines: string[] = [
    `【13楼】${FLOOR13_CONSTANTS.nature}`,
    `【时间流速】外部×${FLOOR13_CONSTANTS.timeDilation}，建议停留 ≤${FLOOR13_CONSTANTS.maxSafeStayMinutes}min，≥${FLOOR13_CONSTANTS.criticalThresholdMinutes}min 存活概率骤降`,
    `【回声人群】${FLOOR13_ECHO_CROWD.totalCount} 人（占比 ${FLOOR13_ECHO_CROWD.proportionOfTotal * 100}%），多为无意识循环碎片`,
    `【风险分级】0-5min 安全 / 5-20min 轻度认知影响 / 20-30min 严重干扰 / 30min+ 认知消融`,
    `【特殊物品】记忆结晶、残响音叉、未寄出的信、时间偏移石英`,
  ];
  return lines.join("\n");
}
