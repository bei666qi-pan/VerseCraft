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

/** B2 entrance has an indestructible wooden door — cannot be burned, smashed, or bypassed by brute force */
export const B2_DOOR_INDESTRUCTIBLE = true;

/** All traversable room nodes per floor */
export const MAP_ROOMS: Record<string, readonly string[]> = {
  B2: ["B2_Passage", "B2_GatekeeperDomain"],
  B1: ["B1_SafeZone", "B1_Storage", "B1_Laundry", "B1_PowerRoom"],
  "1": ["1F_Lobby", "1F_PropertyOffice", "1F_GuardRoom", "1F_Mailboxes"],
  "2": ["2F_Clinic201", "2F_Room202", "2F_Room203", "2F_Corridor"],
  "3": ["3F_Room301", "3F_Room302", "3F_Stairwell"],
  "4": ["4F_Room401", "4F_Room402", "4F_CorridorEnd"],
  "5": ["5F_Room501", "5F_Room502", "5F_Studio503"],
  "6": ["6F_Room601", "6F_Room602", "6F_Stairwell"],
  "7": ["7F_Room701", "7F_Bench", "7F_Kitchen", "7F_SealedDoor"],
};

import type { NpcSocialProfile } from "./types";

/** NPC social graph — relationships, weaknesses, home coords, schedule hints */
export const NPC_SOCIAL_GRAPH: Record<string, NpcSocialProfile> = {
  "N-001": {
    homeLocation: "1F_Lobby",
    weakness: "对年幼的孩子无法拒绝；提及「那时候水还是清的」会陷入恍惚",
    scheduleBehavior: "白天固定坐在门厅长椅织毛衣，深夜偶尔去 3 楼看阿花",
    relationships: { "N-004": "视如孙女，极度保护", "N-010": "表面恭敬实则畏惧", "N-020": "不信任，觉得她笑得太假" },
  },
  "N-002": {
    homeLocation: "2F_Clinic201",
    weakness: "听到「医疗事故」三个字会暴怒失控；诊室内甜腻气味是她的安神剂",
    scheduleBehavior: "全天驻守诊室，偶尔去 4 楼探视盲人",
    relationships: { "N-005": "定期为其检查（实为采集数据）", "N-012": "互不干涉的冷淡邻居", "A-003": "恐惧认知腐蚀者会破坏她的病历" },
  },
  "N-003": {
    homeLocation: "1F_Mailboxes",
    weakness: "提及「退信」会触发他的执念循环；害怕火焰（信件是他存在的锚点）",
    scheduleBehavior: "全天在各楼层巡回送信，凌晨回到信箱区整理邮包",
    relationships: { "N-006": "固定给张先生送报纸，二人有默契", "N-011": "唯一知道老人在读什么的人" },
  },
  "N-004": {
    homeLocation: "3F_Stairwell",
    weakness: "对陈婆婆的毛线有执念；黑色毽子被夺走会陷入狂暴",
    scheduleBehavior: "全天在楼梯间踢毽子，夜晚会去 1 楼找陈婆婆",
    relationships: { "N-001": "唯一信任的长辈", "N-009": "恐惧双胞胎（她们曾邀请她玩游戏）", "A-003": "认知腐蚀者让她想起不存在的母亲" },
  },
  "N-005": {
    homeLocation: "4F_CorridorEnd",
    weakness: "听到狗叫声会失去理智冲向声源；极度依赖触觉判断",
    scheduleBehavior: "全天在 4 楼走廊徘徊呼唤大黄，偶尔去 2 楼诊室",
    relationships: { "N-002": "信任林医生（不知道她在采集数据）", "N-013": "前世同为钢琴师，有隐秘共鸣", "A-002": "无头猎犬用大黄的声带诱杀猎物" },
  },
  "N-006": {
    homeLocation: "4F_Room401",
    weakness: "回答「今天星期几」会触发时间崩溃；无日期报纸是他的锚点",
    scheduleBehavior: "白天坐在门口看报纸，夜间锁门不出",
    relationships: { "N-003": "等待邮差送来的报纸是每日仪式", "A-001": "恐惧时差症候群（那是他时间混乱的源头）" },
  },
  "N-007": {
    homeLocation: "5F_Studio503",
    weakness: "被质疑画作会陷入偏执暴走；无法抗拒「完美面容」的诱惑",
    scheduleBehavior: "全天在画室作画，偶尔偷偷去 6 楼观察双胞胎的脸",
    relationships: { "N-009": "执迷于双胞胎「共用一张脸」的秘密", "A-005": "器官拟态墙上的眼睛启发了她的画作" },
  },
  "N-008": {
    homeLocation: "B1_PowerRoom",
    weakness: "停电会让他极度暴躁；提及「墙壁内的血管」会触发创伤",
    scheduleBehavior: "全天在 B1 配电间或各楼层修电路，夜间回 B1",
    relationships: { "N-010": "厌恶物业经理（「他知道线从哪来但不说」）", "N-014": "与洗衣房阿姨互相照应，B1 的同盟" },
  },
  "N-009": {
    homeLocation: "6F_Room602",
    weakness: "在两人间做选择会导致暴走；共鸣水晶碎裂则双胞胎之一消亡",
    scheduleBehavior: "全天手拉手站在 602 门口，从不单独出现",
    relationships: { "N-007": "知道画家在偷看她们但不在意", "N-018": "无面保安是唯一能看清她们区别的人", "A-006": "倒行者来自与她们相同的镜像维度" },
  },
  "N-010": {
    homeLocation: "1F_PropertyOffice",
    weakness: "「退租」是触发他执行程序的开关；工牌背面的秘密是弱点",
    scheduleBehavior: "全天坐在物业办公室，从不离开 1 楼",
    relationships: { "N-020": "上下级关系（引导员向他汇报）", "N-011": "恐惧夜读老人（管理者高于执行者）", "N-008": "鄙视电工的愤怒" },
  },
  "N-011": {
    homeLocation: "7F_Bench",
    weakness: "「消化日志」是他与公寓的契约锚点；若被夺走则短暂失去管理者权限",
    scheduleBehavior: "午夜出现在 7 楼走廊长椅，黎明前消失，极少移动",
    relationships: { "N-019": "暗中监视前调查员的一切行为", "N-010": "物业经理是他的棋子", "A-007": "13楼门扉是他设下的封印" },
  },
  "N-012": {
    homeLocation: "7F_Kitchen",
    weakness: "提及他的妻子会让他崩溃并暴露厨房的秘密；剁肉节奏被打断会引来管道屠夫",
    scheduleBehavior: "凌晨 1-3 点全力剁肉，白天休息，从不离开 7 楼",
    relationships: { "A-004": "与管道屠夫是宿敌（妻子被拖入下水道）", "N-019": "前调查员是少数知道他真相的人" },
  },
  "N-013": {
    homeLocation: "7F_Room701",
    weakness: "弹完最后一个音符就会消散；钢琴被破坏则直接消亡",
    scheduleBehavior: "永远坐在钢琴前，手指无声移动，从不离开",
    relationships: { "N-005": "前世都是钢琴师，隐秘的灵魂共鸣", "N-011": "夜读老人有时来听他无声的演奏" },
  },
  "N-014": {
    homeLocation: "B1_Laundry",
    weakness: "沾血衣物触发她的旧习（防污染协议时期的创伤）；漂白剂是她的武器也是软肋",
    scheduleBehavior: "全天在洗衣房工作，偶尔去配电间找老刘聊天",
    relationships: { "N-008": "B1 互助同盟，彼此信任", "N-017": "恐惧红制服保洁员（她知道茶壶里是什么）" },
  },
  "N-015": {
    homeLocation: "1F_Lobby",
    weakness: "13 楼按钮是他的心理阴影；扳手被夺会让他失去安全感",
    scheduleBehavior: "随电梯在各楼层巡回，夜间停留在 1 楼电梯间",
    relationships: { "A-007": "13楼门扉是他竭力封锁的存在", "N-010": "接受物业经理的调度" },
  },
  "N-016": {
    homeLocation: "6F_Room601",
    weakness: "安眠药会让他被墙壁吞噬；极度渴望有人陪他保持清醒",
    scheduleBehavior: "整夜在 6 楼走廊徘徊，白天试图入睡但总是失败",
    relationships: { "N-009": "双胞胎的存在让他更加不安", "A-005": "器官拟态墙在试图同化他", "N-002": "拒绝林医生的安眠药处方" },
  },
  "N-017": {
    homeLocation: "1F_Lobby",
    weakness: "茶壶被打翻会暴露管道沉淀物；对「你以前是谁」的追问会短暂唤醒残余记忆",
    scheduleBehavior: "午夜后推着茶车在各楼层游荡，黎明前回到 1 楼",
    relationships: { "N-014": "洗衣房阿姨极度恐惧她", "N-010": "物业经理默许她的「工作」" },
  },
  "N-018": {
    homeLocation: "1F_GuardRoom",
    weakness: "没有镜子/反光面时无法表达情绪；维度磨损加剧会让他彻底消失",
    scheduleBehavior: "在各楼层反光表面间巡逻，重点监控 6 楼楼梯间",
    relationships: { "A-006": "与倒行者是宿敌，负责制约其行为", "N-009": "通过镜子能看清双胞胎的区别" },
  },
  "N-019": {
    homeLocation: "7F_Room701",
    weakness: "被发现在调查会触发杀意；调查笔记是他的命根（毁掉则精神崩溃）",
    scheduleBehavior: "白天在 7 楼搜集证据，夜间躲在房间整理笔记",
    relationships: { "N-011": "怀疑夜读老人是关键人物但无法确认", "N-012": "厨师是他唯一半信任的 7 楼同伴", "A-008": "曾试图潜入 B2 失败，差点丧命" },
  },
  "N-020": {
    homeLocation: "1F_Lobby",
    weakness: "追问「你是人吗」会触发程序错误；实习徽章是她与公寓的绑定锚",
    scheduleBehavior: "仅在有新住户时出现在门厅，其余时间消失在物业办公室后方",
    relationships: { "N-010": "直属上级，执行他的指令", "N-001": "陈婆婆不信任她，曾警告过新人" },
  },
};
