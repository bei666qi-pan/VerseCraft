/**
 * NPC 间「可表演」人际关系表层（非全量社交图）。
 *
 * 【审计 A：与 world / deep / profile 的分工】
 * - `world.NPC_SOCIAL_GRAPH`：住户心像与关系文案（buildLoreContextForDM、npcHeart 心像）；多数边未逐条进 runtime。
 * - `majorNpcDeepCanon`：六人辅锚/校源/职责回声等；**默认不**进同场微表演，仍由 reveal packet 门闸控制。
 * - `npcProfiles`（CORE_NPC_PROFILES_V2）：单人壳与 speechPattern；与他人的**当面**默契见本表边。
 * - **未消费在 packet 的图边**：仍可在长 lore 中出现；同场「非陌生人」只保证本文件中有边的组合（刻意不全覆盖）。
 * - **应 surface 化**：已写入 `NPC_RELATIONAL_SURFACE_EDGES` 的配对 → `npc_social_surface_packet` + `peerRelationalCues`。
 * - **保持隐藏**：七锚名、闭环机制、未授权校源语义 — 仍只走 deep canon / school_source，不写入本表。
 *
 * - 来源：从 NPC_SOCIAL_GRAPH / 住户默契抽出的**同场可演**切片；不含校源/辅锚等深层真相。
 * - 深层设定仍只在 majorNpcDeepCanon、profile.deepSecret 等 DM 专用层。
 */

export type MutualHistoryIntensity = 0 | 1 | 2 | 3;
export type PublicFrictionLevel = "none" | "low" | "mid";
export type MutualTrustSurface = "low" | "mid" | "high";

export type NpcRelationalSurfaceEdge = {
  a: string;
  b: string;
  knowsEachOther: boolean;
  mutualHistoryIntensity: MutualHistoryIntensity;
  publicFriction: PublicFrictionLevel;
  mutualTrust: MutualTrustSurface;
  /** 一句：彼此欠着什么却不直说 */
  unspokenDependence: string;
  jokingMode: boolean;
  avoidanceMode: boolean;
  /** 彼此当面怎么叫 */
  nameShortcutStyle: string;
  /** A 谈起 B 的语气（双向对称表演时可反用） */
  mentionStyle: string;
  /** 提对方时忌讳 */
  tabooMentionStyle: string;
  /** 有外人在（含玩家）时默认怎么演 */
  whenPlayerPresentBehavior: string;
};

/** 无向边：查询时按 sort(a,b) 建 key */
export const NPC_RELATIONAL_SURFACE_EDGES: readonly NpcRelationalSurfaceEdge[] = [
  {
    a: "N-001",
    b: "N-004",
    knowsEachOther: true,
    mutualHistoryIntensity: 3,
    publicFriction: "none",
    mutualTrust: "high",
    unspokenDependence: "阿花的安静靠婆婆挡在前面",
    jokingMode: false,
    avoidanceMode: false,
    nameShortcutStyle: "婆婆、阿花",
    mentionStyle: "护短、先摸头再说话",
    tabooMentionStyle: "不当面拆穿阿花来处",
    whenPlayerPresentBehavior: "婆婆话变少，身体半挡在阿花前",
  },
  {
    a: "N-001",
    b: "N-010",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "low",
    mutualTrust: "mid",
    unspokenDependence: "都要应付新来的，却信不过对方手里的表",
    jokingMode: false,
    avoidanceMode: false,
    nameShortcutStyle: "登记那边/一楼那位",
    mentionStyle: "客气里带躲，不点名批评",
    tabooMentionStyle: "不追问名单从哪来",
    whenPlayerPresentBehavior: "双方在玩家前会改聊天气与动线，不提底账",
  },
  {
    a: "N-003",
    b: "N-006",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "none",
    mutualTrust: "mid",
    unspokenDependence: "十年送报默契，不问日期",
    jokingMode: false,
    avoidanceMode: false,
    nameShortcutStyle: "老张/邮差",
    mentionStyle: "点头即懂，半句就够",
    tabooMentionStyle: "不戳穿报纸没日期",
    whenPlayerPresentBehavior: "交换眼神后各忙各的，像没看见第三人",
  },
  {
    a: "N-002",
    b: "N-005",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "none",
    mutualTrust: "high",
    unspokenDependence: "盲人信她手，她借他数据",
    jokingMode: false,
    avoidanceMode: false,
    nameShortcutStyle: "林医生/先生",
    mentionStyle: "医嘱口吻，慢而硬",
    tabooMentionStyle: "不当面说狗已死",
    whenPlayerPresentBehavior: "医生会先挡在盲人与外人之间半秒再接话",
  },
  {
    a: "N-015",
    b: "N-020",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "mid",
    mutualTrust: "low",
    unspokenDependence: "同守 B1，却一个冷边线一个热笑脸",
    jokingMode: false,
    avoidanceMode: false,
    nameShortcutStyle: "那边守夜的/补给台",
    mentionStyle: "公事呛声，不点名撕破脸",
    tabooMentionStyle: "不当玩家面吵「谁更越权」",
    whenPlayerPresentBehavior: "会同时收声，改用最短句配合动线",
  },
  {
    a: "N-008",
    b: "N-010",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "low",
    mutualTrust: "mid",
    unspokenDependence: "真话与条款互相讨厌又互相需要",
    jokingMode: true,
    avoidanceMode: false,
    nameShortcutStyle: "电工/登记口",
    mentionStyle: "夹枪带棒一句，然后照办",
    tabooMentionStyle: "不掀对方老底",
    whenPlayerPresentBehavior: "玩家在时拌嘴缩成半句哼声",
  },
  {
    a: "N-008",
    b: "N-015",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "mid",
    mutualTrust: "mid",
    unspokenDependence: "一个守电一个守线：谁都知道对方挡过麻烦",
    jokingMode: true,
    avoidanceMode: false,
    nameShortcutStyle: "电工/守夜的",
    mentionStyle: "一句怼一句收，最后按对方的边界走",
    tabooMentionStyle: "不当玩家面谈“越界”的旧账",
    whenPlayerPresentBehavior: "会用最短句对齐口径：先活命，再别越线",
  },
  {
    a: "N-015",
    b: "N-014",
    knowsEachOther: true,
    mutualHistoryIntensity: 1,
    publicFriction: "low",
    mutualTrust: "mid",
    unspokenDependence: "洗衣房的噪声掩住了边界上的细碎动静",
    jokingMode: false,
    avoidanceMode: false,
    nameShortcutStyle: "洗衣房那位/巡线的",
    mentionStyle: "话少但会默认让路",
    tabooMentionStyle: "不当面提‘洗不干净的东西’",
    whenPlayerPresentBehavior: "一个点头一个收声，像早就约好",
  },
  {
    a: "N-008",
    b: "N-014",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "low",
    mutualTrust: "high",
    unspokenDependence: "水声与电声互相掩护，撑住B1的‘日常’",
    jokingMode: true,
    avoidanceMode: false,
    nameShortcutStyle: "洗衣房/电工",
    mentionStyle: "嘴上嫌，手上会帮",
    tabooMentionStyle: "不提红水与管道细节",
    whenPlayerPresentBehavior: "会用家常互怼把气氛压下去，让玩家别慌",
  },
  {
    a: "N-013",
    b: "N-018",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "mid",
    mutualTrust: "low",
    unspokenDependence: "七楼话术对上市集价码，互相留后门",
    jokingMode: true,
    avoidanceMode: false,
    nameShortcutStyle: "楼上那小子/北夏",
    mentionStyle: "笑里藏针，像讨价还价",
    tabooMentionStyle: "不联手把玩家说穿",
    whenPlayerPresentBehavior: "会假装不熟，各递各的台阶",
  },
  {
    a: "N-007",
    b: "N-013",
    knowsEachOther: true,
    mutualHistoryIntensity: 1,
    publicFriction: "mid",
    mutualTrust: "low",
    unspokenDependence: "轮廓与话术互相碍眼",
    jokingMode: false,
    avoidanceMode: true,
    nameShortcutStyle: "画室/七楼那个",
    mentionStyle: "冷淡带过，不叙旧",
    tabooMentionStyle: "不提草案与剧本",
    whenPlayerPresentBehavior: "玩家在时避免同框对白，最多擦肩一瞥",
  },
  {
    a: "N-001",
    b: "N-020",
    knowsEachOther: true,
    mutualHistoryIntensity: 1,
    publicFriction: "low",
    mutualTrust: "low",
    unspokenDependence: "婆婆怕她把新来的领进坑里",
    jokingMode: false,
    avoidanceMode: true,
    nameShortcutStyle: "制服太新的那个",
    mentionStyle: "提醒半截，叹半声",
    tabooMentionStyle: "不当面说她笑假",
    whenPlayerPresentBehavior: "会故意岔开补给台话题",
  },
  {
    a: "N-010",
    b: "N-018",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "low",
    mutualTrust: "mid",
    unspokenDependence: "条款式互信，不互托生死",
    jokingMode: false,
    avoidanceMode: false,
    nameShortcutStyle: "登记口/市集口",
    mentionStyle: "对价清楚才往下谈",
    tabooMentionStyle: "不免费施舍情报",
    whenPlayerPresentBehavior: "玩家在时仍像办公，不套近乎",
  },
  {
    a: "N-003",
    b: "N-011",
    knowsEachOther: true,
    mutualHistoryIntensity: 2,
    publicFriction: "none",
    mutualTrust: "mid",
    unspokenDependence: "邮差知道书页里是什么，却永远沉默",
    jokingMode: false,
    avoidanceMode: true,
    nameShortcutStyle: "老人/送信的路过",
    mentionStyle: "极短，像对暗号",
    tabooMentionStyle: "绝不提书内容",
    whenPlayerPresentBehavior: "玩家在时两人装不认识",
  },
];
