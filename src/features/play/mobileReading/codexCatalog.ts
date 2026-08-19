import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";
import type { FloorId } from "@/lib/registry/types";
import { QINGSHI_LOCATIONS, QINGSHI_NPCS } from "@/lib/worlds/xingni/qingshiContent";
import {
  DARK_MOON_WORLD_ID,
  XINGNI_WORLD_ID,
  type WorldId,
} from "@/lib/worlds/types";

export type CodexCatalogSlotType = "npc" | "anomaly";

export type CodexCatalogSlot = {
  id: string;
  type: CodexCatalogSlotType;
  worldId: WorldId;
  floor: FloorId | "random";
  displayName: string;
  fallbackLocation: string;
  quote?: string;
};

function floorLabel(floor: FloorId | "random"): string {
  if (floor === "B2") return "B2";
  if (floor === "B1") return "B1";
  if (floor === "random") return "流动楼层";
  return `${floor}F`;
}

const CODEX_SLOT_QUOTES: Partial<Record<string, string>> = {
  "N-008": "别乱碰开关，线路会记住你的房间号。",
};

const NPC_CODEX_SLOTS: CodexCatalogSlot[] = NPCS.map((npc) => ({
  id: npc.id,
  type: "npc",
  worldId: DARK_MOON_WORLD_ID,
  floor: npc.floor,
  displayName: npc.name,
  fallbackLocation: npc.location,
  quote: CODEX_SLOT_QUOTES[npc.id],
}));

const ANOMALY_CODEX_SLOTS: CodexCatalogSlot[] = ANOMALIES.map((anomaly) => ({
  id: anomaly.id,
  type: "anomaly",
  worldId: DARK_MOON_WORLD_ID,
  floor: anomaly.floor,
  displayName: anomaly.name,
  fallbackLocation: `${floorLabel(anomaly.floor)} 主威胁`,
}));

export const DARK_MOON_CODEX_CATALOG_SLOTS: readonly CodexCatalogSlot[] = [
  ...NPC_CODEX_SLOTS,
  ...ANOMALY_CODEX_SLOTS,
] as const;

export const XINGNI_CODEX_CATALOG_SLOTS: readonly CodexCatalogSlot[] = QINGSHI_NPCS.map((npc) => ({
  id: npc.id,
  type: "npc",
  worldId: XINGNI_WORLD_ID,
  // 星逆按地点与四时段日程展示，不复用暗月楼层筛选；保留 random 仅兼容通用 slot 类型。
  floor: "random",
  displayName: npc.name,
  fallbackLocation: QINGSHI_LOCATIONS[npc.home].name,
}));

/**
 * 暗月兼容别名。旧调用默认仍得到原目录；多世界 UI 必须改用 getCodexCatalogSlots。
 */
export const ALL_CODEX_CATALOG_SLOTS: readonly CodexCatalogSlot[] = [
  ...DARK_MOON_CODEX_CATALOG_SLOTS,
] as const;

export function getCodexCatalogSlots(worldId: WorldId): readonly CodexCatalogSlot[] {
  return worldId === XINGNI_WORLD_ID ? XINGNI_CODEX_CATALOG_SLOTS : DARK_MOON_CODEX_CATALOG_SLOTS;
}

export const B1_NPC_CODEX_SLOTS: readonly CodexCatalogSlot[] = ALL_CODEX_CATALOG_SLOTS.filter(
  (slot) => slot.type === "npc" && slot.floor === "B1"
);

export const B1_NPC_CODEX_TOTAL = B1_NPC_CODEX_SLOTS.length;
