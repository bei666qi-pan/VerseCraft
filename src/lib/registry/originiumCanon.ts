/**
 * Originium Canon — 源质的物理性质、产出、使用与交易规则
 *
 * 源质（Originium）是公寓消化系统中残余空间权柄碎片沉淀形成的结晶体。
 * 它即是货币、也是媒介、更是锚系统运转的润滑剂。
 * DM 编排时严格参照本文件的量化规则。
 */

// ── 物理性质 ──

/** 源质的物理和光学特征 */
export const ORIGINIUM_PHYSICS = {
  /** 外观 */
  appearance: "深灰色半透明晶体，内部可见缓慢流动的暗蓝色微光丝线",
  /** 手感 */
  texture: "表面光滑冰冷，重量约为等体积铁的1.3倍",
  /** 室温下稳定性 */
  stability: "常温下稳定，置于B2裂隙附近会发出微弱嗡鸣",
  /** 与红色自来水反应 */
  waterReaction: "接触红色自来水后表面产生气泡，晶体缩小约5%/分钟",
  /** 与活体组织接触风险 */
  tissueRisk: "直接植入活体会导致空间排斥——表现为局部区域随机瞬移感，持续数秒",
} as const;

// ── 产出 ──

/** 源质日产量参数 */
export const ORIGINIUM_PRODUCTION = {
  /** 日产量范围（克） */
  dailyRange: [3, 5] as readonly [number, number],
  /** 产出来源 */
  sources: [
    "记忆气泡破裂后的残留沉淀",
    "住户梦境空间中的自然结晶",
    "消化后排出的空间代谢物",
    "B2裂隙口附近的地面结晶采摘",
  ] as readonly string[],
  /** 锚位持有人额外产出倍率 */
  anchorBonusMultiplier: 1.5,
} as const;

// ── 用途 ──

/** 源质的消耗性用途类型 */
export type OriginiumUseType =
  | "anchor_repair"       // 锚位修复
  | "medical"             // 医疗支付
  | "trade"               // 住户间交易
  | "B2_passage"          // B2 通行权
  | "memory_retrieval"    // 记忆提取
  | "item_enhancement"    // 物品强化
  | "shelter_rent"        // 庇护所租金
  | "exit_chain";         // 退出链激活

/** 各用途参考消耗量（克） */
export const ORIGINIUM_USE_COSTS: Record<OriginiumUseType, number> = {
  anchor_repair: 8,
  medical: 5,
  trade: 2,
  B2_passage: 3,
  memory_retrieval: 6,
  item_enhancement: 4,
  shelter_rent: 2,
  exit_chain: 20,
} as const;

// ── 交易规则 ──

/** 北夏（Beixia）交易站的源质交易规则 */
export const ORIGINIUM_EXCHANGE_RULES = {
  /** 交易手续费率 */
  feeRate: 0.1,
  /** 最大信用额度（克） */
  maxCredit: 10,
  /** 信用账期（天） */
  creditPeriodDays: 30,
  /** 可兑换物品种类数 */
  exchangeableItemTypes: 6,
  /** 汇率——1 克源质价值描述 */
  purchasingPowerDescription: "1克源质 ≈ 一顿简餐 + 基本医疗纱布 / 3克 ≈ 一次专业诊疗 / 5克 ≈ B2通行许可一次",
} as const;

// ── 存量估算 ──

/** 公寓内已知源质总储量估算 */
export const ORIGINIUM_TOTAL_ESTIMATE = {
  /** 所有住户手中累计（克） */
  residentsHolding: 180,
  /** B1 交易站库存（克） */
  b1ExchangeStock: 45,
  /** B2 裂隙附近可采未采（克） */
  b2Unharvested: 30,
  /** 已绑定到锚系统不可动用（克） */
  anchorBound: 120,
  /** 总量 */
  total: 375,
} as const;

/** 构建 DM 可读的源质上下文块 */
export function buildOriginiumBlock(): string {
  const lines: string[] = [
    "【源质】空间权柄碎片晶体，深灰色半透明，内含暗蓝微光丝线",
    `【产出】每日 ${ORIGINIUM_PRODUCTION.dailyRange[0]}-${ORIGINIUM_PRODUCTION.dailyRange[1]} 克，锚位持有人 ×1.5`,
    `【用途】锚修复8g、医疗5g、B2通行3g、记忆提取6g、退出链激活20g`,
    `【交易】北夏经手，${ORIGINIUM_EXCHANGE_RULES.feeRate * 100}%手续费，最多赊 ${ORIGINIUM_EXCHANGE_RULES.maxCredit}g/30天`,
    `【总量】公寓内约 ${ORIGINIUM_TOTAL_ESTIMATE.total}g（含锚系统绑定 ${ORIGINIUM_TOTAL_ESTIMATE.anchorBound}g）`,
  ];
  return lines.join("\n");
}
