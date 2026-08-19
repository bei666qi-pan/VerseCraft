import { QINGSHI_LOCATION_IDS, QINGSHI_LOCATIONS, QINGSHI_NPCS, type QingshiLocationId } from "./qingshiContent";
import type { SpiritRoot } from "./progression";

export const QINGSHI_TIME_SLOTS = ["dawn", "day", "dusk", "night"] as const;
export type QingshiTimeSlot = (typeof QINGSHI_TIME_SLOTS)[number];
export type RevealTier = "public" | "trusted" | "quest" | "sealed";

export const QINGSHI_NPC_PROFILES = {
  "XQ-N001": { faction: "青石县镇守府", goal: "守住县域秩序并查明灵脉异动", conflictBoundary: "不替散修完成升仙试，不接受首图死斗", relationThresholds: { trusted: 20, quest: 35 }, schedule: { dawn: "QS_EXORCISM_OFFICE", day: "QS_EXORCISM_OFFICE", dusk: "QS_ASCENSION_TERRACE", night: "QS_EXORCISM_OFFICE" }, serviceWindows: [], facts: [
    { id: "XQ-F001", tier: "public", text: "顾玄岳是青石县唯一金丹镇守使。" },
    { id: "XQ-F002", tier: "quest", text: "黑松岭躁动源于登记灵脉支脉失衡。" },
    { id: "XQ-F003", tier: "sealed", text: "顾玄岳准备将灵脉异动记录带往青云渡复核。" },
  ] },
  "XQ-N002": { faction: "百草堂", goal: "用可复验药理压住黑松瘴气", conflictBoundary: "不免费代炼，不保证未登记丹方", relationThresholds: { trusted: 12, quest: 25 }, schedule: { dawn: "QS_HERB_HALL", day: "QS_HERB_HALL", dusk: "QS_CULTIVATOR_MARKET", night: "QS_HERB_HALL" }, serviceWindows: ["dawn", "day", "night"], facts: [
    { id: "XQ-F004", tier: "public", text: "聚气散需凝露灵叶与阳籽。" },
    { id: "XQ-F005", tier: "trusted", text: "青木灵根更易辨出药性冲突，但其他灵根也可依火候完成。" },
    { id: "XQ-F006", tier: "quest", text: "清瘴散能作为黑松风起的解决方案。" },
  ] },
  "XQ-N003": { faction: "神工坊", goal: "修复残锋并证明封脉器纹可靠", conflictBoundary: "无材料不动炉，不接受口头赊欠", relationThresholds: { trusted: 12, quest: 25 }, schedule: { dawn: "QS_DIVINE_FORGE", day: "QS_DIVINE_FORGE", dusk: "QS_CULTIVATOR_MARKET", night: "QS_DIVINE_FORGE" }, serviceWindows: ["dawn", "day", "night"], facts: [
    { id: "XQ-F007", tier: "public", text: "修复残锋需要玄铁与三枚灵石。" },
    { id: "XQ-F008", tier: "trusted", text: "赤火灵根可稳住炉温，但玄水和青木也有登记替代工序。" },
    { id: "XQ-F009", tier: "quest", text: "残锋的器纹可改作镇压灵脉支点。" },
  ] },
  "XQ-N004": { faction: "升仙台", goal: "维持升仙试公开与可复核", conflictBoundary: "不跳过资格、不篡改阵傀难度", relationThresholds: { trusted: 15, quest: 30 }, schedule: { dawn: "QS_ASCENSION_TERRACE", day: "QS_ASCENSION_TERRACE", dusk: "QS_EXORCISM_OFFICE", night: "QS_ASCENSION_TERRACE" }, serviceWindows: ["dawn", "day", "night"], facts: [
    { id: "XQ-F010", tier: "public", text: "升仙试要求炼气四层、两项凭证和完成黑松风起。" },
    { id: "XQ-F011", tier: "trusted", text: "阵傀会依挑战者准备切换登记姿态。" },
    { id: "XQ-F012", tier: "sealed", text: "阵傀核心留有青云渡制式印记。" },
  ] },
  "XQ-N005": { faction: "归雁客栈", goal: "让落脚散修守规矩也有活路", conflictBoundary: "传闻不说成事实，不替玩家偿清所有代价", relationThresholds: { trusted: 8, quest: 18 }, schedule: { dawn: "QS_GUOYAN_INN", day: "QS_GUOYAN_INN", dusk: "QS_GUOYAN_INN", night: "QS_GUOYAN_INN" }, serviceWindows: ["dawn", "day", "dusk", "night"], facts: [
    { id: "XQ-F013", tier: "public", text: "客栈提供休整、治疗和无钱散修的救济差事。" },
    { id: "XQ-F014", tier: "trusted", text: "周小满失联前提过灵泉洞附近的蓝色苔痕。" },
    { id: "XQ-F015", tier: "quest", text: "陈砚曾替周小满挡过一次妖兽。" },
  ] },
  "XQ-N006": { faction: "散修", goal: "抢在升仙试前证明自己不输任何人", conflictBoundary: "可以竞争或合作，不承担无事实支撑的反派行为", relationThresholds: { trusted: 10, quest: 22 }, schedule: { dawn: "QS_GUOYAN_INN", day: "QS_CULTIVATOR_MARKET", dusk: "QS_BLACK_PINE_RIDGE", night: "QS_GUOYAN_INN" }, serviceWindows: [], facts: [
    { id: "XQ-F016", tier: "public", text: "陈砚是准备参加升仙试的炼气七层散修。" },
    { id: "XQ-F017", tier: "trusted", text: "陈砚愿意与守信者共享一次黑松岭路线。" },
    { id: "XQ-F018", tier: "sealed", text: "陈砚害怕再次没能把同行者带回来。" },
  ] },
  "XQ-N007": { faction: "镇邪司", goal: "让每一头妖兽和每一笔悬赏都有登记", conflictBoundary: "不结算未登记目标，不提前发放悬赏", relationThresholds: { trusted: 10, quest: 20 }, schedule: { dawn: "QS_SOUTH_GATE", day: "QS_EXORCISM_OFFICE", dusk: "QS_BLACK_PINE_RIDGE", night: "QS_EXORCISM_OFFICE" }, serviceWindows: ["day", "night"], facts: [
    { id: "XQ-F019", tier: "public", text: "镇邪司只结算登记妖兽和委托。" },
    { id: "XQ-F020", tier: "quest", text: "铁背獠猪躁动前，岭中先出现了灵气逆流。" },
  ] },
  "XQ-N008": { faction: "采药散修", goal: "找回药篓并守住灵泉洞路线", conflictBoundary: "只知道亲见草药与山路，不知道县域密令", relationThresholds: { trusted: 8, quest: 18 }, schedule: { dawn: "QS_HERB_HALL", day: "QS_BLACK_PINE_RIDGE", dusk: "QS_SPIRIT_SPRING_CAVE", night: "QS_HERB_HALL" }, serviceWindows: [], facts: [
    { id: "XQ-F021", tier: "public", text: "周小满熟悉黑松岭登记采集点。" },
    { id: "XQ-F022", tier: "trusted", text: "灵泉洞入口可由蓝色苔痕辨认。" },
    { id: "XQ-F023", tier: "quest", text: "药篓里留有一束被瘴气灼过的凝露灵叶。" },
  ] },
} as const satisfies Record<string, { faction: string; goal: string; conflictBoundary: string; relationThresholds: { trusted: number; quest: number }; schedule: Record<QingshiTimeSlot, QingshiLocationId>; serviceWindows: readonly QingshiTimeSlot[]; facts: readonly { id: string; tier: RevealTier; text: string }[] }>;

export const QINGSHI_MAIN_STAGES = [
  { id: "XQ-M01", chapter: 1, title: "雨落青石", objective: "在归雁客栈检查气海与行囊", locationId: "QS_GUOYAN_INN", npcId: "XQ-N005" },
  { id: "XQ-M02", chapter: 1, title: "散修登记", objective: "前往镇邪司登记散修身份", locationId: "QS_EXORCISM_OFFICE", npcId: "XQ-N007" },
  { id: "XQ-M03", chapter: 1, title: "岭上失踪", objective: "接下寻找周小满的登记委托", locationId: "QS_EXORCISM_OFFICE", npcId: "XQ-N007" },
  { id: "XQ-M04", chapter: 2, title: "遗落药篓", objective: "在黑松岭找到周小满的药篓", locationId: "QS_BLACK_PINE_RIDGE", npcId: "XQ-N008" },
  { id: "XQ-M05", chapter: 2, title: "灵根解障", objective: "用灵根对应方式处理瘴障", locationId: "QS_BLACK_PINE_RIDGE", npcId: "XQ-N008" },
  { id: "XQ-M06", chapter: 2, title: "灵泉归路", objective: "在灵泉洞救回周小满并修复气海", locationId: "QS_SPIRIT_SPRING_CAVE", npcId: "XQ-N008" },
  { id: "XQ-M07", chapter: 3, title: "三艺择路", objective: "了解战斗、炼丹和炼器三条凭证路线", locationId: "QS_CULTIVATOR_MARKET", npcId: "XQ-N005" },
  { id: "XQ-M08", chapter: 3, title: "第一凭证", objective: "完成任意一条凭证任务链", locationId: "QS_CULTIVATOR_MARKET", npcId: "XQ-N004" },
  { id: "XQ-M09", chapter: 3, title: "第二凭证", objective: "完成不同的第二条凭证任务链", locationId: "QS_CULTIVATOR_MARKET", npcId: "XQ-N004" },
  { id: "XQ-M10", chapter: 4, title: "黑松风起", objective: "向镇邪司确认灵脉异动", locationId: "QS_EXORCISM_OFFICE", npcId: "XQ-N007" },
  { id: "XQ-M11", chapter: 4, title: "三策定脉", objective: "以武力、药散或器纹处理黑松支脉", locationId: "QS_BLACK_PINE_RIDGE", npcId: "XQ-N001" },
  { id: "XQ-M12", chapter: 4, title: "镇守之诺", objective: "向顾玄岳提交处理记录", locationId: "QS_EXORCISM_OFFICE", npcId: "XQ-N001" },
  { id: "XQ-M13", chapter: 5, title: "升仙问路", objective: "恢复炼气四层并向许闻舟核验资格", locationId: "QS_ASCENSION_TERRACE", npcId: "XQ-N004" },
  { id: "XQ-M14", chapter: 5, title: "阵傀试锋", objective: "通过升仙试并解锁青云渡界门", locationId: "QS_ASCENSION_TERRACE", npcId: "XQ-N004" },
] as const;

export const QINGSHI_CREDENTIAL_QUESTS = [
  { id: "XQ-COMBAT", credential: "combat", stages: ["register", "prepare", "defeat", "submit"], mentorNpcId: "XQ-N007" },
  { id: "XQ-ALCHEMY", credential: "alchemy", stages: ["learn", "gather", "craft", "verify"], mentorNpcId: "XQ-N002" },
  { id: "XQ-REFINING", credential: "refining", stages: ["inspect", "gather", "repair", "verify"], mentorNpcId: "XQ-N003" },
] as const;

export const QINGSHI_SIDE_QUESTS = QINGSHI_NPCS.map((npc, index) => ({
  id: `XQ-S${String(index + 1).padStart(2, "0")}`,
  npcId: npc.id,
  title: ["镇守旧简", "百草辨性", "炉边旧约", "阵傀校印", "客栈欠账", "同行之争", "悬赏清册", "药篓归处"][index],
  startLocationId: npc.home,
  objectiveLocationId: ["QS_ASCENSION_TERRACE", "QS_BLACK_PINE_RIDGE", "QS_CULTIVATOR_MARKET", "QS_EXORCISM_OFFICE", "QS_SOUTH_GATE", "QS_BLACK_PINE_RIDGE", "QS_SOUTH_GATE", "QS_SPIRIT_SPRING_CAVE"][index] as QingshiLocationId,
  reward: index < 4 ? 3 : 2,
  stages: ["available", "active", "completed"] as const,
}));

export const QINGSHI_REPEATABLES = [
  { id: "XQ-R01", title: "客栈杂役", locationId: "QS_GUOYAN_INN", reward: 2, dailyLimit: 1 },
  { id: "XQ-R02", title: "坊市搬运", locationId: "QS_CULTIVATOR_MARKET", reward: 2, dailyLimit: 1 },
  { id: "XQ-R03", title: "镇邪巡路", locationId: "QS_SOUTH_GATE", reward: 4, dailyLimit: 1 },
  { id: "XQ-R04", title: "黑松采样", locationId: "QS_BLACK_PINE_RIDGE", reward: 3, dailyLimit: 1 },
] as const;

export const QINGSHI_EVENTS = Array.from({ length: 12 }, (_, index) => ({
  id: `XQ-EV${String(index + 1).padStart(2, "0")}`,
  locationId: QINGSHI_LOCATION_IDS[index % QINGSHI_LOCATION_IDS.length],
  title: ["雨后药香", "城门盘查", "坊市争价", "丹炉余温", "炉火飞星", "悬榜换纸", "阵纹轻鸣", "松针落雪", "泉声回转", "旧客留字", "药篓草结", "远渡钟声"][index],
  publicFact: `青石县登记微事件${index + 1}，只描述当日可见现象。`,
}));

export const QINGSHI_ITEMS = {
  xq_herb_spirit_leaf: { name: "凝露灵叶", kind: "material", buy: 1, sell: 0, protected: false },
  xq_herb_sun_seed: { name: "阳籽", kind: "material", buy: 1, sell: 0, protected: false },
  xq_ore_black_iron: { name: "玄铁", kind: "material", buy: 2, sell: 1, protected: false },
  xq_pill_qi_gathering: { name: "聚气散", kind: "pill", buy: 6, sell: 3, protected: false },
  xq_pill_miasma_clearing: { name: "清瘴散", kind: "quest", buy: null, sell: null, protected: true },
  xq_artifact_damaged_blade: { name: "残损法器·残锋", kind: "equipment", buy: null, sell: null, protected: true },
  xq_artifact_restored_blade: { name: "修复的残锋", kind: "equipment", buy: null, sell: null, protected: true },
  xq_material_boar_tusk: { name: "铁背獠牙", kind: "material", buy: null, sell: 2, protected: false },
  xq_quest_herb_basket: { name: "周小满的药篓", kind: "quest", buy: null, sell: null, protected: true },
  xq_token_ascension_pass: { name: "升仙试通行令", kind: "quest", buy: null, sell: null, protected: true },
} as const;

export const QINGSHI_RECIPES = {
  pill_qi_gathering: { station: "QS_HERB_HALL", inputs: ["xq_herb_spirit_leaf", "xq_herb_sun_seed"], fee: 0, output: "xq_pill_qi_gathering", favoredRoot: "青木" as SpiritRoot },
  pill_miasma_clearing: { station: "QS_HERB_HALL", inputs: ["xq_herb_spirit_leaf", "xq_material_boar_tusk"], fee: 1, output: "xq_pill_miasma_clearing", favoredRoot: "青木" as SpiritRoot },
  repair_damaged_artifact: { station: "QS_DIVINE_FORGE", inputs: ["xq_ore_black_iron"], fee: 3, output: "xq_artifact_restored_blade", favoredRoot: "赤火" as SpiritRoot },
} as const;

export const QINGSHI_PRODUCTION_ENEMIES = [
  { id: "XQ-E003", name: "瘴纹松狼", realm: "炼气四层", locationId: "QS_BLACK_PINE_RIDGE", registered: true, retreatDifficulty: 45 },
] as const;

export function getQingshiTimeSlot(hour: number): QingshiTimeSlot {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h < 6) return "night";
  if (h < 11) return "dawn";
  if (h < 18) return "day";
  if (h < 22) return "dusk";
  return "night";
}

export function getNpcLocationAt(npcId: string, hour: number): QingshiLocationId | null {
  const profile = QINGSHI_NPC_PROFILES[npcId as keyof typeof QINGSHI_NPC_PROFILES];
  return profile?.schedule[getQingshiTimeSlot(hour)] ?? null;
}

export function selectQingshiEvent(saveId: string, day: number, locationId: QingshiLocationId) {
  const candidates = QINGSHI_EVENTS.filter((event) => event.locationId === locationId);
  if (candidates.length === 0) return null;
  let hash = 2166136261;
  for (const char of `${saveId}:${day}:${locationId}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return candidates[hash % candidates.length];
}

export function validateQingshiProductionContent(): string[] {
  const issues: string[] = [];
  const npcIds = new Set(QINGSHI_NPCS.map((npc) => npc.id));
  const locationIds = new Set<string>(QINGSHI_LOCATION_IDS);
  if (QINGSHI_MAIN_STAGES.length !== 14) issues.push("主线必须恰好十四个阶段");
  if (new Set(QINGSHI_MAIN_STAGES.map((stage) => stage.chapter)).size !== 5) issues.push("主线必须恰好五章");
  if (QINGSHI_SIDE_QUESTS.length !== 8 || new Set(QINGSHI_SIDE_QUESTS.map((q) => q.npcId)).size !== 8) issues.push("每名核心NPC必须有一条支线");
  if (QINGSHI_REPEATABLES.length !== 4) issues.push("必须登记四类重复委托");
  if (QINGSHI_EVENTS.length !== 12) issues.push("必须登记十二个微事件");
  for (const stage of QINGSHI_MAIN_STAGES) if (!locationIds.has(stage.locationId) || !npcIds.has(stage.npcId)) issues.push(`主线引用越界:${stage.id}`);
  for (const [npcId, profile] of Object.entries(QINGSHI_NPC_PROFILES)) {
    if (!npcIds.has(npcId)) issues.push(`未知NPC资料:${npcId}`);
    for (const slot of QINGSHI_TIME_SLOTS) if (!locationIds.has(profile.schedule[slot])) issues.push(`NPC日程越界:${npcId}:${slot}`);
  }
  const allIds = [...QINGSHI_MAIN_STAGES.map((x) => x.id), ...QINGSHI_CREDENTIAL_QUESTS.map((x) => x.id), ...QINGSHI_SIDE_QUESTS.map((x) => x.id), ...QINGSHI_REPEATABLES.map((x) => x.id), ...QINGSHI_EVENTS.map((x) => x.id)];
  if (new Set(allIds).size !== allIds.length) issues.push("任务或事件ID重复");
  for (const [id, item] of Object.entries(QINGSHI_ITEMS)) if (item.buy !== null && item.sell !== null && item.sell > item.buy) issues.push(`可套利物品:${id}`);
  if (Object.values(QINGSHI_LOCATIONS).some((location) => location.name === "青云渡")) issues.push("青云渡不得包含可游玩地点内容");
  return issues;
}
