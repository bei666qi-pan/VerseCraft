import type { Weapon } from "./types";

/** Stage-2 minimal weapon catalog: low-count, strategy-first, no rarity explosion. */
export const WEAPONS: readonly Weapon[] = [
  {
    id: "WPN-001",
    name: "静默短棍",
    description: "抑制声响与误触，适合对抗听觉锁定型主威胁。",
    counterThreatIds: ["A-002"],
    counterTags: ["sound", "silence"],
    stability: 80,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
  },
  {
    id: "WPN-002",
    name: "时针刺",
    description: "用于打断局部时间错位，适合对抗时间扭曲主威胁。",
    counterThreatIds: ["A-001"],
    counterTags: ["time", "anchor"],
    stability: 75,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
  },
  {
    id: "WPN-003",
    name: "镜背匕",
    description: "借镜像反射确认方位，适合对抗倒行与镜像相关主威胁。",
    counterThreatIds: ["A-006"],
    counterTags: ["mirror", "direction"],
    stability: 70,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
  },
  {
    id: "WPN-004",
    name: "封缄钉",
    description: "用于临时封缄门缝与裂隙，适合对抗门扉执念型主威胁。",
    counterThreatIds: ["A-007"],
    counterTags: ["seal", "door"],
    stability: 65,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
  },
] as const;

export function getWeaponById(id: string | null | undefined): Weapon | null {
  if (!id) return null;
  return WEAPONS.find((x) => x.id === id) ?? null;
}

