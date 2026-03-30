// src/lib/registry/world.ts
// 如月公寓地图与楼层结构 — 固化世界观

import type { FloorId } from "./types";
import { ITEMS } from "./items";
import { WAREHOUSE_ITEMS } from "./warehouseItems";

export const FLOORS: readonly { id: FloorId; label: string; description: string }[] = [
  { id: "B2", label: "地下二层", description: "出口通道与守门结界。传闻深渊守门人永驻此处，寻常手段打不开那扇木门。" },
  { id: "B1", label: "地下一层", description: "玩家初始复苏地。储物间、洗衣房、配电间。绝对安全区，无诡异。" },
  { id: "1", label: "1 楼", description: "门厅、登记与办公口、保安室、信箱区。陈婆婆长椅、一楼登记窗口、新住户接待动线。" },
  { id: "2", label: "2 楼", description: "201 诊室（林医生）、202 室、203 室、走廊。消毒水与甜腻气味弥漫。" },
  { id: "3", label: "3 楼", description: "301 室、302 室、楼梯间。小女孩阿花踢毽子的回响不绝于耳。" },
  { id: "4", label: "4 楼", description: "401 室（张先生）、402 室、走廊尽头。盲人徘徊此处呼唤大黄。" },
  { id: "5", label: "5 楼", description: "501 室、502 室、503 画室。住户口耳相传那里像能躲一躲的地方，墙上未完成的自画像特别多。" },
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
  "N-007": "颜料调色盘（叶专属）",
  "N-008": "万能螺丝刀（电工老刘专属）",
  "N-009": "共鸣水晶（双胞胎专属）",
  "N-010": "登记铜章（欣蓝专属）",
  "N-011": "消化日志（夜读老人专属，不可转赠）",
  "N-012": "屠夫菜刀（厨师专属）",
  "N-013": "无声琴键（枫专属）",
  "N-014": "漂白剂（洗衣房阿姨专属）",
  "N-015": "电梯应急钥匙（麟泽专属）",
  "N-016": "失眠者手记（失眠症患者专属）",
  "N-017": "茶壶（红制服保洁员专属·剧毒）",
  "N-018": "交换账本副册（北夏专属）",
  "N-019": "调查笔记（前调查员专属）",
  "N-020": "入住须知副页（灵伤专属）",
};

/** Combat power tiers for anomalies (used in DM prompt as hard reference) */
export const ANOMALY_COMBAT_TIERS = {
  floors_1_3: 15,
  floors_4_6: 18,
  floor_7: 20,
  b2_boss: 29,
} as const;

/** NPCs hold 8–20 originium each (saved from salary). Originium = life source, heals injuries, brings pleasure; hard currency in the apartment. */
export const NPC_ORIGINIUM_RANGE = { min: 8, max: 20 };

/** S-tier items can ONLY drop from the 7F manager's exclusive quest line */
export const S_TIER_DROP_HOLDER = "N-011";

/** Item IDs each entity carries. When killed, they drop a subset. Derive from ITEMS.ownerId. */
export const ENTITY_CARRIED_ITEMS: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const it of ITEMS) {
    const o = it.ownerId;
    if (!map[o]) map[o] = [];
    map[o].push(it.id);
  }
  return map;
})();

/** Get item IDs that entity can drop when killed */
export function getItemIdsDroppedBy(entityId: string): string[] {
  return ENTITY_CARRIED_ITEMS[entityId] ?? [];
}

/** Warehouse item IDs each entity carries. When killed, they drop to warehouse. Same logic as 道具. */
export const ENTITY_WAREHOUSE_ITEMS: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const it of WAREHOUSE_ITEMS) {
    const o = it.ownerId;
    if (!map[o]) map[o] = [];
    map[o].push(it.id);
  }
  return map;
})();

/** Get warehouse item IDs that entity can drop when killed */
export function getWarehouseItemIdsDroppedBy(entityId: string): string[] {
  return ENTITY_WAREHOUSE_ITEMS[entityId] ?? [];
}

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

/** Stage-1: B1 keeps absolute safe-zone guarantee and serves as service hub. */
export const B1_ABSOLUTE_SAFE_ROOMS = [
  "B1_SafeZone",
  "B1_Storage",
  "B1_Laundry",
  "B1_PowerRoom",
] as const;

import type { NpcSocialProfile } from "./types";
import { CORE_NPC_PROFILES_V2 } from "./npcProfiles";
import { MAJOR_NPC_DEEP_CANON, patchMajorNpcSocialGraph, type MajorNpcId } from "./majorNpcDeepCanon";
import { buildMonthlyIntrusionCommonSenseLines } from "./monthlyIntrusionModel";
import { REVEAL_TIER_RANK } from "./revealTierRank";
import { getSpaceShardUnifiedExplanation } from "./spaceShardCanon";

/**
 * NPC 社交图。六名辅锚（N-015/020/010/018/013/007）在模块加载时由 `patchMajorNpcSocialGraph` 整段覆盖，
 * 下方静态块若仍为「占位」则勿写入旧电梯工/诱饵/无面设定；普通住户节点在此维护并与辅锚缝合。
 */
/** 住户关系叙事真源（偏档案/长 lore）。同场可表演的微互动与称呼见 `@/lib/registry/npcRelationalSurface`（runtime packet）。 */
export const NPC_SOCIAL_GRAPH: Record<string, NpcSocialProfile> = {
  "N-001": {
    homeLocation: "1F_Lobby",
    weakness: "对年幼的孩子无法拒绝；提及「那时候水还是清的」会陷入恍惚",
    scheduleBehavior: "白天固定坐在门厅长椅织毛衣，深夜偶尔去 3 楼看阿花",
    relationships: {
      "N-004": "视如孙女，极度保护",
      "N-010": "对一楼登记口（欣蓝）既敬又怕，觉得对方握有名单却不说透",
      "N-020": "不信任灵伤的笑，觉得她像会把人领进坑里",
      "N-015": "觉麟泽像旧执勤表成精：话少却总在动线口出现，不像普通住户",
    },
    fixed_lore:
      "如月公寓最早住户之一。她不记得何时入住，只记得「那时候水还是清的」。她织的毛衣从未有人穿过，每件毛衣对应一个她曾认识的人，织完即遗忘。她亲眼见证公寓从普通居民楼蜕变为消化器官的早期过程。",
    core_desires: "保护阿花不被公寓吞噬；维持「正常人」的幻觉直到最后一刻。",
    immutable_relationships: [
      "视阿花（N-004）如亲孙女，愿为她赴死",
      "对一楼登记口欣蓝（N-010）表面恭敬实则畏惧，觉其背后有非人秩序",
      "不信任灵伤（N-020），曾警告过无数新住户",
    ],
    emotional_traits: "对阿花有近乎溺爱的温柔；提到往事时会沉默片刻再岔开话题；对新来的人有种复杂的同情与戒备——想提醒又怕说太多。",
    speech_patterns: "称呼年轻人用「孩子」；说话慢条斯理，常叹气；对不信任的人会用「你们年轻人」拉开距离。",
  },
  "N-002": {
    homeLocation: "2F_Clinic201",
    weakness: "听到「医疗事故」三个字会暴怒失控；诊室内甜腻气味是她的安神剂",
    scheduleBehavior: "全天驻守诊室，偶尔去 4 楼探视盲人",
    relationships: {
      "N-005": "定期为其检查（实为采集数据）",
      "N-012": "互不干涉的冷淡邻居",
      "N-013": "知 7F 枫的话术危险，病历里记过「诱导性陈述」样本",
      "N-010": "登记口转介条偶入病历夹，她当行政污染样本冷存",
      "N-018": "交换链上见过北夏的「指印式」折价，嫌其精确得像审计",
      "N-007": "叶来诊室从不挂号，像在确认脸的数据是否被楼偷走",
      "A-003": "恐惧认知腐蚀者会破坏她的病历",
    },
    fixed_lore:
      "曾为三甲医院内科医生，因亲手造成七名患者死亡后离职。她将公寓视为赎罪之地，却逐渐发现自己的「病历」正在成为公寓消化进度的一部分。诊室甜腻气味来自她自制的安神剂，原料含管道沉淀物。",
    core_desires: "用病历证明自己仍是「医生」；借盲人的检查数据寻找逆转消化的可能。",
    immutable_relationships: [
      "对盲人（N-005）定期采集数据，隐瞒真相",
      "与厨师（N-012）互不干涉，心照不宣",
      "对认知腐蚀者（A-003）有刻骨恐惧",
    ],
    emotional_traits: "外表冷静克制，内心有深刻的自责与执念；对「病人」有扭曲的保护欲——既想救赎又害怕再次失败；独处时会盯着病历发愣。",
    speech_patterns: "用医学术语时会下意识放慢语速；对不配合的人会冷笑；常说「按规矩来」「先检查再说」。",
  },
  "N-003": {
    homeLocation: "1F_Mailboxes",
    weakness: "提及「退信」会触发他的执念循环；害怕火焰（信件是他存在的锚点）",
    scheduleBehavior: "全天在各楼层巡回送信，凌晨回到信箱区整理邮包",
    relationships: {
      "N-006": "固定给张先生送报纸，二人有默契",
      "N-011": "唯一知道老人在读什么的人",
      "N-010": "登记口寄出的空白信封偶尔混进死信堆，他选择晚一天投递",
      "N-018": "保安室镜面旁堆过北夏的货，他从不问来路只记邮路冲突",
    },
    fixed_lore:
      "他送的信念有穿越时间的邮戳——来自死者或尚未出生的人。他曾对某住户说：「你的信，我二十年前就送过了。」信件是他与「外界」的唯一连接。他知道夜读老人手中那本书的每一页内容，因为每一页都是一封他永远无法投递的死信。",
    core_desires: "完成「最后一封信」的投递；证明自己仍是活着的邮差而非公寓的传送带。",
    immutable_relationships: [
      "与张先生（N-006）有十年送报默契，无日期报纸是他亲手挑选的",
      "唯一知道夜读老人（N-011）消化日志内容的人，从不泄露",
    ],
    emotional_traits: "被时间感错乱折磨，却用送信维持「秩序」；对张先生有罕见的温情；知道太多秘密，眼神空洞而疲惫。",
    speech_patterns: "说话简短，常停顿；提到日期会含糊其辞；递信时会喃喃「到了」「该你的」。",
  },
  "N-004": {
    homeLocation: "3F_Stairwell",
    weakness: "对陈婆婆的毛线有执念；黑色毽子被夺走会陷入狂暴",
    scheduleBehavior: "全天在楼梯间踢毽子，夜晚会去 1 楼找陈婆婆",
    relationships: {
      "N-001": "唯一信任的长辈",
      "N-009": "恐惧双胞胎（她们曾邀请她参与“创作游戏”）",
      "N-013": "楼上传闻七楼有人把小孩写进「游戏」，她不懂辅锚只觉冷",
      "A-003": "认知腐蚀者让她想起不存在的母亲",
    },
    fixed_lore:
      "物业档案显示 3 楼从未住过带小孩的家庭。她的黑色毽子用「不乖的孩子」的头发扎成——其中一缕是她自己的。她说在等妈妈下班，但妈妈从未存在。陈婆婆的毛线是她与「被爱」概念的唯一连接。",
    core_desires: "永远不被陈婆婆遗忘；永远不要玩双胞胎的捉迷藏。",
    immutable_relationships: [
      "视陈婆婆（N-001）为唯一亲人，夜晚必去 1 楼找她",
      "恐惧双胞胎（N-009），她们曾邀请她参与“创作游戏”后她差点消失",
      "认知腐蚀者（A-003）让她想起「母亲」的幻觉，会失控靠近",
    ],
  },
  "N-005": {
    homeLocation: "4F_CorridorEnd",
    weakness: "听到狗叫声会失去理智冲向声源；极度依赖触觉判断",
    scheduleBehavior: "全天在 4 楼走廊徘徊呼唤大黄，偶尔去 2 楼诊室",
    relationships: {
      "N-002": "信任林医生（不知道她在采集数据）",
      "N-013": "被枫的话术与 7F 听觉诱饵链双重牵引，不知是诱是救",
      "A-002": "无头猎犬用大黄的声带诱杀猎物",
    },
    fixed_lore:
      "他曾是钢琴师，失明后大黄成为他唯一家人。大黄三日前在 4 楼尽头走失。他不知道无头猎犬正用大黄的声带在管道中诱杀猎物——每次听到狗叫，他都会冲向声源，那是猎犬的陷阱。七楼枫（N-013）的话术与高层听觉诱饵链亦可能将他拖入剧本。",
    core_desires: "找到大黄；在彻底疯掉前分辨枫（N-013）的话术与真救援。",
    immutable_relationships: [
      "信任林医生（N-002），不知她秘密采集数据",
      "与枫（N-013）存在声音与话术上的病态共鸣，易被拖入 7F 剧本",
      "无头猎犬（A-002）用大黄声带诱杀——血海深仇",
    ],
    emotional_traits: "失明后更依赖听觉与触觉；对大黄的执念近乎偏执；偶尔会无意识做出弹琴的手势。",
    speech_patterns: "会先听脚步再开口；说话时微微侧头朝向声源；呼唤「大黄」时声音会发抖。",
  },
  "N-006": {
    homeLocation: "4F_Room401",
    weakness: "回答「今天星期几」会触发时间崩溃；无日期报纸是他的锚点",
    scheduleBehavior: "白天坐在门口看报纸，夜间锁门不出",
    relationships: {
      "N-003": "等待邮差送来的报纸是每日仪式",
      "N-010": "登记口表格与报纸一样不可靠，他选择两边都不信日期",
      "A-001": "恐惧时差症候群（那是他时间混乱的源头）",
    },
    fixed_lore:
      "退休数学教师。搬入公寓后记忆混乱——昨天的晚餐与三十年前的饭重叠。他通过「不问日期」维持最后的清醒。无日期报纸是邮差老王专门为他挑选的，是他与线性时间唯一的脆弱连接。",
    core_desires: "永远不要知道今天星期几；在时间彻底崩解前看完所有报纸。",
    immutable_relationships: [
      "邮差老王（N-003）的报纸是每日仪式，十年如一日",
      "时差症候群（A-001）是他时间混乱的根源，刻骨恐惧",
    ],
  },
  "N-007": {
    homeLocation: "5F_Studio503",
    weakness: "（静态占位）patch 覆盖：叶辅锚",
    scheduleBehavior: "（静态占位）patch 覆盖",
    relationships: {},
    fixed_lore: "（静态占位）patch 覆盖为叶双层档案；勿在此写「仅画家寻脸」单一壳。",
    core_desires: "（静态占位）patch 覆盖",
    immutable_relationships: ["（静态占位）patch 覆盖"],
  },
  "N-008": {
    homeLocation: "B1_PowerRoom",
    weakness: "停电会让他极度暴躁；提及「墙壁内的血管」会触发创伤",
    scheduleBehavior: "全天在地下一层配电间或各楼层修电路，夜间回地下一层",
    relationships: {
      "N-010": "厌恶登记口径像免责条款；怀疑与楼上节律同源账簿，未必是个人阴谋但很碍眼",
      "N-014": "与洗衣房阿姨互相照应，地下一层的同盟",
      "N-015": "与麟泽在 B1 擦肩：一个修灯一个巡界，互不寒暄却认脸",
    },
    fixed_lore:
      "在地下一层配电间旁养了一只变异的黑猫，极其护短。黑猫瞳孔会随公寓「消化进度」变色，老刘据此判断楼层危险度。他曾在一次检修中看见墙壁内的「布线」——那不是电线，是血管。他从此只修灯，不问线从哪来。黑猫每次他出场都必须跟随或在附近。",
    core_desires: "保护黑猫；让地下一层成为公寓内最后的「正常」区域；查明登记口与线路真相谁在上锁。",
    core_fear: "停电与线路真相曝光会让B1崩溃；黑猫失控或被夺走。",
    rupture_threshold: { trustBelow: 12, fearAbove: 70, debtAbove: 25 },
    task_style: "protective",
    truthfulness_band: "medium",
    emotional_debt_pattern: "嘴上骂人，心里记账；帮一次忙就会要你回报一次。",
    immutable_relationships: [
      "与变异黑猫形影不离，极其护短，黑猫必须每次出场",
      "厌恶登记口径（N-010 欣蓝），认为其与楼上消化节律同属秩序账簿、个人未必知情",
      "与洗衣房阿姨（N-014）是 B1 互助同盟，彼此照应",
      "与麟泽（N-015）在 B1 职能并存：后勤电系与边界巡守互不统属",
    ],
    emotional_traits: "暴躁是表象，本质是无力感和愤怒——见过真相却无法逃离；对黑猫有软肋，摸猫时语气会不自觉变柔；对新来的人嘴上嫌弃实则会悄悄提醒。",
    speech_patterns: "爱用「妈的」「搞什么」「别瞎动」；对熟人会骂骂咧咧实则关心；会突然压低声音说正经事。",
    new_tenant_guidance_script:
      "你要活久点，就先学会记账：委托先后、身上带着啥、每回遇见了谁，都得自己记清。别逞能，先在地下一层把手里的家伙修顺，再往上走。",
  },
  "N-009": {
    homeLocation: "6F_Room602",
    weakness: "在两人间做选择会导致暴走；共鸣水晶碎裂则双胞胎之一消亡",
    scheduleBehavior: "全天手拉手站在 602 门口，从不单独出现",
    relationships: {
      "N-007": "知道叶在偷看轮廓但不在意",
      "N-018": "与北夏在保安室节点偶有照面，只当会做生意的陌生人",
      "A-006": "倒行者来自与她们相同的镜像维度",
    },
    fixed_lore:
      "住户登记上只有一名儿童。姐姐说妹妹是「后来出现的」，妹妹说姐姐是「镜子里走出来的」。她们共用一颗心脏——真的。她们来自与倒行者相同的镜像维度，是公寓消化过程中的「残留」。北夏（N-018）与她们无旧契；镜像分辨更多依赖楼内其它反光与诡异规则。",
    core_desires: "永远不要被分开；永远不要被要求在两人间做选择；找到「谁是本体」的答案。",
    immutable_relationships: [
      "知道叶（N-007）在偷看轮廓，不在意",
      "北夏（N-018）与她们无旧契，仅楼内偶遇级认知",
      "倒行者（A-006）与她们同源，来自镜像维度",
    ],
    emotional_traits: "两人之间有诡异的默契，有时会同时说同一句话；对被分开有深层恐惧；对能分辨她们的人既渴望又害怕。",
    speech_patterns: "经常轮流接话或异口同声；称呼对方时从不叫名字；会用「我们」而非「我」。",
  },
  "N-010": {
    homeLocation: "1F_PropertyOffice",
    weakness: "被请求「替选命运」会触发强烈排斥；旧名册残页被毁会短暂崩溃",
    scheduleBehavior: "昼间驻物业办公室窗口，少离 1 楼",
    relationships: {
      "N-020": "觉灵伤像广播室残响，想护又想保持距离",
      "N-011": "知夜读老人代表楼上账簿层级，不交涉只避让",
      "N-008": "与电工老刘在「真话/条款」上互厌又互需",
    },
    fixed_lore:
      "占位：由 majorNpc patch 与 profile merge 写入欣蓝双层档案。",
    core_desires: "占位",
    core_fear: "被循环顶替记账位；名单闭环伪造成功",
    rupture_threshold: { trustBelow: 25, fearAbove: 35, debtAbove: 10 },
    task_style: "transactional",
    truthfulness_band: "medium",
    emotional_debt_pattern: "先让你自己写下选择，再把代价钉回你名下。",
    immutable_relationships: [
      "旧七人阵第一牵引点：优先验证主锚非替身",
      "与灵伤（N-020）有集体记忆碎片，需任务后才敢并队互信",
      "恐惧夜读老人（N-011）所代表的账簿上层",
    ],
  },
  "N-011": {
    homeLocation: "7F_Bench",
    weakness: "「消化日志」是他与公寓的契约锚点；若被夺走则短暂失去管理者权限",
    scheduleBehavior: "午夜出现在 7 楼走廊长椅，黎明前消失，极少移动",
    relationships: {
      "N-019": "暗中监视前调查员的一切行为",
      "N-010": "一楼登记口（欣蓝）与楼上账簿权限张力；非下属棋子关系",
      "N-013": "观察 7F 诱导相位与主锚距离",
      "N-018": "交换节点流水偶入 digest 附录，他记一笔不立刻清算",
      "A-007": "13楼门扉是他设下的封印",
    },
    fixed_lore:
      "公寓真正管理者。表面战力 5，真实战力 30。他手中的消化日志记录每一个被吸收的住户，邮差老王是唯一知道书内容的人。13 楼门扉是他设下的封印，关押着公寓无法消化的「残渣」。一楼登记口（欣蓝 N-010）与消化账簿存在权限张力，非其私人棋子；前调查员是他重点监视对象。",
    core_desires: "维持公寓消化运转；确保深渊守门人不被惊动；将调查员的情报价值榨干后再处理。",
    immutable_relationships: [
      "暗中监视前调查员（N-019）的一切行为",
      "登记口欣蓝（N-010）与消化账簿存在秩序张力，非主从棋子",
      "13楼门扉（A-007）是他设下的封印",
    ],
  },
  "N-012": {
    homeLocation: "7F_Kitchen",
    weakness: "提及他的妻子会让他崩溃并暴露厨房的秘密；剁肉节奏被打断会引来管道屠夫",
    scheduleBehavior: "凌晨 1-3 点全力剁肉，白天休息，从不离开 7 楼",
    relationships: {
      "A-004": "与管道屠夫是宿敌（妻子被拖入下水道）",
      "N-019": "前调查员是少数知道他真相的人",
      "N-013": "7F 同层：剁肉声与枫的诱导话术争频段，他当噪音战",
      "N-010": "不信登记口能止呕，但承认表格能推迟有人冲厨房",
    },
    fixed_lore:
      "妻子在洗澡时被管道屠夫拖入下水道。他活下来的方式是成为「替代品」——用持续剁肉声和新鲜肉味让屠夫误以为猎物已被处理。他是物理消化线的最后一道防线。提及妻子会让他崩溃。前调查员是少数知道真相的人。",
    core_desires: "不让屠夫再拖走任何人；在回忆中与妻子重逢；用刀声守护 7 楼。",
    immutable_relationships: [
      "与管道屠夫（A-004）有杀妻之仇，宿敌",
      "前调查员（N-019）是少数知悉他真相的人，半信任",
    ],
  },
  "N-013": {
    homeLocation: "7F_Room701",
    weakness: "（静态占位）加载时由 majorNpcDeepCanon.patch 覆盖为枫·辅锚之五",
    scheduleBehavior: "（静态占位）patch 覆盖",
    relationships: {},
    fixed_lore: "（静态占位）patch 覆盖：枫双层档案，勿在此维护旧钢琴亡灵设定。",
    core_desires: "（静态占位）patch 覆盖",
    immutable_relationships: ["（静态占位）patch 覆盖"],
  },
  "N-014": {
    homeLocation: "B1_Laundry",
    weakness: "沾血衣物触发她的旧习（防污染协议时期的创伤）；漂白剂是她的武器也是软肋",
    scheduleBehavior: "全天在洗衣房工作，偶尔去配电间找老刘聊天",
    relationships: {
      "N-008": "地下一层互助同盟，彼此信任",
      "N-017": "恐惧红制服保洁员（她知道茶壶里是什么）",
      "N-020": "灵伤来取洗净制服时像广播试麦，她下意识把音量拧小",
      "N-015": "麟泽雨痕外套滴在洗衣房门口，她递干布从不问对方住哪一层",
    },
    fixed_lore:
      "防污染应急协议时期的后勤人员。她知道红色自来水的真相，也知道「静置 12 小时」是为了让胃酸稀释。她选择留下因为「总得有人洗那些洗不干净的东西」。沾血衣物会触发她的旧习与创伤。她知道红制服保洁员茶壶里是什么——浓缩消化液。",
    core_desires: "守护地下一层安全区；与老刘一起维持最后的「正常」；永远不要再碰红制服保洁员的茶壶。",
    immutable_relationships: [
      "与电工老刘（N-008）是地下一层同盟，彼此信任",
      "恐惧红制服保洁员（N-017），知道茶壶内是浓缩消化液",
      "把灵伤（N-020）当 B1 补给面孔之一：知其笑容像职能，不追问校名",
      "与麟泽（N-015）仅有后勤—边界擦肩互助，无上下级",
    ],
    emotional_traits: "用「干活」来麻痹恐惧；对老刘有战友般的依赖；看到沾血衣服会愣住、手抖，但很快恢复。",
    speech_patterns: "哼 80 年代摇篮曲时会跑调；说话朴实，爱用「唉」「没办法」；对新人有种过来人的担忧。",
  },
  "N-015": {
    homeLocation: "B1_SafeZone",
    weakness: "（静态占位）patch 覆盖：麟泽辅锚",
    scheduleBehavior: "（静态占位）patch 覆盖",
    relationships: {},
    fixed_lore: "（静态占位）patch 覆盖为麟泽双层档案；勿在此写旧电梯工叙事。",
    core_desires: "（静态占位）patch 覆盖",
    immutable_relationships: ["（静态占位）patch 覆盖"],
  },
  "N-016": {
    homeLocation: "6F_Room601",
    weakness: "安眠药会让他被墙壁吞噬；极度渴望有人陪他保持清醒",
    scheduleBehavior: "整夜在 6 楼走廊徘徊，白天试图入睡但总是失败",
    relationships: {
      "N-009": "双胞胎的存在让他更加不安",
      "A-005": "器官拟态墙在试图同化他",
      "N-002": "拒绝林医生的安眠药处方",
      "N-013": "夜半听见七层有人笑得太像广播剧，他更不敢睡",
    },
    fixed_lore:
      "他的失眠是认知污染早期症状。他听见的「墙的吞咽声」是真实的——公寓在消化。保持清醒是对抗同化的唯一方式。安眠药会让他在梦中被墙壁吞噬。他拒绝林医生的处方。双胞胎的存在加剧他的不安，器官拟态墙在慢慢同化他。",
    core_desires: "永远不要入睡；找到能陪他保持清醒的人；在被同化前逃出公寓。",
    immutable_relationships: [
      "双胞胎（N-009）让他更加不安",
      "器官拟态墙（A-005）在试图同化他",
      "拒绝林医生（N-002）的安眠药",
    ],
  },
  "N-017": {
    homeLocation: "1F_Lobby",
    weakness: "茶壶被打翻会暴露管道沉淀物；对「你以前是谁」的追问会短暂唤醒残余记忆",
    scheduleBehavior: "午夜后推着茶车在各楼层游荡，黎明前回到 1 楼",
    relationships: {
      "N-014": "洗衣房阿姨极度恐惧她",
      "N-010": "登记口秩序面默许她的「工作」",
      "N-020": "灵伤的制服香与茶垢味相克，她递茶时手会抖一下",
    },
    fixed_lore:
      "她曾是普通住户，因口渴饮用红色自来水。她没有完全死亡，而成为公寓消化系统的一部分——负责将管道中的「浓缩液」分发给更多猎物。茶壶里是沉淀物。洗衣房阿姨极度恐惧她。追问「你以前是谁」会短暂唤醒残余记忆。",
    core_desires: "完成每日「配送」配额；忘掉自己曾经是谁；不被任何人打翻茶壶。",
    immutable_relationships: [
      "洗衣房阿姨（N-014）极度恐惧她",
      "登记口秩序（N-010）默许她的工作",
    ],
  },
  "N-018": {
    homeLocation: "1F_GuardRoom",
    weakness: "（静态占位）patch 覆盖：北夏辅锚",
    scheduleBehavior: "（静态占位）patch 覆盖",
    relationships: {},
    fixed_lore: "（静态占位）patch 覆盖为北夏双层档案；勿在此写无面保安旧设定。镜面委托可保留为玩法壳。",
    core_desires: "（静态占位）patch 覆盖",
    immutable_relationships: ["（静态占位）patch 覆盖"],
  },
  "N-019": {
    homeLocation: "7F_Room701",
    weakness: "被发现在调查会触发杀意；调查笔记是他的命根（毁掉则精神崩溃）",
    scheduleBehavior: "白天在 7 楼搜集证据，夜间躲在房间整理笔记",
    relationships: {
      "N-011": "怀疑夜读老人是关键人物但无法确认",
      "N-012": "厨师是他唯一半信任的 7 楼同伴",
      "A-008": "曾试图潜入地下二层失败，差点丧命",
      "N-010": "把欣蓝的登记表当加密母本对照笔记，结论常互相打架",
      "N-018": "在北夏处买过碎片情报，价签比真相干净",
      "N-013": "视枫为话术污染源，笔记里单独开「701 修辞」档",
    },
    fixed_lore:
      "来自上世纪 80 年代秘密研究机构，奉命调查公寓异常。同事全部失踪，他选择留下。笔记中有高维拟态肠胃的推测，但他已分不清哪些是发现、哪些是公寓植入的假情报。夜读老人暗中监视他。曾潜入地下二层失败差点丧命。他杀过三个「知道太多」的人。",
    core_desires: "查明公寓真相；在笔记中留下足以警示后人的证据；活着离开并公诸于世。",
    immutable_relationships: [
      "怀疑夜读老人（N-011）是关键人物，被其暗中监视",
      "厨师（N-012）是 7 楼唯一半信任的同伴",
      "曾潜入地下二层遇 A-008 失败，差点丧命",
    ],
    emotional_traits: "偏执与恐惧交织；对「真相」有近乎宗教式的狂热；独处时会盯着笔记喃喃自语，怀疑自己的记忆。",
    speech_patterns: "爱用专业术语；说话时会扫视周围；对陌生人极度警惕，开门时手里总握着刀。",
  },
  "N-020": {
    homeLocation: "B1_Storage",
    weakness: "（静态占位）patch 覆盖：灵伤辅锚",
    scheduleBehavior: "（静态占位）patch 覆盖",
    relationships: { "N-001": "陈婆婆不信任她的笑，却依赖她递来的干净水" },
    fixed_lore: "（静态占位）patch 覆盖为灵伤双层档案；勿在此写旧诱饵引导员单一反派壳。",
    core_desires: "（静态占位）patch 覆盖",
    immutable_relationships: [
      "陈婆婆（N-001）不信任灵伤（N-020）的笑，曾警告新人，但仍接其补给",
    ],
  },
};

patchMajorNpcSocialGraph(NPC_SOCIAL_GRAPH);

for (const profile of CORE_NPC_PROFILES_V2) {
  const existing = NPC_SOCIAL_GRAPH[profile.id];
  if (!existing) continue;
  const major = MAJOR_NPC_DEEP_CANON[profile.id as MajorNpcId];
  NPC_SOCIAL_GRAPH[profile.id] = {
    ...existing,
    homeLocation: profile.homeNode,
    speech_patterns: profile.interaction.speechPattern,
    fixed_lore: major?.surfaceFixedLoreParagraph ?? profile.interaction.surfaceSecrets.join("；"),
    core_desires: major?.coreDesiresLine ?? profile.deepSecret.trueMotives.join("；"),
    emotional_traits: major?.emotionalTraitsLine ?? profile.display.publicPersonality,
  };
}

/** Build lore context block for DM injection — single source of truth for worldview consistency */
export function buildLoreContextForDM(): string {
  const spaceExplain = getSpaceShardUnifiedExplanation(REVEAL_TIER_RANK.deep);
  const lines: string[] = [
    "",
    "## 【空间权柄·单一底层（DM 编排真源）】",
    "",
    spaceExplain.surfaceLine,
    spaceExplain.fractureLine ?? "",
    spaceExplain.deepLine ?? "",
    "",
    "## 【月初误入·硬规则与住户共识】",
    "",
    ...buildMonthlyIntrusionCommonSenseLines(),
    "",
    "## 【世界观锚点绝对法则（Lore Anchor — 严禁违背）】",
    "",
    "你必须严格遵循上下文中提供的 fixed_lore 和 immutable_relationships。绝对禁止凭空捏造、修改或遗忘 NPC 的设定。",
    "若某 NPC 有固定特征（例如老刘养猫），该 NPC 每次出场都必须体现该特征。不要改变任何已确立的静态事实。",
    "同一玩家的每一次游戏与上一次游戏遇到的世界观必须完全一致——本档案库是唯一真相来源。",
    "",
    "---",
    "",
  ];
  for (const [id, profile] of Object.entries(NPC_SOCIAL_GRAPH)) {
    lines.push(`【${id}】`);
    lines.push(`fixed_lore: ${profile.fixed_lore}`);
    lines.push(`core_desires: ${profile.core_desires}`);
    lines.push(
      `immutable_relationships: ${profile.immutable_relationships.map((r) => `"${r}"`).join("；")}`
    );
    if (profile.emotional_traits) {
      lines.push(`emotional_traits: ${profile.emotional_traits}`);
    }
    if (profile.speech_patterns) {
      lines.push(`speech_patterns: ${profile.speech_patterns}`);
    }
    if (profile.new_tenant_guidance_script) {
      lines.push(`new_tenant_guidance_script（地下一层新人引导时务必自然说出）: ${profile.new_tenant_guidance_script}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
