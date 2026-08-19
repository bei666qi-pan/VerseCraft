import { QINGSHI_MAP_ID, QINGYUN_FERRY_MAP_ID, XINGNI_WORLD_ID } from "@/lib/worlds/types";

export const QINGSHI_LOCATION_IDS = [
  "QS_SOUTH_GATE",
  "QS_GUOYAN_INN",
  "QS_CULTIVATOR_MARKET",
  "QS_HERB_HALL",
  "QS_DIVINE_FORGE",
  "QS_EXORCISM_OFFICE",
  "QS_ASCENSION_TERRACE",
  "QS_BLACK_PINE_RIDGE",
  "QS_SPIRIT_SPRING_CAVE",
] as const;
export type QingshiLocationId = (typeof QINGSHI_LOCATION_IDS)[number];

export const QINGSHI_LOCATIONS: Record<QingshiLocationId, { name: string; description: string; services: readonly string[] }> = {
  QS_SOUTH_GATE: { name: "南城门", description: "商旅与散修进入青石县的城门。", services: ["travel"] },
  QS_GUOYAN_INN: { name: "归雁客栈", description: "散修落脚、交换消息和休整之处。", services: ["rest", "rumor"] },
  QS_CULTIVATOR_MARKET: { name: "散修坊市", description: "灵草、符箓与低阶法器流通的露天坊市。", services: ["trade"] },
  QS_HERB_HALL: { name: "百草堂", description: "沈清禾坐镇的丹药铺与炼丹房。", services: ["alchemy"] },
  QS_DIVINE_FORGE: { name: "神工坊", description: "韩铸经营的炼器铺，可修复残损法器。", services: ["refining"] },
  QS_EXORCISM_OFFICE: { name: "县衙镇邪司", description: "处理妖患和发布登记委托的县衙机构。", services: ["bounty"] },
  QS_ASCENSION_TERRACE: { name: "升仙台", description: "青石县升仙试举行之地，台后界门通往青云渡。", services: ["ascension_trial"] },
  QS_BLACK_PINE_RIDGE: { name: "黑松岭", description: "县外妖兽出没的低阶山岭。", services: ["gather", "combat"] },
  QS_SPIRIT_SPRING_CAVE: { name: "灵泉洞", description: "灵气温和的隐蔽洞窟，适合吐纳修炼。", services: ["cultivate"] },
};

export const QINGSHI_EDGES = [
  ["QS_SOUTH_GATE", "QS_GUOYAN_INN"],
  ["QS_SOUTH_GATE", "QS_BLACK_PINE_RIDGE"],
  ["QS_GUOYAN_INN", "QS_CULTIVATOR_MARKET"],
  ["QS_CULTIVATOR_MARKET", "QS_HERB_HALL"],
  ["QS_CULTIVATOR_MARKET", "QS_DIVINE_FORGE"],
  ["QS_CULTIVATOR_MARKET", "QS_EXORCISM_OFFICE"],
  ["QS_EXORCISM_OFFICE", "QS_ASCENSION_TERRACE"],
  ["QS_BLACK_PINE_RIDGE", "QS_SPIRIT_SPRING_CAVE"],
] as const satisfies readonly (readonly [QingshiLocationId, QingshiLocationId])[];

export const QINGSHI_MAP_EXIT = { from: "QS_ASCENSION_TERRACE", toMapId: QINGYUN_FERRY_MAP_ID, unlockFlag: "qingshi_ascension_passed" } as const;

export type QingshiNpc = {
  id: string; name: string; realm: string; role: string; home: QingshiLocationId;
  allowedLocations: readonly QingshiLocationId[]; knowledgeScope: readonly string[]; services: readonly string[];
};

export const QINGSHI_NPCS: readonly QingshiNpc[] = [
  { id: "XQ-N001", name: "顾玄岳", realm: "金丹初期", role: "青石县镇守使", home: "QS_EXORCISM_OFFICE", allowedLocations: ["QS_EXORCISM_OFFICE", "QS_ASCENSION_TERRACE"], knowledgeScope: ["county_order", "ascension_rules"], services: [] },
  { id: "XQ-N002", name: "沈清禾", realm: "筑基后期", role: "百草堂丹师", home: "QS_HERB_HALL", allowedLocations: ["QS_HERB_HALL", "QS_CULTIVATOR_MARKET"], knowledgeScope: ["alchemy", "herbs"], services: ["alchemy"] },
  { id: "XQ-N003", name: "韩铸", realm: "筑基中期", role: "神工坊炼器师", home: "QS_DIVINE_FORGE", allowedLocations: ["QS_DIVINE_FORGE", "QS_CULTIVATOR_MARKET"], knowledgeScope: ["refining", "artifacts"], services: ["refining"] },
  { id: "XQ-N004", name: "许闻舟", realm: "筑基初期", role: "升仙试主持者", home: "QS_ASCENSION_TERRACE", allowedLocations: ["QS_ASCENSION_TERRACE", "QS_EXORCISM_OFFICE"], knowledgeScope: ["ascension_rules"], services: ["ascension_trial"] },
  { id: "XQ-N005", name: "柳三娘", realm: "炼气九层", role: "归雁客栈掌柜", home: "QS_GUOYAN_INN", allowedLocations: ["QS_GUOYAN_INN"], knowledgeScope: ["public_rumors", "county_routes"], services: ["rest", "rumor"] },
  { id: "XQ-N006", name: "陈砚", realm: "炼气七层", role: "散修竞争者", home: "QS_GUOYAN_INN", allowedLocations: ["QS_GUOYAN_INN", "QS_CULTIVATOR_MARKET", "QS_BLACK_PINE_RIDGE"], knowledgeScope: ["public_rumors"], services: [] },
  { id: "XQ-N007", name: "石魁", realm: "炼气五层", role: "镇邪司护卫", home: "QS_EXORCISM_OFFICE", allowedLocations: ["QS_EXORCISM_OFFICE", "QS_SOUTH_GATE", "QS_BLACK_PINE_RIDGE"], knowledgeScope: ["registered_threats"], services: ["bounty"] },
  { id: "XQ-N008", name: "周小满", realm: "炼气三层", role: "采药人", home: "QS_HERB_HALL", allowedLocations: ["QS_HERB_HALL", "QS_BLACK_PINE_RIDGE", "QS_SPIRIT_SPRING_CAVE"], knowledgeScope: ["herbs", "public_routes"], services: [] },
] as const;

export const QINGSHI_ENEMIES = [
  { id: "XQ-E001", name: "铁背獠猪", realm: "炼气三层", locationId: "QS_BLACK_PINE_RIDGE", registered: true },
  { id: "XQ-E002", name: "升仙试阵傀", realm: "炼气四层", locationId: "QS_ASCENSION_TERRACE", registered: true },
] as const;

export const QINGSHI_CONTENT_PACK = {
  worldId: XINGNI_WORLD_ID,
  mapId: QINGSHI_MAP_ID,
  locations: QINGSHI_LOCATIONS,
  edges: QINGSHI_EDGES,
  npcs: QINGSHI_NPCS,
  enemies: QINGSHI_ENEMIES,
  exit: QINGSHI_MAP_EXIT,
} as const;

const locationSet = new Set<string>(QINGSHI_LOCATION_IDS);
export function isQingshiLocationId(value: unknown): value is QingshiLocationId {
  return typeof value === "string" && locationSet.has(value);
}

export function getQingshiNeighbors(locationId: QingshiLocationId): QingshiLocationId[] {
  const out: QingshiLocationId[] = [];
  for (const [a, b] of QINGSHI_EDGES) {
    if (a === locationId) out.push(b);
    if (b === locationId) out.push(a);
  }
  return out;
}

export function canTraverseQingshi(from: unknown, to: unknown): boolean {
  return isQingshiLocationId(from) && isQingshiLocationId(to) && getQingshiNeighbors(from).includes(to);
}

export function validateQingshiContent(): string[] {
  const issues: string[] = [];
  if (Object.keys(QINGSHI_LOCATIONS).length !== 9) issues.push("青石县必须恰好登记九个首版地点");
  for (const [a, b] of QINGSHI_EDGES) if (!locationSet.has(a) || !locationSet.has(b) || a === b) issues.push(`非法地图边:${a}:${b}`);
  const npcIds = new Set<string>();
  for (const npc of QINGSHI_NPCS) {
    if (npcIds.has(npc.id)) issues.push(`重复NPC:${npc.id}`);
    npcIds.add(npc.id);
    if (!locationSet.has(npc.home) || npc.allowedLocations.some((id) => !locationSet.has(id))) issues.push(`NPC地点越界:${npc.id}`);
  }
  if (QINGSHI_NPCS.filter((npc) => npc.realm.startsWith("金丹")).length !== 1) issues.push("青石县必须只有一名金丹角色");
  return issues;
}
