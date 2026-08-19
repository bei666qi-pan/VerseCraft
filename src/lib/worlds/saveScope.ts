import { DARK_MOON_MAP_ID, DARK_MOON_WORLD_ID, XINGNI_WORLD_ID, type WorldId } from "./types";

export const DARK_MOON_MAIN_SLOT_ID = "main_slot";
export const XINGNI_MAIN_SLOT_ID = "main:xingni_taichu";

export function getMainSaveSlotId(worldId: WorldId): string {
  return worldId === XINGNI_WORLD_ID ? XINGNI_MAIN_SLOT_ID : DARK_MOON_MAIN_SLOT_ID;
}

export function getWorldIdForSlot(slotId: string): WorldId {
  return slotId === XINGNI_MAIN_SLOT_ID ? XINGNI_WORLD_ID : DARK_MOON_WORLD_ID;
}

export const LEGACY_WORLD_IDENTITY = { worldId: DARK_MOON_WORLD_ID, mapId: DARK_MOON_MAP_ID } as const;
