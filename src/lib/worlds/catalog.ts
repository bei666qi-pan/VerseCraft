import { envBoolean } from "@/lib/config/envRaw";
import type { MapId, WorldDefinition, WorldId, WorldMapDefinition, WorldRuntimeResolution } from "./types";
import {
  DARK_MOON_MAP_ID,
  DARK_MOON_WORLD_ID,
  QINGSHI_MAP_ID,
  QINGYUN_FERRY_MAP_ID,
  XINGNI_WORLD_ID,
} from "./types";

export const WORLD_CATALOG: Record<WorldId, WorldDefinition> = {
  dark_moon_prologue: {
    id: DARK_MOON_WORLD_ID,
    name: "序章·暗月",
    subtitle: "异常公寓生存叙事",
    description: "在如月公寓的异常楼层中求生，寻找真正的出口。",
    defaultMapId: DARK_MOON_MAP_ID,
    maps: [DARK_MOON_MAP_ID],
  },
  xingni_taichu: {
    id: XINGNI_WORLD_ID,
    name: "星逆·太初",
    subtitle: "东方玄幻修仙世界",
    description: "从偏远县城重踏仙途。青石县只是太初浩土当前开放的第一站。",
    defaultMapId: QINGSHI_MAP_ID,
    maps: [QINGSHI_MAP_ID, QINGYUN_FERRY_MAP_ID],
  },
};

export const WORLD_MAP_CATALOG: Record<MapId, WorldMapDefinition> = {
  dark_moon_apartment: {
    id: DARK_MOON_MAP_ID,
    worldId: DARK_MOON_WORLD_ID,
    name: "如月公寓",
    description: "序章·暗月当前地图。",
    available: true,
    initialLocationId: "B1_SafeZone",
  },
  xingni_qingshi_county: {
    id: QINGSHI_MAP_ID,
    worldId: XINGNI_WORLD_ID,
    name: "青石县",
    description: "太初浩土东南边陲的一座偏远小县，也是落魄散修重返仙途的起点。",
    available: true,
    initialLocationId: "QS_GUOYAN_INN",
  },
  xingni_qingyun_ferry: {
    id: QINGYUN_FERRY_MAP_ID,
    worldId: XINGNI_WORLD_ID,
    name: "青云渡",
    description: "通往更广阔修真地域的渡口，尚未开放。",
    available: false,
    initialLocationId: "QY_FERRY_GATE",
  },
};

export function isWorldId(value: unknown): value is WorldId {
  return typeof value === "string" && Object.hasOwn(WORLD_CATALOG, value);
}

export function isMapId(value: unknown): value is MapId {
  return typeof value === "string" && Object.hasOwn(WORLD_MAP_CATALOG, value);
}

export function isXingniWorldEnabled(): boolean {
  return envBoolean("VERSECRAFT_ENABLE_XINGNI_TAICHU_WORLD", true);
}

export function resolveWorldRuntime(
  worldId: unknown,
  mapId: unknown,
  options: { allowLockedMap?: boolean; xingniEnabled?: boolean } = {}
): WorldRuntimeResolution {
  if (!isWorldId(worldId)) return { ok: false, code: "unknown_world", message: "未知世界，无法进入本回合。" };
  if (!isMapId(mapId)) return { ok: false, code: "unknown_map", message: "未知地图，无法进入本回合。" };
  const world = WORLD_CATALOG[worldId];
  const map = WORLD_MAP_CATALOG[mapId];
  if (map.worldId !== world.id) return { ok: false, code: "map_world_mismatch", message: "地图不属于当前世界。" };
  const xingniEnabled = options.xingniEnabled ?? isXingniWorldEnabled();
  if (world.id === XINGNI_WORLD_ID && !xingniEnabled) {
    return { ok: false, code: "world_disabled", message: "星逆·太初暂未开放，存档已安全保留。" };
  }
  if (!map.available && !options.allowLockedMap) {
    return { ok: false, code: "map_unavailable", message: `${map.name}尚未开放。` };
  }
  return { ok: true, world, map };
}

export function normalizeWorldIdentity(value: { worldId?: unknown; mapId?: unknown } | null | undefined): { worldId: WorldId; mapId: MapId } {
  const worldId = isWorldId(value?.worldId) ? value.worldId : DARK_MOON_WORLD_ID;
  const candidateMapId = isMapId(value?.mapId) ? value.mapId : WORLD_CATALOG[worldId].defaultMapId;
  return WORLD_MAP_CATALOG[candidateMapId].worldId === worldId
    ? { worldId, mapId: candidateMapId }
    : { worldId, mapId: WORLD_CATALOG[worldId].defaultMapId };
}
