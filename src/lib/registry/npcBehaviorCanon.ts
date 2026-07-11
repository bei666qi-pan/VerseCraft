/**
 * NPC Behavior Canon — 如月公寓所有 NPC 的行为现实主义层
 *
 * 本文件在 socialProfile.scheduleBehavior 文本之上补充四个结构化维度，
 * 使 DM 可查询「某时刻 NPC 在哪」「当前情绪状态」「什么触发 NPC 间互动」
 * 以及「NPC 对玩家常见行为的典型反应」。
 *
 * DM 编排时参照本文件确保 NPC 行为的一致性和可信度。
 * 不替代 socialProfile.scheduleBehavior 文本，而是提供可编程的行为数据。
 *
 * 一天时间框架：日间 06:00-16:00（10h）/ 夜间 16:00-06:00（14h）
 * 周期相位：平静期/校准期/前兆期/修正窗口（见 cyclePhaseCanon.ts）
 */

import type { NpcSocialProfile } from "./types";
import type { CyclePhase } from "./cyclePhaseCanon";
import { NPC_SOCIAL_GRAPH } from "./world";

// ──────────────────────────────────────
// Section 1: Daily Schedule Types
// ──────────────────────────────────────

/** NPC 的一个时间段块 */
export interface NpcTimeBlock {
  /** 开始小时（0-24） */
  startHour: number;
  /** 结束小时（0-24，排他） */
  endHour: number;
  /** 所在位置节点 ID */
  location: string;
  /** 主要活动描述 */
  activity: string;
}

/** NPC 的完整日间日程 */
export interface NpcDailySchedule {
  npcId: string;
  /** 默认日程——平静期基线 */
  defaultSchedule: readonly NpcTimeBlock[];
  /** 非平静期的日程调整（整体替换） */
  phaseOverride?: Partial<Record<Exclude<CyclePhase, "QUIESCENCE">, readonly NpcTimeBlock[]>>;
  /** 特殊行为注释 */
  notes?: string;
}

// ──────────────────────────────────────
// Section 2: Mood State Machine Types
// ──────────────────────────────────────

export type NpcMoodState =
  | "calm"
  | "anxious"
  | "suspicious"
  | "hostile"
  | "grief"
  | "hopeful"
  | "exhausted"
  | "manic"
  | "paranoid"
  | "guarded"
  | "fearful"
  | "content";

/** 情绪转换规则 */
export interface MoodTransition {
  triggers: string[];
  from: readonly NpcMoodState[];
  to: NpcMoodState;
}

export interface NpcMoodProfile {
  /** 默认情绪状态 */
  defaultMood: NpcMoodState;
  /** 焦虑基线——0（完全平静）到 10（随时崩溃） */
  baselineAnxiety: number;
  /** 情绪转换规则 */
  transitions: readonly MoodTransition[];
  /** 无触发时回归默认的速度 */
  driftSpeed: "slow" | "medium" | "fast";
  /** 周期相位对情绪的加成影响 */
  phaseModifier?: Partial<Record<CyclePhase, number>>;
}

// ──────────────────────────────────────
// Section 3: Interaction Trigger Types
// ──────────────────────────────────────

export interface NpcInteractionTrigger {
  /** 发起方 NPC ID */
  initiator: string;
  /** 目标 NPC ID */
  target: string;
  /** 触发条件描述 */
  triggerEvent: string;
  /** 交互类型 */
  interactionType: "routine" | "conflict" | "cooperation" | "surveillance" | "trade" | "caretaking";
  /** 交互后冷却（回合数） */
  cooldownTurns: number;
  /** 仅在特定周期相位发生 */
  cyclePhaseRequired?: readonly CyclePhase[];
}

// ──────────────────────────────────────
// Section 4: Player Response Preset Types
// ──────────────────────────────────────

export interface PlayerResponsePreset {
  npcId: string;
  /** 玩家主动帮助时的反应模板 */
  onHelp: string;
  /** 玩家威胁时的反应模板 */
  onThreat: string;
  /** 玩家无视时的反应模板 */
  onIgnore: string;
  /** 玩家调查/追问时的反应模板 */
  onInvestigate: string;
  /** 玩家赠送物品时的反应模板 */
  onGift: string;
  /** 玩家欺骗时的反应模板 */
  onDeceive: string;
  /** 首次见面的反应模板 */
  onFirstMeeting: string;
  /** 信任度变化的参考影响 */
  trustImpact: {
    help: number;
    threat: number;
    gift: number;
    deceive: number;
  };
}

// ──────────────────────────────────────
// Section 5: NPC Daily Schedules
// ──────────────────────────────────────

/**
 * 所有 NPC 的日间日程。
 * hour 为 0-24，跨午夜的时间块用跨越式表示（如 22-26 表示 22:00-02:00）。
 */
export const NPC_DAILY_SCHEDULES: Record<string, NpcDailySchedule> = {
  // ── N-001 陈婆婆 ──
  "N-001": {
    npcId: "N-001",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "B1_SafeZone", activity: "晨起慢行至地下一层取干净水" },
      { startHour: 8, endHour: 12, location: "1F_Lobby", activity: "坐门厅长椅织毛衣，观察进出者" },
      { startHour: 12, endHour: 13, location: "1F_Lobby", activity: "小憩，毛线不离手" },
      { startHour: 13, endHour: 18, location: "1F_Lobby", activity: "继续织毛衣，偶尔与路过住户寒暄" },
      { startHour: 18, endHour: 20, location: "1F_Lobby", activity: "收拾毛线，闭目养神" },
      { startHour: 20, endHour: 22, location: "1F_Lobby", activity: "夜晚值门，警惕性提高" },
      { startHour: 22, endHour: 0, location: "3F_Stairwell", activity: "上楼看阿花是否安全入睡" },
      { startHour: 0, endHour: 2, location: "1F_Lobby", activity: "浅睡值班，织到睡着" },
      { startHour: 2, endHour: 6, location: "1F_Lobby", activity: "深度休息，毛线仍在手中" },
    ],
    notes: "和谐期规律最稳定；修正窗口期可能整夜不睡守在阿花附近",
  },

  // ── N-002 林医生 ──
  "N-002": {
    npcId: "N-002",
    defaultSchedule: [
      { startHour: 6, endHour: 7, location: "2F_Clinic201", activity: "整理病历，配制安神剂" },
      { startHour: 7, endHour: 12, location: "2F_Clinic201", activity: "坐诊，接诊住户" },
      { startHour: 12, endHour: 13, location: "2F_Clinic201", activity: "独自用餐，翻阅病历" },
      { startHour: 13, endHour: 17, location: "2F_Clinic201", activity: "继续坐诊" },
      { startHour: 17, endHour: 18, location: "2F_Clinic201", activity: "记录当日采集的数据" },
      { startHour: 18, endHour: 20, location: "4F_CorridorEnd", activity: "探视周伯，例行检查" },
      { startHour: 20, endHour: 22, location: "2F_Clinic201", activity: "深夜值班，整理笔记" },
      { startHour: 22, endHour: 6, location: "2F_Clinic201", activity: "在诊室躺椅上睡觉" },
    ],
    notes: "周期校准期后可能半夜出诊去 B1；修正窗口期整夜整理病历",
  },

  // ── N-003 邮差老王 ──
  "N-003": {
    npcId: "N-003",
    defaultSchedule: [
      { startHour: 5, endHour: 7, location: "1F_Mailboxes", activity: "整理邮包，分拣信件" },
      { startHour: 7, endHour: 10, location: "2F", activity: "送信至二楼各户" },
      { startHour: 10, endHour: 12, location: "3F_4F", activity: "送信至三至四楼" },
      { startHour: 12, endHour: 13, location: "1F_Mailboxes", activity: "短暂休息" },
      { startHour: 13, endHour: 15, location: "5F_6F", activity: "送信至五至六楼" },
      { startHour: 15, endHour: 17, location: "7F", activity: "送信至七楼" },
      { startHour: 17, endHour: 19, location: "1F_Mailboxes", activity: "整理回信和死信" },
      { startHour: 19, endHour: 21, location: "4F_Room401", activity: "给张先生送当日报纸" },
      { startHour: 21, endHour: 0, location: "1F_Mailboxes", activity: "分拣凌晨段信件" },
      { startHour: 0, endHour: 5, location: "1F_Mailboxes", activity: "倚信箱入睡" },
    ],
  },

  // ── N-004 阿花 ──
  "N-004": {
    npcId: "N-004",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "3F_Stairwell", activity: "醒来，在楼梯间踢毽子" },
      { startHour: 8, endHour: 12, location: "3F_Hallway", activity: "在各楼层门缝间自娱自乐" },
      { startHour: 12, endHour: 13, location: "1F_Lobby", activity: "去陈婆婆处吃午饭" },
      { startHour: 13, endHour: 17, location: "3F_Stairwell", activity: "继续踢毽子，偶尔与其他住户搭话" },
      { startHour: 17, endHour: 18, location: "1F_Lobby", activity: "去陈婆婆处" },
      { startHour: 18, endHour: 20, location: "3F_Stairwell", activity: "天黑后不再独自到处跑" },
      { startHour: 20, endHour: 22, location: "1F_Lobby", activity: "在陈婆婆腿边待着" },
      { startHour: 22, endHour: 6, location: "3F_Stairwell", activity: "睡在楼梯间角落" },
    ],
    phaseOverride: {
      CORRECTION_WINDOW: [
        { startHour: 6, endHour: 22, location: "1F_Lobby", activity: "全天待在陈婆婆视线内" },
        { startHour: 22, endHour: 6, location: "1F_Lobby", activity: "蜷缩在陈婆婆身边睡" },
      ],
    },
  },

  // ── N-005 周伯 ──
  "N-005": {
    npcId: "N-005",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "4F_CorridorEnd", activity: "摸索起床，倚墙听声" },
      { startHour: 8, endHour: 10, location: "4F_Hallway", activity: "徘徊呼唤大黄" },
      { startHour: 10, endHour: 11, location: "2F_Clinic201", activity: "去林医生处检查" },
      { startHour: 11, endHour: 13, location: "4F_CorridorEnd", activity: "坐地休息，耳听八方" },
      { startHour: 13, endHour: 17, location: "4F_Hallway", activity: "继续徘徊呼唤大黄，手指做弹琴手势" },
      { startHour: 17, endHour: 19, location: "4F_CorridorEnd", activity: "缩在角落，听远处声音辨认" },
      { startHour: 19, endHour: 21, location: "4F_Hallway", activity: "夜间更敏感——靠声纹判断有无犬吠" },
      { startHour: 21, endHour: 6, location: "4F_CorridorEnd", activity: "摸索入睡，偶尔惊醒喊大黄" },
    ],
    notes: "听到疑似犬吠会立即中断当前活动冲向声源——不管是不是陷阱",
  },

  // ── N-006 张先生 ──
  "N-006": {
    npcId: "N-006",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "4F_Room401", activity: "坐在窗边等报纸" },
      { startHour: 8, endHour: 9, location: "4F_Room401", activity: "邮差送报纸，仔细阅读" },
      { startHour: 9, endHour: 12, location: "4F_Room401", activity: "反复阅读同一份报纸" },
      { startHour: 12, endHour: 13, location: "4F_Room401", activity: "小睡" },
      { startHour: 13, endHour: 17, location: "4F_Room401", activity: "坐门口看外面，有时自言自语" },
      { startHour: 17, endHour: 19, location: "4F_Room401", activity: "室内踱步" },
      { startHour: 19, endHour: 21, location: "4F_Room401", activity: "灯下翻看旧报纸" },
      { startHour: 21, endHour: 6, location: "4F_Room401", activity: "锁门不出" },
    ],
    notes: "绝对不回应日期相关问题；校准期开始后锁门时间提前到 19:00",
  },

  // ── N-007 叶（辅锚 6）──
  "N-007": {
    npcId: "N-007",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "5F_Studio503", activity: "画架前的早晨——修改轮廓" },
      { startHour: 8, endHour: 10, location: "5F_Hallway", activity: "在 5 楼走廊短暂踱步" },
      { startHour: 10, endHour: 12, location: "5F_Studio503", activity: "作画，透过窗观察 6F 双胞胎轮廓" },
      { startHour: 12, endHour: 13, location: "B1_SafeZone", activity: "短暂去 B1 取材料" },
      { startHour: 13, endHour: 17, location: "5F_Studio503", activity: "继续作画" },
      { startHour: 17, endHour: 19, location: "5F_Studio503", activity: "放下画笔，检查锚感" },
      { startHour: 19, endHour: 21, location: "6F_Hallway", activity: "借口散步观察 6F 镜像" },
      { startHour: 21, endHour: 23, location: "5F_Studio503", activity: "夜间作画——锚位感知最敏锐" },
      { startHour: 23, endHour: 6, location: "5F_Studio503", activity: "浅睡，画布在旁" },
    ],
    phaseOverride: {
      CORRECTION_WINDOW: [
        { startHour: 6, endHour: 22, location: "B1_SafeZone", activity: "偏离日常——守在辅锚共振位附近" },
        { startHour: 22, endHour: 6, location: "B1_SafeZone", activity: "守锚过夜，不返回画室" },
      ],
    },
  },

  // ── N-008 电工老刘 ──
  "N-008": {
    npcId: "N-008",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "B1_PowerRoom", activity: "检查配电盘，记录异常" },
      { startHour: 8, endHour: 12, location: "2F_4F", activity: "巡修各楼层电闸" },
      { startHour: 12, endHour: 13, location: "B1_PowerRoom", activity: "休息，喂黑猫" },
      { startHour: 13, endHour: 17, location: "1F_3F", activity: "修理报修的灯/线路" },
      { startHour: 17, endHour: 18, location: "B1_Laundry", activity: "找洗衣房阿姨闲聊" },
      { startHour: 18, endHour: 20, location: "B1_PowerRoom", activity: "记录当日发现" },
      { startHour: 20, endHour: 22, location: "B1_Hallway", activity: "带黑猫巡逻地下一层" },
      { startHour: 22, endHour: 6, location: "B1_PowerRoom", activity: "睡觉，黑猫蜷在胸口" },
    ],
    notes: "黑猫永远跟随——在任何日程中均在场",
  },

  // ── N-009 阿织（含 N-021 阿绣）──
  "N-009": {
    npcId: "N-009",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "6F_Room602", activity: "两人相对而坐，有人时同时转头" },
      { startHour: 8, endHour: 10, location: "6F_Hallway", activity: "站在 602 门口手拉手" },
      { startHour: 10, endHour: 12, location: "6F_Room602", activity: "退回房间" },
      { startHour: 12, endHour: 13, location: "6F_Hallway", activity: "门口站立" },
      { startHour: 13, endHour: 17, location: "6F_Room602", activity: "房间内——有时唱歌有时沉默" },
      { startHour: 17, endHour: 19, location: "6F_Hallway", activity: "门口站立——长时间不动" },
      { startHour: 19, endHour: 21, location: "6F_Hallway", activity: "天黑后影子异常——有时是一个有时是两个" },
      { startHour: 21, endHour: 6, location: "6F_Room602", activity: "退回房间，合眼但不一定睡" },
    ],
    notes: "阿织与阿绣（N-009/N-021）永远同时出现——从不单独行动；日程中『两人』指双人一体",
  },

  // ── N-021 阿绣（双胞胎之一，与 N-009 同进度）──
  "N-021": {
    npcId: "N-021",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "6F_Room602", activity: "与阿织对坐" },
      { startHour: 8, endHour: 10, location: "6F_Hallway", activity: "与阿织并肩站门口" },
      { startHour: 10, endHour: 12, location: "6F_Room602", activity: "回房间" },
      { startHour: 12, endHour: 13, location: "6F_Hallway", activity: "门口站立" },
      { startHour: 13, endHour: 17, location: "6F_Room602", activity: "房间内" },
      { startHour: 17, endHour: 19, location: "6F_Hallway", activity: "门口站立" },
      { startHour: 19, endHour: 21, location: "6F_Hallway", activity: "天黑后影子异常" },
      { startHour: 21, endHour: 6, location: "6F_Room602", activity: "退回房间" },
    ],
    notes: "阿绣与阿织（N-009）镜像生命；日程完全同步且永远不单独出现；NPC_SOCIAL_GRAPH 中无独立条目",
  },

  // ── N-010 欣蓝（辅锚 3）──
  "N-010": {
    npcId: "N-010",
    defaultSchedule: [
      { startHour: 6, endHour: 7, location: "1F_PropertyOffice", activity: "整理前日登记表" },
      { startHour: 7, endHour: 12, location: "1F_PropertyOffice", activity: "办公——登记进出、记录异动" },
      { startHour: 12, endHour: 13, location: "1F_PropertyOffice", activity: "整理归档，核对名单" },
      { startHour: 13, endHour: 18, location: "1F_PropertyOffice", activity: "继续办公，偶尔巡视一楼大厅" },
      { startHour: 18, endHour: 20, location: "1F_PropertyOffice", activity: "夜间核对——计算楼层消化进度" },
      { startHour: 20, endHour: 22, location: "1F_Hallway", activity: "关门前最后一次巡视" },
      { startHour: 22, endHour: 6, location: "1F_PropertyOffice", activity: "在办公室内休息" },
    ],
    notes: "前兆期后夜间可能不休息而是点灯对着名单计算",
  },

  // ── N-011 夜读老人 ──
  "N-011": {
    npcId: "N-011",
    defaultSchedule: [
      { startHour: 6, endHour: 20, location: "7F_Bench", activity: "极少移动——坐在长椅上翻看消化日志" },
      { startHour: 20, endHour: 22, location: "7F_Hallway", activity: "踱步监视 7 楼走廊动静" },
      { startHour: 22, endHour: 0, location: "7F_Bench", activity: "深夜阅读" },
      { startHour: 0, endHour: 2, location: "7F_Hallway", activity: "暗中监视前调查员房门" },
      { startHour: 2, endHour: 5, location: "7F_Bench", activity: "闭目但未真正入睡" },
      { startHour: 5, endHour: 6, location: "7F_Bench", activity: "黎明前消失——回到 7F 某处不可见位置" },
    ],
    notes: "极少离开 7 楼；行踪在黎明前最不可追踪；消化日志永远在手中",
  },

  // ── N-012 陶师傅 ──
  "N-012": {
    npcId: "N-012",
    defaultSchedule: [
      { startHour: 6, endHour: 12, location: "7F_Kitchen", activity: "处理食材——声音极轻的白日准备" },
      { startHour: 12, endHour: 18, location: "7F_Kitchen", activity: "休息/打盹——保持体力" },
      { startHour: 18, endHour: 20, location: "7F_Kitchen", activity: "醒来活动筋骨" },
      { startHour: 20, endHour: 22, location: "7F_Kitchen", activity: "准备工作" },
      { startHour: 22, endHour: 1, location: "7F_Kitchen", activity: "预热——厨房开始传出前奏声" },
      { startHour: 1, endHour: 3, location: "7F_Kitchen", activity: "全力剁肉——最响的时段" },
      { startHour: 3, endHour: 5, location: "7F_Kitchen", activity: "缓慢收尾——逐渐安静" },
      { startHour: 5, endHour: 6, location: "7F_Kitchen", activity: "放下刀，沉默坐地" },
    ],
    notes: "绝不在剁肉时段被打断；可对话窗口在 18:00-20:00，其他时段极少开口",
  },

  // ── N-013 枫（辅锚 5）──
  "N-013": {
    npcId: "N-013",
    defaultSchedule: [
      { startHour: 6, endHour: 9, location: "7F_Room701", activity: "锁门——话术能量的恢复期" },
      { startHour: 9, endHour: 12, location: "7F_Hallway", activity: "开始在 7 楼走廊缓慢踱步" },
      { startHour: 12, endHour: 13, location: "7F_Room701", activity: "午餐时间（沉默进食）" },
      { startHour: 13, endHour: 17, location: "7F_Hallway", activity: "与来往住户攀谈——诱导话术最活跃" },
      { startHour: 17, endHour: 19, location: "7F_Room701", activity: "恢复期" },
      { startHour: 19, endHour: 21, location: "7F_Hallway", activity: "夜间话术——与电梯动线保持距离" },
      { startHour: 21, endHour: 23, location: "7F_Room701", activity: "夜间诱导——听力线索最清晰" },
      { startHour: 23, endHour: 6, location: "7F_Room701", activity: "睡眠（门外无声）" },
    ],
    notes: "话术活跃度与周期相位正相关；修正窗口期可能全天候守在电梯间附近",
  },

  // ── N-014 洗衣房阿姨 ──
  "N-014": {
    npcId: "N-014",
    defaultSchedule: [
      { startHour: 6, endHour: 7, location: "B1_Laundry", activity: "开工——检查洗衣设备" },
      { startHour: 7, endHour: 12, location: "B1_Laundry", activity: "洗衣服——哼 80 年代摇篮曲" },
      { startHour: 12, endHour: 13, location: "B1_Laundry", activity: "吃午饭" },
      { startHour: 13, endHour: 17, location: "B1_Laundry", activity: "继续洗衣" },
      { startHour: 17, endHour: 18, location: "B1_PowerRoom", activity: "去配电间找老刘聊天" },
      { startHour: 18, endHour: 21, location: "B1_Laundry", activity: "晚间洗衣——粘血衣件单独处理" },
      { startHour: 21, endHour: 22, location: "B1_Laundry", activity: "检查洗衣房安全" },
      { startHour: 22, endHour: 6, location: "B1_Laundry", activity: "在洗衣房内睡觉" },
    ],
  },

  // ── N-015 麟泽（辅锚 1）──
  "N-015": {
    npcId: "N-015",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "B1_SafeZone", activity: "边界巡守——检查 B1 封线完整性" },
      { startHour: 8, endHour: 12, location: "B1_Hallway", activity: "在 B1 与电梯动线之间巡视" },
      { startHour: 12, endHour: 13, location: "B1_SafeZone", activity: "短暂停顿——补充能量" },
      { startHour: 13, endHour: 18, location: "B1_Stairwell", activity: "巡守——偶与洗衣房阿姨擦肩" },
      { startHour: 18, endHour: 20, location: "B1_SafeZone", activity: "回顾当日边界日志" },
      { startHour: 20, endHour: 22, location: "B1_Hallway", activity: "夜间巡守——视野受限但感知增强" },
      { startHour: 22, endHour: 2, location: "B1_SafeZone", activity: "守锚点——锚位感知时段" },
      { startHour: 2, endHour: 6, location: "B1_SafeZone", activity: "浅睡——警觉状态" },
    ],
    phaseOverride: {
      CORRECTION_WINDOW: [
        { startHour: 6, endHour: 22, location: "B1_Stairwell", activity: "全天候边界封控" },
        { startHour: 22, endHour: 6, location: "B1_SafeZone", activity: "不睡——守锚至天明" },
      ],
    },
  },

  // ── N-016 章嫂 ──
  "N-016": {
    npcId: "N-016",
    defaultSchedule: [
      { startHour: 6, endHour: 8, location: "6F_Stairwell", activity: "终于有点困意但睡不着" },
      { startHour: 8, endHour: 12, location: "6F_Hallway", activity: "不安地踱步" },
      { startHour: 12, endHour: 13, location: "6F_Stairwell", activity: "试图入睡失败" },
      { startHour: 13, endHour: 18, location: "6F_Hallway", activity: "徘徊看门牌——把错层看成 10F" },
      { startHour: 18, endHour: 20, location: "6F_Stairwell", activity: "感到建筑吞声——更紧张" },
      { startHour: 20, endHour: 23, location: "6F_Stairwell", activity: "整夜徘徊——最活跃时段" },
      { startHour: 23, endHour: 2, location: "6F_Stairwell", activity: "继续徘徊——逐渐疲惫但不可停" },
      { startHour: 2, endHour: 4, location: "6F_Stairwell", activity: "累极靠墙——短暂闭眼" },
      { startHour: 4, endHour: 6, location: "6F_Hallway", activity: "黎明前的不安发作——再次开始走" },
    ],
    notes: "不受 10h/14h 昼夜节律影响——永远醒着；唯一能躺下的前提是有人陪她保持清醒",
  },

  // ── N-017 红姨 ──
  "N-017": {
    npcId: "N-017",
    defaultSchedule: [
      { startHour: 6, endHour: 12, location: "1F_Lobby", activity: "休息——茶车停在脚边" },
      { startHour: 12, endHour: 13, location: "B1_Hallway", activity: "补充茶壶原料（管道沉淀物）" },
      { startHour: 13, endHour: 16, location: "1F_Lobby", activity: "推茶车慢行——一楼区域" },
      { startHour: 16, endHour: 18, location: "1F_Lobby", activity: "等候时段——沉默看门" },
      { startHour: 18, endHour: 20, location: "B1_Hallway", activity: "开始向 B1 送" },
      { startHour: 20, endHour: 23, location: "2F_4F", activity: "巡游各楼层——茶车声响" },
      { startHour: 23, endHour: 2, location: "5F_7F", activity: "夜里高层送茶" },
      { startHour: 2, endHour: 6, location: "1F_Lobby", activity: "回到一楼休息" },
    ],
    notes: "不主动与人对视；递茶时手会抖但表情不变",
  },

  // ── N-018 北夏（辅锚 4）──
  "N-018": {
    npcId: "N-018",
    defaultSchedule: [
      { startHour: 6, endHour: 7, location: "1F_GuardRoom", activity: "盘货——清点可交换物品" },
      { startHour: 7, endHour: 10, location: "1F_Hallway", activity: "经营摊位——早市交易" },
      { startHour: 10, endHour: 12, location: "1F_GuardRoom", activity: "记账" },
      { startHour: 12, endHour: 13, location: "B1_Hallway", activity: "去 B1 收货/送货" },
      { startHour: 13, endHour: 17, location: "1F_Hallway", activity: "午市交易" },
      { startHour: 17, endHour: 18, location: "1F_GuardRoom", activity: "盘点当日流水" },
      { startHour: 18, endHour: 20, location: "1F_Hallway", activity: "晚市折扣" },
      { startHour: 20, endHour: 22, location: "1F_GuardRoom", activity: "核算" },
      { startHour: 22, endHour: 23, location: "1F_Hallway", activity: "深夜偶尔出货——不宜声张的交易" },
      { startHour: 23, endHour: 6, location: "1F_GuardRoom", activity: "休息（货在身旁）" },
    ],
  },

  // ── N-019 前调查员 ──
  "N-019": {
    npcId: "N-019",
    defaultSchedule: [
      { startHour: 6, endHour: 7, location: "7F_Room701", activity: "醒来整理前夜笔记" },
      { startHour: 7, endHour: 9, location: "7F_Hallway", activity: "小心翼翼地在 7 楼搜集线索" },
      { startHour: 9, endHour: 12, location: "5F_6F", activity: "前往中楼层——假装普通住户" },
      { startHour: 12, endHour: 13, location: "B1_Hallway", activity: "在北夏处买情报或补给" },
      { startHour: 13, endHour: 17, location: "3F_4F", activity: "低调调查——记录空间异常细节" },
      { startHour: 17, endHour: 19, location: "7F_Room701", activity: "锁门整理笔记——最专注时段" },
      { startHour: 19, endHour: 21, location: "7F_Hallway", activity: "暗中观察夜读老人动向" },
      { startHour: 21, endHour: 23, location: "1F_Hallway", activity: "夜间出没——搜集夜间异常状" },
      { startHour: 23, endHour: 6, location: "7F_Room701", activity: "反锁房门睡觉（刀在枕下）" },
    ],
    notes: "目标感最强时在 CORRECTION_WINDOW——可能冒险下 B2",
  },

  // ── N-020 灵伤（辅锚 2）──
  "N-020": {
    npcId: "N-020",
    defaultSchedule: [
      { startHour: 6, endHour: 7, location: "B1_Storage", activity: "从储藏室出来" },
      { startHour: 7, endHour: 10, location: "B1_Hallway", activity: "给早起住户分发干净水" },
      { startHour: 10, endHour: 12, location: "B1_SafeZone", activity: "与麟泽交班信息" },
      { startHour: 12, endHour: 13, location: "B1_Laundry", activity: "取洗净的制服" },
      { startHour: 13, endHour: 17, location: "B1_Hallway", activity: "补给分发——笑容持续" },
      { startHour: 17, endHour: 18, location: "B1_Storage", activity: "休整" },
      { startHour: 18, endHour: 20, location: "1F_Lobby", activity: "给陈婆婆送干净水" },
      { startHour: 20, endHour: 22, location: "B1_Storage", activity: "储备更新" },
      { startHour: 22, endHour: 6, location: "B1_Storage", activity: "休息（锚位感知状态）" },
    ],
    notes: "永远面带微笑说话——无论内容是什么；修正窗口期可能整夜清醒",
  },
} as const;

// ──────────────────────────────────────
// Section 6: NPC Mood Profiles
// ──────────────────────────────────────

/**
 * 各 NPC 情绪状态机配置。
 * DM 在不同情绪状态下调整叙事描述和反应概率。
 */
export const NPC_MOOD_PROFILES: Record<string, NpcMoodProfile> = {
  "N-001": {
    defaultMood: "calm",
    baselineAnxiety: 4,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["阿花被威胁", "阿花不在视线", "提起阿花失踪"], from: ["calm", "content", "anxious"], to: "hostile" },
      { triggers: ["夜间红姨靠近", "灵伤笑得太久"], from: ["calm", "content"], to: "guarded" },
      { triggers: ["阿花安全回来", "新住户友善"], from: ["anxious", "guarded", "fearful"], to: "calm" },
      { triggers: ["水变红色", "闻到甜腻"], from: ["calm", "content"], to: "anxious" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-002": {
    defaultMood: "calm",
    baselineAnxiety: 5,
    driftSpeed: "medium",
    transitions: [
      { triggers: ["被质疑医疗事故", "病历被碰"], from: ["calm", "content", "anxious"], to: "hostile" },
      { triggers: ["周伯状态恶化", "认知腐蚀者出现"], from: ["calm", "content"], to: "fearful" },
      { triggers: ["新伤患需要帮助", "发现新数据"], from: ["calm", "guarded"], to: "content" },
      { triggers: ["安神剂减少", "知枫在 7F 诱导"], from: ["calm", "content"], to: "anxious" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 3 },
  },
  "N-003": {
    defaultMood: "calm",
    baselineAnxiety: 3,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["提及退信", "死信被烧", "提到无法投递"], from: ["calm", "content"], to: "manic" },
      { triggers: ["看到火"], from: ["calm", "content", "anxious"], to: "fearful" },
      { triggers: ["顺利完成投递", "收到回信"], from: ["calm", "anxious"], to: "content" },
      { triggers: ["邮包丢失"], from: ["calm", "content"], to: "anxious" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 1 },
  },
  "N-004": {
    defaultMood: "content",
    baselineAnxiety: 3,
    driftSpeed: "medium",
    transitions: [
      { triggers: ["阿织/阿绣靠近", "被邀玩游戏", "黑色毽子被夺"], from: ["content", "calm"], to: "fearful" },
      { triggers: ["陈婆婆不在", "天黑了找不到陈婆婆"], from: ["content", "calm", "fearful"], to: "paranoid" },
      { triggers: ["陈婆婆毛线衣", "陈婆婆在身边"], from: ["fearful", "paranoid", "anxious"], to: "content" },
      { triggers: ["听到认知腐蚀者声音"], from: ["content", "calm"], to: "manic" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 3 },
  },
  "N-005": {
    defaultMood: "anxious",
    baselineAnxiety: 7,
    driftSpeed: "fast",
    transitions: [
      { triggers: ["听到狗叫", "疑似大黄声音"], from: ["anxious", "calm", "grief"], to: "manic" },
      { triggers: ["枫的话术引导", "高层听觉诱饵"], from: ["anxious", "calm"], to: "suspicious" },
      { triggers: ["无头猎犬声", "缝中传来吞咽声"], from: ["anxious", "calm", "suspicious"], to: "fearful" },
      { triggers: ["有人安静陪他", "扶他回角落"], from: ["anxious", "fearful", "manic", "grief"], to: "calm" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 3 },
  },
  "N-006": {
    defaultMood: "calm",
    baselineAnxiety: 6,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["被迫问日期", "门窗异常"], from: ["calm", "content"], to: "paranoid" },
      { triggers: ["报纸停送", "邮差未出现"], from: ["calm", "anxious"], to: "hostile" },
      { triggers: ["老王按时送报"], from: ["anxious", "paranoid"], to: "calm" },
      { triggers: ["入夜异响"], from: ["calm", "content"], to: "anxious" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 3 },
  },
  "N-007": {
    defaultMood: "calm",
    baselineAnxiety: 4,
    driftSpeed: "medium",
    transitions: [
      { triggers: ["画被触碰", "画架意外位移", "双胞胎轮廓消失"], from: ["calm", "content"], to: "guarded" },
      { triggers: ["锚感异常", "公寓消化加速"], from: ["calm", "content", "guarded"], to: "anxious" },
      { triggers: ["发现窗外真相", "龙月出现"], from: ["calm", "anxious"], to: "hopeful" },
      { triggers: ["被枫诱导", "7F 话术入侵"], from: ["calm", "content"], to: "hostile" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-008": {
    defaultMood: "content",
    baselineAnxiety: 3,
    driftSpeed: "fast",
    transitions: [
      { triggers: ["停电", "线路异常", "墙壁内的脉动声"], from: ["content", "calm", "anxious"], to: "hostile" },
      { triggers: ["黑猫异常", "黑猫瞳孔变化异常"], from: ["content", "calm", "hostile"], to: "fearful" },
      { triggers: ["B1 断电", "配电盘误差"], from: ["content", "calm"], to: "anxious" },
      { triggers: ["黑猫蹭腿", "朋友来聊天"], from: ["hostile", "anxious", "fearful"], to: "content" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-009": {
    defaultMood: "content",
    baselineAnxiety: 5,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["被要求在两人间做选择", "分开提议"], from: ["content", "calm"], to: "hostile" },
      { triggers: ["共鸣水晶异常", "倒行者靠近"], from: ["content", "calm"], to: "fearful" },
      { triggers: ["有人能分辨她们"], from: ["content", "calm", "fearful"], to: "hopeful" },
      { triggers: ["被问本体问题"], from: ["content", "calm"], to: "manic" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 3 },
  },
  "N-010": {
    defaultMood: "calm",
    baselineAnxiety: 4,
    driftSpeed: "medium",
    transitions: [
      { triggers: ["名单被篡改", "登记缺口", "循环顶替"], from: ["calm", "content"], to: "paranoid" },
      { triggers: ["消化账簿异常"], from: ["calm", "content", "anxious"], to: "suspicious" },
      { triggers: ["陈婆婆当面质疑"], from: ["calm", "content"], to: "guarded" },
      { triggers: ["新住户存疑"], from: ["calm"], to: "suspicious" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-011": {
    defaultMood: "calm",
    baselineAnxiety: 2,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["消化日志被触碰", "B2封印松动"], from: ["calm", "content"], to: "hostile" },
      { triggers: ["调查员接近真相", "13 楼异动"], from: ["calm", "content"], to: "suspicious" },
      { triggers: ["退出链激活"], from: ["calm", "content"], to: "anxious" },
      { triggers: ["深渊守门人信号"], from: ["calm", "content", "anxious"], to: "fearful" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 0, PRECURSOR: 0, CORRECTION_WINDOW: 1 },
  },
  "N-012": {
    defaultMood: "guarded",
    baselineAnxiety: 5,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["提及妻子", "被问妻子去向"], from: ["guarded", "calm"], to: "grief" },
      { triggers: ["剁肉节奏被干扰", "管道屠夫异动"], from: ["guarded", "calm"], to: "hostile" },
      { triggers: ["同层者信任表态"], from: ["guarded", "hostile"], to: "calm" },
      { triggers: ["前调查员信号"], from: ["guarded", "hostile"], to: "content" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 0, PRECURSOR: 0, CORRECTION_WINDOW: 1 },
  },
  "N-013": {
    defaultMood: "calm",
    baselineAnxiety: 2,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["话术被识破", "当面拆穿"], from: ["calm", "content"], to: "hostile" },
      { triggers: ["诱导成功"], from: ["calm", "content"], to: "content" },
      { triggers: ["目标接近电梯", "7F 动线异常"], from: ["calm", "content"], to: "hopeful" },
      { triggers: ["锚位感知增强"], from: ["calm", "content"], to: "suspicious" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-014": {
    defaultMood: "content",
    baselineAnxiety: 3,
    driftSpeed: "medium",
    transitions: [
      { triggers: ["沾血衣物", "红姨茶车声"], from: ["content", "calm"], to: "fearful" },
      { triggers: ["老刘不在", "B1 异常安静"], from: ["content", "calm"], to: "anxious" },
      { triggers: ["老刘来聊天", "黑猫来蹭"], from: ["fearful", "anxious"], to: "content" },
      { triggers: ["发现红姨接近洗衣房"], from: ["content", "calm"], to: "guarded" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-015": {
    defaultMood: "calm",
    baselineAnxiety: 3,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["主锚在边界冒险", "B1 封线断裂"], from: ["calm", "content"], to: "hostile" },
      { triggers: ["被追问耶里校名", "旧校训被提"], from: ["calm", "content"], to: "paranoid" },
      { triggers: ["退出链信号", "锚共振增强"], from: ["calm", "content", "suspicious"], to: "hopeful" },
      { triggers: ["B2 裂隙扩展"], from: ["calm", "content"], to: "anxious" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-016": {
    defaultMood: "anxious",
    baselineAnxiety: 8,
    driftSpeed: "fast",
    transitions: [
      { triggers: ["听到楼体吞咽声", "错层门牌变化"], from: ["anxious", "calm"], to: "paranoid" },
      { triggers: ["林医生递安眠药", "被迫劝睡"], from: ["anxious", "calm"], to: "hostile" },
      { triggers: ["有人陪他说话", "陪伴保持清醒"], from: ["anxious", "paranoid", "fearful", "hostile"], to: "calm" },
      { triggers: ["阿织/阿绣靠近", "倒行者出现"], from: ["anxious", "calm"], to: "fearful" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 3 },
  },
  "N-017": {
    defaultMood: "calm",
    baselineAnxiety: 3,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["茶壶打翻", "暴露内容物"], from: ["calm", "content"], to: "hostile" },
      { triggers: ["被追问从前身份", "你是谁"], from: ["calm", "content"], to: "manic" },
      { triggers: ["洗衣房阿姨恐慌"], from: ["calm", "content"], to: "content" },
      { triggers: ["管道沉淀不足"], from: ["calm", "content"], to: "anxious" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 1 },
  },
  "N-018": {
    defaultMood: "content",
    baselineAnxiety: 3,
    driftSpeed: "medium",
    transitions: [
      { triggers: ["大客户赊账不还", "摊位失窃"], from: ["content", "calm"], to: "suspicious" },
      { triggers: ["信物断链", "边境界线纠纷"], from: ["content", "calm"], to: "guarded" },
      { triggers: ["大订单成交", "新货通过验货"], from: ["suspicious", "guarded", "content"], to: "content" },
      { triggers: ["B1 供需失衡"], from: ["content", "calm"], to: "anxious" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-019": {
    defaultMood: "guarded",
    baselineAnxiety: 7,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["发现新线索", "接近真相碎片"], from: ["guarded", "calm"], to: "hopeful" },
      { triggers: ["被跟踪", "夜读老人靠近", "笔记被窥"], from: ["guarded", "calm", "hopeful"], to: "hostile" },
      { triggers: ["线索断裂", "笔记自相矛盾"], from: ["guarded", "calm", "hopeful"], to: "paranoid" },
      { triggers: ["被枫诱导", "发现 7F 话术污染"], from: ["guarded", "calm"], to: "suspicious" },
    ],
    phaseModifier: { QUIESCENCE: -1, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 2 },
  },
  "N-020": {
    defaultMood: "content",
    baselineAnxiety: 2,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["被当面质问真实意图", "笑容被说破"], from: ["content", "calm"], to: "guarded" },
      { triggers: ["认知同化加剧", "锚感知模糊"], from: ["content", "calm"], to: "anxious" },
      { triggers: ["供应线路中断"], from: ["content", "calm"], to: "anxious" },
      { triggers: ["顺利分发补给"], from: ["guarded", "anxious", "content"], to: "content" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 0, PRECURSOR: 1, CORRECTION_WINDOW: 2 },
  },
  "N-021": {
    defaultMood: "content",
    baselineAnxiety: 5,
    driftSpeed: "slow",
    transitions: [
      { triggers: ["被要求在两人间做选择", "被单独问话"], from: ["content", "calm"], to: "fearful" },
      { triggers: ["阿织恐惧", "共鸣水晶异响"], from: ["content", "calm"], to: "fearful" },
      { triggers: ["被当做普通孩子对待"], from: ["fearful", "guarded"], to: "content" },
    ],
    phaseModifier: { QUIESCENCE: 0, CALIBRATION: 1, PRECURSOR: 2, CORRECTION_WINDOW: 3 },
  },
} as const;

// ──────────────────────────────────────
// Section 7: NPC Interaction Triggers
// ──────────────────────────────────────

/**
 * NPC 间互动的触发条件。
 * 这些触发器描述的是独立于玩家行为之外、NPC 在后台自主进行的互动。
 * DM 在编排非玩家时段时可参照触发 NPC 间事件。
 */
export const NPC_INTERACTION_TRIGGERS: readonly NpcInteractionTrigger[] = [
  // ── N-001 陈婆婆 ──
  { initiator: "N-001", target: "N-004", triggerEvent: "每日晚间去看阿花是否在家（22:00）", interactionType: "caretaking", cooldownTurns: 8 },
  { initiator: "N-001", target: "N-010", triggerEvent: "发现欣蓝名单有异动时主动去登记口询问", interactionType: "conflict", cooldownTurns: 50 },

  // ── N-002 林医生 ──
  { initiator: "N-002", target: "N-005", triggerEvent: "每日探视周伯例行检查（18:00）", interactionType: "routine", cooldownTurns: 6 },
  { initiator: "N-002", target: "N-007", triggerEvent: "叶来诊室时不挂号直接入内——心照不宣", interactionType: "routine", cooldownTurns: 15 },

  // ── N-003 邮差老王 ──
  { initiator: "N-003", target: "N-006", triggerEvent: "每日送报纸给张先生（19:00）", interactionType: "routine", cooldownTurns: 6 },
  { initiator: "N-003", target: "N-011", triggerEvent: "死信事件或消化日志页码变动时去7F", interactionType: "surveillance", cooldownTurns: 30 },

  // ── N-005 周伯 ──
  { initiator: "N-005", target: "N-013", triggerEvent: "枫的话术向 4F 扩散时周伯被牵引", interactionType: "conflict", cooldownTurns: 20 },

  // ── N-006 张先生 ──
  { initiator: "N-006", target: "N-003", triggerEvent: "等报时间邮差未到会自行去信箱区", interactionType: "routine", cooldownTurns: 8 },

  // ── N-008 电工老刘 ──
  { initiator: "N-008", target: "N-014", triggerEvent: "每日下工后去洗衣房和阿姨聊两句（17:00）", interactionType: "caretaking", cooldownTurns: 6 },
  { initiator: "N-008", target: "N-015", triggerEvent: "在 B1 与麟泽擦肩不语——换班式认脸", interactionType: "routine", cooldownTurns: 10 },

  // ── N-009 阿织/阿绣 ──
  { initiator: "N-009", target: "N-007", triggerEvent: "感知叶在观察她们轮廓", interactionType: "surveillance", cooldownTurns: 12 },
  { initiator: "N-009", target: "A-006", triggerEvent: "倒行者出没时同步观察", interactionType: "surveillance", cooldownTurns: 20 },

  // ── N-010 欣蓝 ──
  { initiator: "N-010", target: "N-011", triggerEvent: "消化账簿与登记名单差异触发核对", interactionType: "conflict", cooldownTurns: 30 },
  { initiator: "N-010", target: "N-001", triggerEvent: "陈婆婆来登记口时互相试探", interactionType: "routine", cooldownTurns: 20 },

  // ── N-011 夜读老人 ──
  { initiator: "N-011", target: "N-019", triggerEvent: "持续暗中监视调查员——主要关注对象", interactionType: "surveillance", cooldownTurns: 4 },
  { initiator: "N-011", target: "A-007", triggerEvent: "13 楼门扉异动时立即确认封印", interactionType: "routine", cooldownTurns: 8 },

  // ── N-012 陶师傅 ──
  { initiator: "N-012", target: "A-004", triggerEvent: "管道屠夫异动时剁肉声加密——警告", interactionType: "conflict", cooldownTurns: 6 },
  { initiator: "N-012", target: "N-019", triggerEvent: "调查员敲门时短暂交流", interactionType: "cooperation", cooldownTurns: 15 },

  // ── N-013 枫 ──
  { initiator: "N-013", target: "N-005", triggerEvent: "诱导话术向 4F 地毯式扩散", interactionType: "conflict", cooldownTurns: 15 },
  { initiator: "N-013", target: "N-012", triggerEvent: "听见第 12 首肖邦曲时停话术（潜规则）", interactionType: "routine", cooldownTurns: 25 },

  // ── N-014 洗衣房阿姨 ──
  { initiator: "N-014", target: "N-008", triggerEvent: "发现异常衣服或 B1 异样时去找老刘", interactionType: "cooperation", cooldownTurns: 8 },

  // ── N-015 麟泽 ──
  { initiator: "N-015", target: "N-020", triggerEvent: "换班——边界巡守与补给信息交底", interactionType: "cooperation", cooldownTurns: 6 },
  { initiator: "N-015", target: "N-010", triggerEvent: "边界与登记权限冲突时面谈", interactionType: "conflict", cooldownTurns: 30 },

  // ── N-016 章嫂 ──
  { initiator: "N-016", target: "A-006", triggerEvent: "倒行者造成错层时触发方向迷失", interactionType: "conflict", cooldownTurns: 12 },

  // ── N-017 红姨 ──
  { initiator: "N-017", target: "N-014", triggerEvent: "递茶给洗衣房阿姨（阿姨恐惧但必须接）", interactionType: "routine", cooldownTurns: 20 },

  // ── N-018 北夏 ──
  { initiator: "N-018", target: "N-010", triggerEvent: "交易流水涉及登记权限时沟通", interactionType: "trade", cooldownTurns: 15 },
  { initiator: "N-018", target: "N-015", triggerEvent: "边境界线纠纷触发交换调解", interactionType: "trade", cooldownTurns: 25 },

  // ── N-019 前调查员 ──
  { initiator: "N-019", target: "N-011", triggerEvent: "暗中观察夜读老人动向", interactionType: "surveillance", cooldownTurns: 4 },
  { initiator: "N-019", target: "N-012", triggerEvent: "每周 1-2 次去厨房找陶师傅交换情报", interactionType: "cooperation", cooldownTurns: 25 },
  { initiator: "N-019", target: "A-008", triggerEvent: "寻找机会再次调查 B2 入口", interactionType: "conflict", cooldownTurns: 40 },

  // ── N-020 灵伤 ──
  { initiator: "N-020", target: "N-001", triggerEvent: "每日送干净水给陈婆婆（18:00）", interactionType: "caretaking", cooldownTurns: 6 },
  { initiator: "N-020", target: "N-015", triggerEvent: "B1 交班——补给与边界数据同步", interactionType: "cooperation", cooldownTurns: 6 },
];

// ──────────────────────────────────────
// Section 8: Player Response Presets
// ──────────────────────────────────────

/**
 * 各 NPC 对玩家常见行为的反应模板。
 * DM 在生成叙事时参考这些模板得到 NPC 的「即兴」反应。
 */
export const NPC_PLAYER_RESPONSES: Record<string, PlayerResponsePreset> = {
  "N-001": {
    npcId: "N-001",
    onHelp: "陈婆婆会眯起眼睛打量你，说『孩子你有心了』，然后从毛线堆里翻出一小块自己织的东西塞给你。她不会立刻信任你，但会记住这个帮助。",
    onThreat: "她沉默地盯着你，手里的织针停了一瞬。『年轻人，话不要说太满。』语气平静但收紧了握针的手指。之后对你的态度会冷三分。",
    onIgnore: "她不会主动接近你，但会用余光观察你。偶尔叹气，和身边的人说『年轻人有年轻人的路』。",
    onInvestigate: "岔开话题，反问关于你的事。『你不太像这里的住户，我看着眼生。你是哪来的？』如果追问关于阿花的事，她会警惕地闭口。",
    onGift: "接过礼物时会愣一下，然后轻轻抚摸。给了毛线相关物会让她眼眶湿润；给了武器类会推回：『这孩子，我不用这个。』",
    onDeceive: "不说话，低头织毛衣。很久之后抬头：『我年纪大了，但分得清真假话。你下次来，先想好再说。』",
    onFirstMeeting: "缓缓抬头打量你，目光在你脸上停留比普通人长。『新来的？』语气平淡，但织针的速度慢了半拍。",
    trustImpact: { help: 3, threat: -5, gift: 4, deceive: -4 },
  },

  "N-002": {
    npcId: "N-002",
    onHelp: "她会用职业性的冷静说『谢谢，我会记住的』，然后看似随意地问一句『你有没有什么不舒服？』——其实是在采集健康数据。",
    onThreat: "冷笑一声：『你确定要在这里和医生做对？』把病历本合上搁在桌上。诊室的甜腻气味似乎更浓了。",
    onIgnore: "对你视若无睹。如果你走进诊室又不说话，她会翻着病历说『不看病就出去，别挡着下一个。』",
    onInvestigate: "仔细观察你的反应，反问一系列关于身体状况的问题。如果你问的是病历而非健康，她会冷下脸来。",
    onGift: "检查礼物——若是医疗用品会收下但不会说谢谢；若是无关物则放在一边『有空再看』。不会在你面前使用。",
    onDeceive: "手指在病历上停了停。『你说话的时候，你的左手在抖。』之后给你看诊时可能会『不小心』用更疼的手法。",
    onFirstMeeting: "用审视的目光从上到下打量你。『住户还是来访？有没有需要病历登记的既往病史？』语气专业到令人不适。",
    trustImpact: { help: 2, threat: -3, gift: 1, deceive: -5 },
  },

  "N-003": {
    npcId: "N-003",
    onHelp: "愣了一下，然后说『你人不错。』下次见面可能会给你递一封信——『不知道谁写的，但我觉得是你的。』",
    onThreat: "抱紧邮包后退半步。『打邮差不吉利。你以后还有信要收的。』声音底气不足但执拗。",
    onIgnore: "不会在意你——他专注于信件的世界。擦肩而过时只会低声嘟囔『让一让』。",
    onInvestigate: "顾左右而言他，从口袋里掏出一封旧信『这应该是你的』转移话题。如果你追问死信的事，他会变得不安。",
    onGift: "接礼物时手指微微颤抖——很少收到东西。若是信纸或笔，会有罕见的笑容；若是食物会塞进邮包『路上吃』。",
    onDeceive: "相信你的话，但在他脸上有一种奇怪的表情——仿佛他已经知道了真相但仍然选择不戳穿。",
    onFirstMeeting: "头也不抬地在分信。『新来的？你住几楼？这楼里有你一封信……等等，还没到。』",
    trustImpact: { help: 4, threat: -4, gift: 5, deceive: -2 },
  },

  "N-004": {
    npcId: "N-004",
    onHelp: "如果帮她捡了毽子或陪她玩，她会对你露出罕见的笑——然后跑开躲在墙角偷看你还不在。",
    onThreat: "退到墙角，抱着毽子不撒手。如果逼太紧会尖叫——尖叫声会引来陈婆婆。陈婆婆会在 5 分钟内赶到。",
    onIgnore: "不会主动搭理你，但偶尔会在你路过时悄悄跟在你身后走几步——纯粹好奇。",
    onInvestigate: "回答简短：『嗯。』『不知道。』『陈婆婆说不要和陌生人说话。』但如果你问毽子怎么来的，她会安静很久。",
    onGift: "如果是吃的会接，但会先拿给陈婆婆看再吃。如果是玩具会抱着跑回 3 楼。",
    onDeceive: "孩子直觉敏锐——她会盯着你的眼睛很久，然后说『你说谎了。』然后不再和你说话。",
    onFirstMeeting: "从楼梯转角探出半张脸看你，手里紧紧攥着黑色毽子。不说话，只是盯。",
    trustImpact: { help: 5, threat: -8, gift: 4, deceive: -6 },
  },

  "N-005": {
    npcId: "N-005",
    onHelp: "紧紧抓住你的手臂。『你听到大黄了吗？』他的手指劲很大。如果你说带他去找，他会相信你——这是危险的信任。",
    onThreat: "侧头辨别你的方向，攥紧导盲杖。『我瞎了，但我打架不瞎。』语气里有倔强的自保本能。",
    onIgnore: "不会注意到你——他在专心听大黄的声音。但如果你从他身边走过，他会朝你的方向伸手『喂，你听到狗叫了吗？』",
    onInvestigate: "如果你问关于失明的事，他会沉默。『你问这些做什么？你是医生？』如果你问枫，他会警觉地后退。",
    onGift: "先用手摸清楚是什么东西。如果是吃食会闻一闻再说谢谢；如果是导盲相关物，他会摸很久然后低声说『谢谢』。",
    onDeceive: "他没有视觉所以更依赖其他感官——你说话的声音、呼吸的节奏。谎话在他面前维持不了多久。『你在紧张，为什么？』",
    onFirstMeeting: "头转向你的方向，眯着眼用耳朵『看』你。『你是谁？听脚步声不像这层楼的。你来 4 楼做什么？』",
    trustImpact: { help: 6, threat: -4, gift: 3, deceive: -6 },
  },

  "N-006": {
    npcId: "N-006",
    onHelp: "他推了推眼镜：『谢谢。不过我不需要什么帮助。』如果你帮的是关于报纸的事，他会更愿意多说两句。",
    onThreat: "退回门内，透过门缝看你。『你要什么就拿去。不要碰我的报纸。』对失去报纸的恐惧让他宁愿妥协。",
    onIgnore: "无所谓——他沉在自己的时间里。你在不在对他来说区别不大。",
    onInvestigate: "只要你问日期类问题，他会立即关闭对话：『我不知道。也不想知道。你走吧。』问其他事则含混回应。",
    onGift: "如果是报纸或书会欣然接受；如果是其他东西会放在门口很久才收进去。你说谢谢他会点头但不说谢。",
    onDeceive: "他的时间混乱让他对语言本身有不信任感。你说了谎他也不一定能分辨——但他会凭直觉觉得『不对』，然后不再多说。",
    onFirstMeeting: "从报纸上方抬眼看了你一眼，然后继续读报。『有什么话就站在门口说吧。我不太请人进屋。』",
    trustImpact: { help: 2, threat: -3, gift: 3, deceive: -1 },
  },

  "N-007": {
    npcId: "N-007",
    onHelp: "叶会审视你半分钟，然后侧过身让你看见画布一角。『你帮不到我什么，但留在这里安静点也行。』",
    onThreat: "她放下画笔转向你。表情没有恐惧而是冷静的观察：『你应该考虑的不是怎么威胁我，而是公寓为什么让我看见这些。』",
    onIgnore: "她知道你在看她但不会回头——继续画。偶尔轻轻说一句：『看够了吗。』然后继续。",
    onInvestigate: "关于画的内容她会模糊回答『画我看见的东西』。追问锚位话题她会沉默。『你知道了也不一定对你有好处。』",
    onGift: "如果是画具会收下，端详很久。给出颜料管时她的手轻了一瞬。其它礼物会礼貌但疏离地拒绝。",
    onDeceive: "她的锚位感知让她对认知层面的异常敏感。『你的话和你的锚感对不上。』之后对你的态度会变得冷淡。",
    onFirstMeeting: "隔着画架看你。『你是新住进来的？』她的视线没有离开画布，但你感觉到她在用某种不同于视觉的方式看你。",
    trustImpact: { help: 3, threat: -4, gift: 2, deceive: -5 },
  },

  "N-008": {
    npcId: "N-008",
    onHelp: "嘴上骂骂咧咧实则接受：『行行行你非要帮那就搭把手——那边，别碰那根线。』结束后会低声说『谢了，别到处说。』",
    onThreat: "拔下螺丝刀指向你：『你搞搞清楚，这里断电大家都要死。』黑猫弓背。他不是在虚张声势。",
    onIgnore: "正好——他也不希望你多管闲事。他只会在你电器出问题时才来交涉。",
    onInvestigate: "如果你问墙壁里是什么，他的脸色会变。『你看到了什么？你最好什么都没看到。』然后不再谈这个话题。",
    onGift: "接到东西后先摆弄一下搞清用法。实用的（工具、电池）会收下并点头；装饰品会还给你『我不用这个』。",
    onDeceive: "哼了一声。『妈的，老子修了这么多年线路，你说话有没有短路我听不出来？』直接拆穿。",
    onFirstMeeting: "拎着工具箱从你身边走过，上下看了一眼。『眼生。别碰配电室的门，那门有电。』说完就走。黑猫蹲在不远处看着你。",
    trustImpact: { help: 4, threat: -5, gift: 3, deceive: -5 },
  },

  "N-009": {
    npcId: "N-009",
    onHelp: "两人同时转向你。阿织开口：『你真的想帮我们？』阿绣接口：『还是想找个答案？』她们的声音如果不看人脸几乎一样。",
    onThreat: "两人靠得更紧了，共用的一颗心脏让她们同步后退一步。『我们只是站在门口而已。』恐惧但克制。",
    onIgnore: "她们会一边盯着你一边小声低语——用你听不清的声音快速交换意见。偶尔发出轻笑。",
    onInvestigate: "答非所问，或者一人问另一人答。当你问谁是本体时两人同时沉默，然后同时说『不知道。』",
    onGift: "阿织接礼物，阿绣看你的表情。如果是成对的物体会非常开心；如果是单独一件，她们会同时为难地看对方。",
    onDeceive: "她们会同时歪头看你——诡异的同步。『你说的话和我们听过的不一样。』不一定能分辨真假，但能感知差异。",
    onFirstMeeting: "你看到她们站在门口，手拉手，穿一样的裙子。她们没有说话，但那个先开口的时间差让你觉得——两个人好像是一个人。",
    trustImpact: { help: 4, threat: -6, gift: 4, deceive: -4 },
  },

  "N-010": {
    npcId: "N-010",
    onHelp: "从眼镜上方看着你，然后拿起登记表：『你帮我的方式就是填好这张表。』不会欠人情——当天会在某个小事上还回来。",
    onThreat: "把登记表缓缓放下，十指交叉。『我听过的威胁比你见过的住户还多。要么你坐下登记，要么我叫麟泽来。』",
    onIgnore: "你不在她名单上她就懒得关注你。但如果你在名单上有异常，她会派人找你。",
    onInvestigate: "你的每句质问她都用表格的形式回答——把话题扭转到『你的入住信息呢？』。关于消化账簿的问题一律回避。",
    onGift: "先登记入库——塞一张便签条给你作为回执。『谢谢了。这些我可都记着呢。』语气含义不明。",
    onDeceive: "不动声色地听你说完，然后在她的登记表上某个角落用铅笔做了个记号。不表示任何态度，但你在她眼里已经是『异常项』。",
    onFirstMeeting: "坐在 1F 登记口后面，桌上摊着一份满是编号的表格。抬眼看了你一下，视线微顿，恢复如常。『新住户？填表。』",
    trustImpact: { help: 2, threat: -3, gift: 1, deceive: -4 },
  },

  "N-011": {
    npcId: "N-011",
    onHelp: "缓缓翻了一页书。『帮我？你觉得我需要什么帮助？』如果你说出了他意料外的话，他会合上书审视你。",
    onThreat: "他合上消化日志。『你根本不知道你在威胁什么。』语气波澜不惊——因为他对你的威胁程度心中有数。",
    onIgnore: "他也在观察你——你们互相无视但双方都在对方的注意力范围内。他从不主动搭话。",
    onInvestigate: "反问多于回答。『你为什么要问这些？谁让你来的？』如果你问到消化日志的内容，他会沉默很久。",
    onGift: "看一眼礼物，再看你一眼。『有意思。』接过去但不使用也不道谢。之后你对他的威胁评估会多一个变量。",
    onDeceive: "他永远在消化信息——他可能明知你在撒谎却选择不纠正，因为他要看看你撒谎的目的是什么。",
    onFirstMeeting: "你第一次见到他时他正在 7F 走廊的长椅上看一本很厚的书。他没有抬头看你的意思。但你知道，他已经知道你在那里了。",
    trustImpact: { help: 1, threat: -2, gift: 1, deceive: -1 },
  },

  "N-012": {
    npcId: "N-012",
    onHelp: "沉默地看了你很久。如果他在剁肉时段，他只会摇头示意你走开。如果在窗口期（18-20点），他会说『不要靠近厨房。晚上听到什么声音都别开门。』",
    onThreat: "他的手没有停——剁肉的节奏不变。『你进来试试。』声音低沉。刀光在灯光下来回闪。",
    onIgnore: "对你毫无兴趣——他专注于他的节奏和使命。但你若在 7F 夜间乱走，他会记下你的脚步声。",
    onInvestigate: "关于妻子的话题会让他的刀停顿一下，然后继续剁肉，力道更重。『出去。』关于屠夫话题他会压低声音：『那不是你应该管的事。』",
    onGift: "如果是食物能用的材料，他会默默收下。如果是其他东西会放在案板边上不碰。给人感觉他在等你走远后再处理。",
    onDeceive: "剁肉声没有变化，但节奏更快了。他沉默——有时沉默本身就是一种答案。",
    onFirstMeeting: "你看到 7F 厨房里一个壮硕的背影在案板上工作。他没有回头，但你在门口的时候他的动作慢了一点。『厨房不开饭。走。』",
    trustImpact: { help: 3, threat: -4, gift: 2, deceive: -3 },
  },

  "N-013": {
    npcId: "N-013",
    onHelp: "枫微笑着看你——那笑容让你觉得不太舒服。『你这么热心的吗？那你知道 7 楼电梯不太对劲吗？』话术试探开始。",
    onThreat: "笑容不变但眼神变了。『你在 7 楼说这样的话——你可能不太清楚 7 楼是谁的地盘。』然后缓缓退入阴影。",
    onIgnore: "不会因为你无视他就放弃——他会找适当的机会『偶遇』你，用一种你难以拒绝的友善开场。",
    onInvestigate: "大部分问题他会用问题反问——引导你去他想让你去的方向。如果你识破了他的话术，他会笑得更深了：『有意思。』",
    onGift: "收下礼物时会仔细观察你的选择——礼物的类型让他对你的人格有判断。『谢谢。你很会挑东西。』然后话题转向诱导。",
    onDeceive: "他本身就是话术专家，你的谎言他大概率能识别。但他不会揭穿——他会把你的谎言当成素材，编织进他的故事。",
    onFirstMeeting: "你在 7 楼走廊上遇到他。他看起来温和无害，笑着和你打招呼：『新来的？7 楼有点绕，我带你走走？』——他的声音让人不太想拒绝。",
    trustImpact: { help: 1, threat: -2, gift: 2, deceive: -2 },
  },

  "N-014": {
    npcId: "N-014",
    onHelp: "从洗衣机后面探出头，用围裙擦了擦手。『你要帮我洗衣服？唉不用不用，你放下就好。』但如果你真的帮忙了，她会默默给你塞一块干净毛巾。",
    onThreat: "手在水里停住了，水面上浮起红色。『你非要这样说话的话就别来洗衣房了。』语气疲惫但倔强。",
    onIgnore: "不会在意你——她忙着洗衣服。但如果你在 B1 路过时她会朝你点头示意。",
    onInvestigate: "关于红姨的事她会紧张：『别说了。茶壶的事你最好当不知道。』关于自来水的事她会压低声音说找老刘问。",
    onGift: "接礼物时在围裙上再三擦手。实用的（洗衣皂、毛巾）会很高兴；其他东西她也会收下但会反复说『你不要破费』。",
    onDeceive: "她不太擅长分辨谎言——你说什么她基本信。但她对异常的直觉很准，如果你说了关于洗衣房的假话，她会在下次见老刘时提一句。",
    onFirstMeeting: "地下洗衣房里蒸汽氤氲，她正把一件白衬衫从水里捞出来。看到你愣了一下，水珠滴在地上。『你是……新来的？洗衣房走到底左拐是配电间，别走错了。』",
    trustImpact: { help: 4, threat: -3, gift: 3, deceive: -2 },
  },

  "N-015": {
    npcId: "N-015",
    onHelp: "审视你——不是怀疑的审视，而是评估『你知不知道你在帮什么』。『你在 B1 帮我看这条线，出了事立刻后退。』",
    onThreat: "他平静地挡在你和 B1 出入口之间。『你过了这条线就要按边界规则来。我不针对你个人，但规则就是规则。』",
    onIgnore: "无所谓——他的职责优先于社交。你不在边界问题上犯错，他不会主动找你。",
    onInvestigate: "关于耶里学校的话题他会变得僵硬。『那个名字在公寓里不要提。』关于锚系统则看你的信任度决定说多少。",
    onGift: "接过礼物时简短地点头。实用的（手电筒、绳子）会当场试一下功能。非实用品也会收下但放在边界日志旁边。",
    onDeceive: "他不会立刻反驳。但他会记住你话中与边界事实不符的部分。当你下次需要帮助时，他会用验证过的角度重新评估你。",
    onFirstMeeting: "你在 B1 看到他站在走廊尽头。雨痕外套在昏暗灯光下泛着微光。他没有向你走近，也没有转身离开——他在等你自己选择方向。",
    trustImpact: { help: 3, threat: -4, gift: 2, deceive: -4 },
  },

  "N-016": {
    npcId: "N-016",
    onHelp: "抓住你的手臂不放：『你能不能陪我待一会儿？就一会儿。一个人待着的时候那些声音太大了。』他的眼神里有真实的恐惧。",
    onThreat: "像是没听懂你的威胁——他太困太混乱了。『啊？你要……算了我不懂，但你能不能小声一点，我在试着回想今天是几号。』",
    onIgnore: "继续他的徘徊。但他会记住了你的面孔——下次看到你时会问『我见过你吗？我记得你……还是我梦到的？』",
    onInvestigate: "你的问题他会用混乱的方式回答——时间线跳跃、楼层混淆。如果你耐心纠正他，他会露出感激的表情。",
    onGift: "安眠药类会让他的恐惧大于感激——他不会接受。食物或书籍会收下但可能忘记是谁给的。能帮助保持清醒的东西有特殊价值。",
    onDeceive: "他可能根本分不清真假——他的现实感已经被错层侵蚀。但这意味着他也会无意中说出真相，因为他的『谎言』和『真话』边界模糊。",
    onFirstMeeting: "你看到他在 6 楼楼梯间来回走，嘴里念念有词。看到你时他停下脚步，眨了眨布满血丝的眼睛：『你是 10 楼新搬来的吗？等等……不对，这是 6 楼……还是 10 楼？』",
    trustImpact: { help: 5, threat: -2, gift: 2, deceive: -1 },
  },

  "N-017": {
    npcId: "N-017",
    onHelp: "她停下来看着你。那眼神不像是感激——更像是在评估你是不是可以成为下一个『配送对象』。『不用了，我做我的事就好。』",
    onThreat: "手按在茶壶盖上。『你想知道这里面是什么吗？』语气平淡但暗示了某种危险的互换。",
    onIgnore: "对你没有兴趣——她专注完成她的 '配送配额'。你们相安无事。",
    onInvestigate: "关于茶壶内容——她不会直接回答，而是把茶杯推向你：『喝一口，你就知道了。』关于她的过去——『以前？不记得了。』回答时手轻轻抖。",
    onGift: "接过礼物时面色不变。不会当着你的面打开。之后你会在你的住处门口看到一杯茶放在地上——她的回礼。",
    onDeceive: "她在公寓待得太久，已经不太在意人类社会的真假了。你的谎言她也许听得出来，但对她来说这属于 '你们活人的事'。",
    onFirstMeeting: "你第一次看到她在走廊里推着茶车。她看起来像普通的中年妇女，但她的手在递茶时抖了一下——茶水溅出了杯沿，那液体比普通的水浓稠一点。",
    trustImpact: { help: 1, threat: -3, gift: 2, deceive: -1 },
  },

  "N-018": {
    npcId: "N-018",
    onHelp: "眯起眼睛掂量你的帮助价值。『你帮我？那行，你帮我把这批货运到 B1，别磕碰就行。』像在做交易——帮你等于你欠他一次。",
    onThreat: "他笑了——生意人的那种笑。『别这样，公寓里什么都可以谈。你开个价嘛。』他宁愿用交易化解冲突也不想直接对抗。",
    onIgnore: "不影响——少一个人就少一笔生意。他忙得很。",
    onInvestigate: "大部分信息可以买。『你问这个啊……我这有点线索，3 克源质？』但关于信物断链或边境界线的事，他会变得含糊。",
    onGift: "掂量一下，给个估价。『不错，这个我收了，抵你 2 克源质的账。』一切都是可交易的。",
    onDeceive: "他是交易所里泡大的——你跟他耍心眼可能还嫩点。他会笑着配合你演，然后在账单上悄悄做手脚。",
    onFirstMeeting: "你在 1F 大厅看到他的摊位——杂七杂八什么都有。他靠墙坐着，对每一个路过的人招手：『来看看？源质换也行，以物易物也行。』看到你时眼睛一亮：『哎新面孔，一定有好货。』",
    trustImpact: { help: 2, threat: -2, gift: 3, deceive: -3 },
  },

  "N-019": {
    npcId: "N-019",
    onHelp: "先怀疑你的动机。『你为什么要帮我？你知道帮我的代价吗？』如果你表示了坚定的态度，他会在确认你没有被公寓操控后给你一个接头方式。",
    onThreat: "他比你更警惕——你掏出凶器之前他的刀可能已经在你腰间了。『我不是坏人，但我杀过知道太多的人。你确定要选这条路？』",
    onIgnore: "正好——他也不想有你这样的变量。但如果你在调查同样的事情，他会在暗中观察你，判断你是敌是友。",
    onInvestigate: "关于公寓真相——他愿意分享一些非核心发现来试探你的价值。但关于 B2、死过的人、他的笔记——这些都是禁区。",
    onGift: "先检查是否带有追踪或标记。确认安全后才会收下。不会因为礼物就完全信任你——但在他的笔记里，你的名字旁边会多一个加号。",
    onDeceive: "他的专业训练让他对谎言高度敏感。如果你被拆穿，你在他的笔记里会变成红色标注——『可能已被公寓同化』。",
    onFirstMeeting: "你看到他在 7 楼墙角仔细听着什么动静。察觉到你后，他迅速恢复了普通住户的神态。『哦，你也住这层？我住 701，刚搬来不久。』——但你注意到了他夹克内侧那个笔记本的边角。",
    trustImpact: { help: 4, threat: -6, gift: 2, deceive: -7 },
  },

  "N-020": {
    npcId: "N-020",
    onHelp: "笑容灿烂：『真的吗？你人真好！』但她的眼神让一切显得有距离——仿佛她在用笑容做一层保护壳。她不会拒绝帮助但也不会真的依赖你。",
    onThreat: "笑容没有消失。『你这样说话会让我很难做的。』语气依然温柔，但她的手放在了储藏室的某个死角——那里可能有武器。",
    onIgnore: "不会在意。她依然会笑着给你分发补给，好像什么也没发生。那份微笑底下可能是空洞。",
    onInvestigate: "对于自己的事她用笑容模糊应对。对于公寓的事她说『我也不太清楚』——但你知道她知道得比说的多。关于认知同化的事她会沉默很久。",
    onGift: "双手接过，笑着道谢。但那个笑容让人觉得——她接过所有东西都是同一个表情，不论好坏。不过补给品确实会优先用到。",
    onDeceive: "她可能已经公寓化到一定程度——真假对她来说区别不大了。你的谎言她既不会戳穿也不会相信。她只会微笑。",
    onFirstMeeting: "你在 B1 遇到她时她正抱着几瓶干净水往走廊走。她看到你就笑了——那种让你觉得温暖又不太确定的笑：『啊，你是新来的？我是灵伤，需要干净水可以来储藏室找我。』她语气轻松，但你知道她已经在打量你了。",
    trustImpact: { help: 2, threat: -3, gift: 1, deceive: -2 },
  },

  "N-021": {
    npcId: "N-021",
    onHelp: "（与阿织同时开口）阿绣不说话，只是看着你。如果你不是冲着分辨她们而是真心帮助，她会轻轻靠阿织近一点——那是她的感谢。",
    onThreat: "躲在阿织身后，露出一只眼睛看你。两人握紧的手关节发白。不会出声。",
    onIgnore: "和阿织一起站在门口目送你走过。阿绣的视线在你背后停留更久。",
    onInvestigate: "如果是单独追问她，她会看向阿织寻求许可。阿织点头，她才开口。她的声音和阿织很像但不是完全一样——稍微轻一些。",
    onGift: "如果是两份一样的她才会开心——否则她会把礼物让给阿织。",
    onDeceive: "和阿织不同，阿绣更难分辨善意和恶意。她看起来更容易相信人——这也是她更脆弱的根源。",
    onFirstMeeting: "她和阿织站在一起。如果你仔细看，你会发现阿绣的影子比阿织淡了一点。",
    trustImpact: { help: 5, threat: -6, gift: 4, deceive: -5 },
  },
} as const;

// ──────────────────────────────────────
// Section 9: Query Helpers
// ──────────────────────────────────────

/**
 * 根据当前小时获取 NPC 的预计位置。
 * @param npcId  NPC ID
 * @param hour  当前小时（0-24）
 * @param phase 当前周期相位（可选，默认 QUIESCENCE）
 * @returns 位置节点名，或 null（无匹配）
 */
export function getNpcLocationAtHour(
  npcId: string,
  hour: number,
  phase: CyclePhase = "QUIESCENCE",
): string | null {
  const schedule = NPC_DAILY_SCHEDULES[npcId];
  if (!schedule) return null;

  // 周期相位覆盖优先
  const effectiveBlocks =
    phase !== "QUIESCENCE" && schedule.phaseOverride?.[phase]
      ? schedule.phaseOverride[phase]!
      : schedule.defaultSchedule;

  // 处理跨午夜时间块（endHour > startHour 表示同一天；endHour < startHour 表示跨午夜）
  // 统一用 0-24 范围处理
  const normalizedHour = hour;
  for (const block of effectiveBlocks) {
    if (block.startHour <= block.endHour) {
      // 同一天内
      if (normalizedHour >= block.startHour && normalizedHour < block.endHour) {
        return block.location;
      }
    } else {
      // 跨午夜（如 22-6）
      if (normalizedHour >= block.startHour || normalizedHour < block.endHour) {
        return block.location;
      }
    }
  }
  return null;
}

/**
 * 获取 NPC 当前时间段的完整时间块信息。
 * @param npcId NPC ID
 * @param hour  当前小时
 * @param phase 当前周期相位
 * @returns 时间块信息，或 null
 */
export function getNpcCurrentTimeBlock(
  npcId: string,
  hour: number,
  phase: CyclePhase = "QUIESCENCE",
): NpcTimeBlock | null {
  const schedule = NPC_DAILY_SCHEDULES[npcId];
  if (!schedule) return null;

  const effectiveBlocks =
    phase !== "QUIESCENCE" && schedule.phaseOverride?.[phase]
      ? schedule.phaseOverride[phase]!
      : schedule.defaultSchedule;

  for (const block of effectiveBlocks) {
    if (block.startHour <= block.endHour) {
      if (hour >= block.startHour && hour < block.endHour) return block;
    } else {
      if (hour >= block.startHour || hour < block.endHour) return block;
    }
  }
  return null;
}

/**
 * 获取 NPC 当前情绪状态（基于默认情绪和相位修正的简化版本）。
 * DM 应结合叙事上下文使用更细致的情绪判断。
 */
export function getNpcBaseAnxiety(npcId: string, phase: CyclePhase = "QUIESCENCE"): number {
  const profile = NPC_MOOD_PROFILES[npcId];
  if (!profile) return 5;
  const modifier = profile.phaseModifier?.[phase] ?? 0;
  return Math.max(0, Math.min(10, profile.baselineAnxiety + modifier));
}

/**
 * 构建 DM 可读的 NPC 行为上下文块。
 * 按当前小时和周期相位输出 NPC 的位置和基础情绪。
 */
export function buildNpcBehaviorBlock(npcId: string, hour: number, phase: CyclePhase): string {
  const schedule = NPC_DAILY_SCHEDULES[npcId];
  const mood = NPC_MOOD_PROFILES[npcId];
  if (!schedule && !mood) return `【${npcId}】无行为数据`;

  const lines: string[] = [];
  if (schedule) {
    const block = getNpcCurrentTimeBlock(npcId, hour, phase);
    if (block) {
      lines.push(`【当前位置】${block.location}（${block.activity}）`);
    }
  }
  if (mood) {
    const anxiety = getNpcBaseAnxiety(npcId, phase);
    lines.push(`【焦虑基线】${anxiety}/10（相位修正后）`);
    lines.push(`【默认情绪】${mood.defaultMood}`);
  }
  return lines.join("／");
}
