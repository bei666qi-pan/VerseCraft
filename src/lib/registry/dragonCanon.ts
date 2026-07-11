/**
 * Dragon Canon — 「龙」：如月公寓消化意识的本质与拓扑学机制
 *
 * 「龙」不是实体生物——它是公寓消化系统自我意识的隐喻化呈现。
 * 龙胃黏膜是公寓所处的空间坐标，龙本身是一个拓扑学奇点，
 * 只有在公寓消化系统达到特定「拓扑应力」阈值时才会被感知。
 *
 * DM 编排时参照本文件理解「龙」的本质，避免将其NPC化。
 */

// ── 龙的本质 ──

/** 龙的根本属性 */
export const DRAGON_NATURE = {
  /** 本质定义 */
  essence: "空间碎片化后的拓扑应力可视化呈现；不是生物，是现象",
  /** 楚博士对龙的称呼 */
  chuDesignation: "拓扑异频奇点（Topological Heterodyne Singularity）",
  /** 房东对龙的称呼 */
  landlordDesignation: "消化不良",
  /** 居民感知时的本能投射 */
  projectionBias: "人类大脑倾向于将其「万物有灵论」投射为龙形，但其实每个人看到的龙都不一样",
} as const;

/** 不同角色的龙形视觉投射 */
export const DRAGON_APPEARANCE_VARIANTS = {
  /** 普通人视角——模糊的黑色巨兽轮廓，盘旋在屋顶上方 */
  common: "巨大半透明黑影，无固定形态，如烟雾般在建筑外轮廓流动",
  /** 锚位持有人视角（如叶）——可见鳞片和结构细节 */
  anchor: "暗红色鳞片的修长形体，盘绕在公寓主结构上，鳞缝中渗出暗月裂隙的光芒",
  /** 灵伤视角——能看到拓扑能量的流动线条 */
  lingshang: "光之轮廓——由无数几何蚀刻线条构成的龙形框架，内部是爱因斯坦-罗森桥般的结构",
  /** 楚博士残留视角——看到的是拓扑公式和应力曲面 */
  chuResidue: "马鞍曲面的可视化——一个高维拓扑流形在三维空间的投影，偶然呈现龙形",
  /** 公寓自身的「视角」——无形象，只有消化功能的延伸 */
  apartmentSelfAwareness: "没有视觉概念——只是一处「需要更多时间消化的区域」在自我感知中产生的定位信号",
} as const;

// ── 拓扑学机制 ──

/** 拓扑应力阈值 */
export const TOPOLOGICAL_THRESHOLDS = {
  /** 基线应力——稳定状态 */
  baseline: 0.2,
  /** 可见阈值——应力超过此值时住户开始「看见」龙形 */
  visibleThreshold: 0.5,
  /** 显化阈值——龙形具象化，能够影响物理世界 */
  manifestationThreshold: 0.7,
  /** 崩溃阈值——拓扑奇点不稳定，可能导致整个空间坍缩 */
  collapseThreshold: 0.95,
} as const;

/** 影响拓扑应力的因素 */
export const TOPOLOGICAL_STRESS_FACTORS = {
  /** 锚系统稳定度降低 */
  anchorDegradation: "+0.1/每次锚位受损",
  /** 大量住户同时经历记忆闪流 */
  massFlashFlow: "+0.15/次",
  /** 修正窗口期间 */
  correctionWindowBonus: "+0.2（固定加成）",
  /** 退出链激活 */
  exitChainActivation: "-0.3（临时降低，但后期可能反弹）",
  /** 玩家累计死亡次数 */
  deathAccumulation: "+0.03/次死亡",
  /** 空间裂隙扩大 */
  riftExpansion: "+0.08/次异常事件",
  /** 自然衰减 */
  naturalDecay: "-0.05/天（仅当无新应激因素时）",
} as const;

// ── 龙月（Dragon Moon）──

/**
 * 龙月——拓扑应力接近 0.7 时，外部世界（如果从公寓内向窗外看）
 * 会看到一个巨大球体悬浮在建筑上方——不是天体，是龙蜷缩起来的形态。
 * 当月相呈现「满月」时意味着拓扑应力最高。
 */
export const DRAGON_MOON = {
  /** 龙月可见条件 */
  visibleCondition: "拓扑应力 ≥ 0.5 且处于夜间时段（14h 夜间）",
  /** 月相与应力对照 */
  moonPhaseMapping: [
    { phase: "新月", stressRange: [0.5, 0.6] as readonly [number, number], description: "淡红色薄雾状，几乎不可辨" },
    { phase: "峨眉月", stressRange: [0.6, 0.7] as readonly [number, number], description: "可见弧形轮廓，带有微弱脉动" },
    { phase: "弦月", stressRange: [0.7, 0.8] as readonly [number, number], description: "清晰半圆，表面可见鳞片纹理" },
    { phase: "盈凸月", stressRange: [0.8, 0.9] as readonly [number, number], description: "巨大明亮球体，瞳孔般的斑点持续聚焦和散焦" },
    { phase: "满月", stressRange: [0.9, 1.0] as readonly [number, number], description: "整个天空被占据，龙形完全显化——所有住户无法入睡" },
  ] as const,
  /** 龙月的位置感描述 */
  positionDescription: "从每层楼道窗户看出去龙月都在正中央——无论你从哪个窗户看。这是空间折叠的证据。",
} as const;

// ── 关键道具与龙相关 ──

/** 与龙相关的特殊道具 */
export const DRAGON_RELATED_ITEMS = [
  {
    name: "龙鳞碎片",
    description: "拓扑应力外溢凝结的六边形半透明薄片，在黑暗中有微光。可用于锚修复或理解为龙的语言碎片。",
  },
  {
    name: "龙息粉末",
    description: "龙在拓扑应力峰值时呼出的能量残余物。撒在门前可暂时阻断公寓的空间感知。",
  },
  {
    name: "瞳孔石",
    description: "形似月球的黑色圆石，表面有一道裂缝。在龙月满月时裂缝中会渗出暗蓝色光芒。据灵伤说这是「龙的梦」。",
  },
] as const;

/** 构建 DM 可读的龙学上下文块 */
export function buildDragonBlock(): string {
  const lines: string[] = [
    "【龙的本质】空间拓扑应力可视化产物；非生物，是现象。",
    `【楚博士定义】${DRAGON_NATURE.chuDesignation}`,
    `【视觉变异】不同认知层次的人看到完全不同的「龙」——普通人为黑影；锚位持有人看到鳞片；灵伤看到几何光纹；楚博士看到拓扑公式。`,
    `【拓扑阈值】基线 ${TOPOLOGICAL_THRESHOLDS.baseline} / 可见 ${TOPOLOGICAL_THRESHOLDS.visibleThreshold} / 显化 ${TOPOLOGICAL_THRESHOLDS.manifestationThreshold} / 崩溃 ${TOPOLOGICAL_THRESHOLDS.collapseThreshold}`,
    `【龙月】拓扑应力 ≥0.5 且为夜间时可见；月相反映应力等级；满月 = 应力 ≥0.9`,
  ];
  return lines.join("\n");
}
