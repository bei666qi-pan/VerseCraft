// src/lib/registry/world.ts
// 如月公寓地图与楼层结构 — 固化世界观

import type { FloorId } from "./types";

export const FLOORS: readonly { id: FloorId; label: string; description: string }[] = [
  { id: "B2", label: "地下 B2 层", description: "出口通道、守门人结界。第 8 诡异（深渊守门人）永驻此地。" },
  { id: "B1", label: "地下 B1 层", description: "玩家初始复苏地。储物间、洗衣房、配电间。绝对安全区，无诡异。" },
  { id: "1", label: "1 楼", description: "门厅、物业办公室、保安室、信箱区。陈婆婆长椅、物业经理办公室、新住户引导台。" },
  { id: "2", label: "2 楼", description: "201 诊室（林医生）、202 室、203 室、走廊。消毒水与甜腻气味弥漫。" },
  { id: "3", label: "3 楼", description: "301 室、302 室、楼梯间。小女孩阿花踢毽子的回响不绝于耳。" },
  { id: "4", label: "4 楼", description: "401 室（张先生）、402 室、走廊尽头。盲人徘徊此处呼唤大黄。" },
  { id: "5", label: "5 楼", description: "501 室、502 室、503 画室（独居画家）。未完成的自画像挂满墙壁。" },
  { id: "6", label: "6 楼", description: "601 室、602 室（双胞胎）、楼梯间。失眠症患者整夜喃喃低语。" },
  { id: "7", label: "7 楼", description: "701 室、走廊长椅（夜读老人）、厨房（厨师）、紧闭门扉区。公寓最深层的秘密汇聚于此。" },
];

export const SPAWN_FLOOR: FloorId = "B1";
export const EXIT_FLOOR: FloorId = "B2";

/** N-011 夜读老人 is the hidden 7F apartment manager. Appears as combatPower 5 but true power is 30. */
export const MANAGER_NPC_ID = "N-011";
export const MANAGER_TRUE_COMBAT_POWER = 30;

/** A-008 deep abyss gatekeeper — favorability permanently locked at -99 */
export const B2_BOSS_ID = "A-008";
export const B2_BOSS_LOCKED_FAVORABILITY = -99;

/** Damage tiers for DM reference (injected into system prompt) */
export const DAMAGE_TIERS = {
  floors_1_3: { min: 3, max: 10, darkMoonBonus: 2 },
  floors_4_6: { min: 5, max: 12, darkMoonBonus: 3 },
  floor_7:    { base: 10, darkMoonBonus: 4 },
  b2_boss:    { min: 15, max: 25 },
} as const;

/** NPC exclusive items — NPC uses without consuming; can gift to player at high favorability */
export const NPC_EXCLUSIVE_ITEMS: Record<string, string> = {
  "N-001": "织针（陈婆婆专属）",
  "N-002": "处方笺（林医生专属）",
  "N-003": "死信（邮差老王专属）",
  "N-004": "黑色毽子（阿花专属）",
  "N-005": "导盲杖（盲人专属）",
  "N-006": "无日期报纸（张先生专属）",
  "N-007": "颜料调色盘（画家专属）",
  "N-008": "万能螺丝刀（电工老刘专属）",
  "N-009": "共鸣水晶（双胞胎专属）",
  "N-010": "物业印章（物业经理专属）",
  "N-011": "消化日志（夜读老人专属·不可赠予）",
  "N-012": "屠夫菜刀（厨师专属）",
  "N-013": "无声琴键（钢琴师专属）",
  "N-014": "漂白剂（洗衣房阿姨专属）",
  "N-015": "电梯应急钥匙（电梯维修工专属）",
  "N-016": "失眠者手记（失眠症患者专属）",
  "N-017": "茶壶（红制服保洁员专属·剧毒）",
  "N-018": "巡逻记录簿（无面保安专属）",
  "N-019": "调查笔记（前调查员专属）",
  "N-020": "入住须知（引导员专属）",
};

/** Combat power tiers for anomalies (used in DM prompt as hard reference) */
export const ANOMALY_COMBAT_TIERS = {
  floors_1_3: 15,
  floors_4_6: 18,
  floor_7: 20,
  b2_boss: 29,
} as const;

/** Each NPC holds 10 bound originium that they cannot use themselves */
export const NPC_BOUND_ORIGINIUM = 10;

/** S-tier items can ONLY drop from the 7F manager's exclusive quest line */
export const S_TIER_DROP_HOLDER = "N-011";
