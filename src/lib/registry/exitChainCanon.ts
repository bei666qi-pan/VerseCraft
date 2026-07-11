/**
 * Exit Chain Canon — 退出链：逃离如月公寓的完整路径定义
 *
 * 退出不是击败某个敌人或找到某扇门——它是一条由六个阶段构成的仪式链。
 * 每个阶段都有前置条件、参与者要求和失败后果。
 * DM 编排时需要参照本文件确保退出路径的一致性和权重。
 */

import type { FloorId } from "./types";

// ── 退出链阶段 ──

/** 退出链的六个阶段 */
export interface ExitStage {
  /** 阶段编号 1-6 */
  stage: number;
  /** 阶段名称 */
  title: string;
  /** 阶段描述 */
  description: string;
  /** 触发条件 */
  triggerCondition: string;
  /** 必要条件 */
  requirements: string[];
  /** 失败后果 */
  failureConsequence: string;
  /** 必须在修正窗口期内执行 */
  requiresCorrectionWindow: boolean;
  /** 主要发生楼层 */
  location: FloorId | string;
}

export const EXIT_STAGES: readonly ExitStage[] = [
  {
    stage: 1,
    title: "确认（Confirmation）",
    description: "玩家必须确认自己并非原主——即明确认知自己是外来回声体而非某住户的延续。这是退出链的认知起点。",
    triggerCondition: "玩家在主锚共鸣点（B1锚室）获得一次完整记忆回放",
    requirements: [
      "累计至少 3 次死亡/重建经历",
      "与至少 3 名锚位 NPC 建立深层共鸣",
      "认知到自己记忆中的家乡是外部世界的真实地点",
    ],
    failureConsequence: "退回循环，下次共鸣窗口至少需等待 2 个完整周期（20天）",
    requiresCorrectionWindow: false,
    location: "B1_AnchorRoom",
  },
  {
    stage: 2,
    title: "碎裂（Shatter）",
    description: "玩家必须主动崩解至少一层回声体壳——即自愿放弃一部分虚假记忆，承受一次高强度的认知撕裂。",
    triggerCondition: "找到自己的『初始物品』并同意将其销毁（该物品为玩家进入公寓时的随身物）",
    requirements: [
      "持有自己的初始物品",
      "理智值≥40%（否则碎裂过程可能导致永久精神损伤）",
      "在场至少一位锚位 NPC 见证",
    ],
    failureConsequence: "记忆碎片被公寓回收，玩家永久丢失一条关键记忆且无法恢复",
    requiresCorrectionWindow: false,
    location: "5F_Studio503",
  },
  {
    stage: 3,
    title: "结伴（Companion）",
    description: "玩家不能独自离开——必须至少携带一位住户（NPC）一起逃脱。这是公寓消化系统的刚性规则：它以 '人口' 为基数计算消化平衡。",
    triggerCondition: "说服至少一位符合条件的 NPC 同行",
    requirements: [
      "目标 NPC 必须满足 companionEligible = true",
      "与目标 NPC 的关系值 ≥ 7（满分 10）",
      "目标 NPC 自身必须有明确的「外部牵挂」（家人/未完成的事）",
    ],
    failureConsequence: "退出链永久锁死——系统判定退出者数量不足，该玩家再也无法触发退出链",
    requiresCorrectionWindow: false,
    location: "any",
  },
  {
    stage: 4,
    title: "锚序重排（Anchor Rearrangement）",
    description: "六枚辅锚必须在灵伤引导下按特定顺序重新排列——6→4→2→7→1→3→5。这个数字序列是灵伤（Lingshang）在长期与公寓地下室信息共鸣中破译出来的。",
    triggerCondition: "灵伤存活且愿意协助",
    requirements: [
      "灵伤必须处于清醒状态且未被公寓同化",
      "集齐 20g 源质用于激活锚序仪式",
      "退出链前三阶段全部完成",
      "锚序必须严格按 6-4-2-7-1-3-5 排列",
    ],
    failureConsequence: "源质消耗，锚序不完全重置；下一次尝试至少等待 3 个周期。错误顺序会导致 A-008 提前激活",
    requiresCorrectionWindow: true,
    location: "B2",
  },
  {
    stage: 5,
    title: "穿越（Crossing）",
    description: "通过 B2 的木门——四位一体条件：正确的钥匙、通关权柄（灵伤授权）、源质消耗、守门人（A-008）认可。守门人只接受持有「真实面孔」的实体通过，即已经过碎裂阶段（失去虚假壳）的人。",
    triggerCondition: "锚序重排完成后的 24h 内抵达 B2 木门前",
    requirements: [
      "持有 B2 木门钥匙（碎片·钥匙，需集齐三个碎片）",
      "持有灵伤的通行授权（记忆印记）",
      "持有 ≥ 3g 源质（过门消耗）",
      "已通过碎裂阶段（锚序重排自动验证本条）",
    ],
    failureConsequence: "A-008 封印通行资格，玩家被弹回 B1 并被扣除 1-3 点理智。木门再次锁上且规则不可破坏",
    requiresCorrectionWindow: true,
    location: "B2",
  },
  {
    stage: 6,
    title: "对话与通路（Dialogue & Passage）",
    description: "最终阶段。穿越木门后，玩家和同行 NPC 将面对公寓消化意识的核心残留——楚博士的人格碎片。需要通过对话判断：是压制公寓意识以逃脱、协商换取逃脱条件、还是选择进入新的共存状态。",
    triggerCondition: "成功穿越 B2 木门",
    requirements: [
      "所有前五阶段完成",
      "同行 NPC 存活且理智正常",
      "玩家理智值 ≥ 20%（否则无法完成有效对话）",
    ],
    failureConsequence: "根据不同的选择和对话判定产生不同结局",
    requiresCorrectionWindow: true,
    location: "B2_Deep",
  },
] as const;

// ── 陪伴者资格 ──

/** NPC 退出陪伴资格表 */
export interface CompanionEligibilityEntry {
  npcId: string;
  name: string;
  eligible: boolean;
  reason: string;
  /** 关系值门槛 */
  relationshipThreshold: number;
}

export const COMPANION_ELIGIBILITY: readonly CompanionEligibilityEntry[] = [
  // ── 六辅锚（外部记忆锚点最强，退出链天然结伴对象）──
  { npcId: "N-007", name: "叶",     eligible: true,  reason: "最高记忆保留（85%），军校同窗与外部身份清晰；画室是其锚定工作面", relationshipThreshold: 8 },
  { npcId: "N-013", name: "枫",     eligible: true,  reason: "高记忆保留（75%），音乐家记忆与外部身份尚存；但 7F 诱导相位会制造反复", relationshipThreshold: 8 },
  { npcId: "N-015", name: "麟泽",   eligible: true,  reason: "中高保留（70%），边界巡守的秩序感是其对外记忆的骨架", relationshipThreshold: 7 },
  { npcId: "N-010", name: "欣蓝",   eligible: true,  reason: "中保留（65%），登记权柄与科层记忆指向外部行政身份", relationshipThreshold: 8 },
  { npcId: "N-018", name: "北夏",   eligible: true,  reason: "低保留（50%）但交换链上的外部债务清晰；需强力说服", relationshipThreshold: 8 },
  { npcId: "N-020", name: "灵伤",   eligible: false, reason: "最低保留（45%），认知已被公寓部分同化，强行带离会导致存在崩溃；且需留位引导锚序重排", relationshipThreshold: 10 },
  // ── 非辅锚住户 ──
  { npcId: "N-019", name: "前调查员", eligible: true,  reason: "外来身份（80 年代研究机构），外部有未交付的调查报告；但多疑，需极高信任", relationshipThreshold: 9 },
  { npcId: "N-016", name: "章嫂",   eligible: true,  reason: "月初误入的外卖骑手，口袋里有过期接单截图这一外部日期证据；但镜像污染使其濒临同化", relationshipThreshold: 9 },
  { npcId: "N-001", name: "陈婆婆", eligible: false, reason: "最早住户之一，已无外部牵挂，被公寓深度绑定；织完即遗忘", relationshipThreshold: 10 },
  { npcId: "N-009", name: "阿织",   eligible: false, reason: "镜像层产物，离开公寓反光面即消散（与 N-021 阿绣同理）", relationshipThreshold: 10 },
  { npcId: "N-012", name: "陶师傅", eligible: false, reason: "主动留下——厨房是其赎罪与修行场，妻子被管道屠夫拖走", relationshipThreshold: 10 },
  { npcId: "N-011", name: "夜读老人", eligible: false, reason: "公寓真正管理者，与消化账簿契约绑定，不可离位", relationshipThreshold: 10 },
];

// ── 结局定义 ──

/** 六种结局 */
export interface EndingDefinition {
  id: string;
  title: string;
  type: "escape" | "death" | "takeover" | "cycle" | "co_escape" | "vanished";
  description: string;
  triggerCondition: string;
  isTrueEnding: boolean;
  isHiddenEnding: boolean;
}

export const ENDINGS: readonly EndingDefinition[] = [
  {
    id: "ENDING_A",
    title: "逃脱·代价",
    type: "escape",
    description: "玩家独自逃离公寓，但同行 NPC 在最后关头被公寓拖回。玩家带着愧疚和未尽之事重返外部世界，但记忆中的公寓经历将逐渐模糊。",
    triggerCondition: "退出链 1-5 成功完成；阶段 6 未说服公寓释放 NPC",
    isTrueEnding: false,
    isHiddenEnding: false,
  },
  {
    id: "ENDING_B",
    title: "消化·永眠",
    type: "death",
    description: "玩家在退出链任一阶段失败且未能承受后果——意识被公寓彻底吸收，成为第 239 个回声。回声将永远在公寓中重复最后 24 小时的循环。",
    triggerCondition: "退出链关键阶段失败且理智归零 / 累计死亡次数 ≥ 10",
    isTrueEnding: false,
    isHiddenEnding: false,
  },
  {
    id: "ENDING_C",
    title: "接管·新主（隐藏结局）",
    type: "takeover",
    description: "玩家不是逃离公寓，而是取代楚博士成为公寓消化意识的新核心。玩家维持在 B2 裂隙深处，支配着公寓运行。这要求玩家在退出链末期选择「压制公寓意识」且获得楚博士碎片认可。",
    triggerCondition: "完成阶段 1-5；阶段 6 选择压制并获得楚博士碎片认可",
    isTrueEnding: false,
    isHiddenEnding: true,
  },
  {
    id: "ENDING_D",
    title: "循环·永续（开放结局）",
    type: "cycle",
    description: "玩家主动放弃退出，选择留在公寓中继续循环。锚系统稳定化，公寓进入一个新的平衡态——不再消化新住户，但已困者无法离开。玩家成为第七辅锚的永久持有者。",
    triggerCondition: "玩家主动选择不完成退出链，且锚系统稳定度 ≥ 70%",
    isTrueEnding: false,
    isHiddenEnding: false,
  },
  {
    id: "ENDING_E",
    title: "共脱·黎明（真结局）",
    type: "co_escape",
    description: "玩家与同行 NPC 全部成功逃离，且公寓消化系统因退出链触发而崩溃。238 名被困者的回声获得释放。公寓变为普通废弃建筑。这是唯一完美结局。",
    triggerCondition: "全部 6 阶段完美完成；阶段 6 协商成功；同行 NPC 全部生还",
    isTrueEnding: true,
    isHiddenEnding: false,
  },
  {
    id: "ENDING_F",
    title: "消逝·谜",
    type: "vanished",
    description: "玩家通过 B2 木门后没有进入裂隙深处——而是直接消失。没有回声残留、没有被消化痕迹、没有任何关于玩家曾在公寓存在的证据。是解脱还是其他？无人知晓。",
    triggerCondition: "极其罕见条件组合（隐藏触发），包括但不限于特定道具与特定对话序列",
    isTrueEnding: false,
    isHiddenEnding: true,
  },
] as const;

// ── 关键数字序列 ──

/** 灵伤密码——辅锚重排的正确顺序 */
export const LINGSHANG_NUMBER_SEQUENCE = ["6", "4", "2", "7", "1", "3", "5"] as const;

/** B2 木门不可破坏的规则原因 */
export const B2_DOOR_INDESTRUCTIBLE_REASON =
  "B2 木门在 1975 年耶里学校改建时被安装了跨空间框架结构。" +
  "门本身只是表象——它的 '不可破坏' 源于门框与公寓消化核心的直接绑定。" +
  "暴力破坏门等于撕毁公寓自身的代谢出口，触发消化系统的免疫级响应。" +
  "唯一的通过方式：钥匙 + 授权 + 消耗 + 守门人认可。";

/** 构建 DM 可读的退出链上下文块 */
export function buildExitChainBlock(): string {
  const stagesDesc = EXIT_STAGES.map(
    (s) => `阶段${s.stage}·${s.title}：${s.description}`
  ).join("\n");

  const companions = COMPANION_ELIGIBILITY.filter((c) => c.eligible)
    .map((c) => `${c.name}（${c.npcId}，关系 ≥ ${c.relationshipThreshold}）`)
    .join("、");

  return (
    `【退出链 6 阶段】\n${stagesDesc}\n\n` +
    `【灵伤锚序】${LINGSHANG_NUMBER_SEQUENCE.join(" → ")}\n\n` +
    `【可结伴 NPC】${companions}\n\n` +
    `【B2 规则】${B2_DOOR_INDESTRUCTIBLE_REASON}`
  );
}
