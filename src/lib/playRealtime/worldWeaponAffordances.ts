import type { Weapon } from "@/lib/registry/types";

const THREE_FLOOR_IRON_PIPE: Weapon = {
  id: "WPN-3F-IRON-PIPE",
  name: "三楼铁管",
  description: "304 门外消防栓旁遗落的镀锌铁管，握柄缠着褪色胶布。",
  counterThreatIds: [], counterTags: ["blunt", "improvised"], stability: 72,
  calibratedThreatId: null, modSlots: ["core", "surface"], currentMods: [], currentInfusions: [],
  contamination: 0, repairable: true, equipSlot: "weapon_main", equipTimeCostTurns: 1,
};

/** World-authored, finite weapon drops. Never infer a weapon from prose. */
export function applyWorldWeaponPickupGuard(args: {
  dmRecord: Record<string, unknown>; latestUserInput: string; clientState: { playerLocation?: string; weaponBag?: Array<Record<string, unknown>>; equippedWeapon?: unknown; worldFlags?: string[] } | null;
}): Record<string, unknown> {
  const state = args.clientState;
  const location = String(state?.playerLocation ?? "");
  const action = String(args.latestUserInput ?? "");
  const claimed = Array.isArray(state?.worldFlags) && state!.worldFlags.includes("pickup:WPN-3F-IRON-PIPE");
  const equippedId = state?.equippedWeapon && typeof state.equippedWeapon === "object" && !Array.isArray(state.equippedWeapon)
    ? String((state.equippedWeapon as Record<string, unknown>).id ?? "")
    : "";
  const alreadyOwned = equippedId === THREE_FLOOR_IRON_PIPE.id || (Array.isArray(state?.weaponBag) && state!.weaponBag.some((weapon) => weapon?.id === THREE_FLOOR_IRON_PIPE.id));
  if (claimed || alreadyOwned || !/(3F|三楼|304)/.test(location) || !/(拿起|拾取|捡起|捡|取走).{0,12}(铁管|钢管)|(?:铁管|钢管).{0,12}(拿起|拾取|捡起|捡|取走)/.test(action)) return args.dmRecord;
  const updates = Array.isArray(args.dmRecord.weapon_bag_updates) ? args.dmRecord.weapon_bag_updates : [];
  return { ...args.dmRecord, weapon_bag_updates: [...updates, { addWeapon: THREE_FLOOR_IRON_PIPE }], world_flag_updates: [...(Array.isArray(args.dmRecord.world_flag_updates) ? args.dmRecord.world_flag_updates : []), "pickup:WPN-3F-IRON-PIPE"] };
}
