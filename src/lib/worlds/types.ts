export const WORLD_IDS = ["dark_moon_prologue", "xingni_taichu"] as const;
export type WorldId = (typeof WORLD_IDS)[number];

export const MAP_IDS = ["dark_moon_apartment", "xingni_qingshi_county", "xingni_qingyun_ferry"] as const;
export type MapId = (typeof MAP_IDS)[number];

export type WorldMapDefinition = {
  id: MapId;
  worldId: WorldId;
  name: string;
  description: string;
  available: boolean;
  initialLocationId: string;
};

export type WorldDefinition = {
  id: WorldId;
  name: string;
  subtitle: string;
  description: string;
  defaultMapId: MapId;
  maps: readonly MapId[];
};

export type WorldRuntimeResolution =
  | { ok: true; world: WorldDefinition; map: WorldMapDefinition }
  | { ok: false; code: "unknown_world" | "unknown_map" | "map_world_mismatch" | "world_disabled" | "map_unavailable"; message: string };

export const DARK_MOON_WORLD_ID: WorldId = "dark_moon_prologue";
export const DARK_MOON_MAP_ID: MapId = "dark_moon_apartment";
export const XINGNI_WORLD_ID: WorldId = "xingni_taichu";
export const QINGSHI_MAP_ID: MapId = "xingni_qingshi_county";
export const QINGYUN_FERRY_MAP_ID: MapId = "xingni_qingyun_ferry";
