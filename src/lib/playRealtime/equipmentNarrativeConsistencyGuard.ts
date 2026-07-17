type RecordLike = Record<string, unknown>;

/** Keeps player-visible prose aligned with authoritative equipped/bag state. */
export function applyEquipmentNarrativeConsistencyGuard(args: {
  dmRecord: RecordLike;
  clientState?: { equippedWeapon?: RecordLike | null; weaponBag?: RecordLike[] } | null;
}): RecordLike {
  const narrative = typeof args.dmRecord.narrative === "string" ? args.dmRecord.narrative : "";
  if (!narrative) return args.dmRecord;
  const equipped = args.clientState?.equippedWeapon;
  const bagCount = Array.isArray(args.clientState?.weaponBag) ? args.clientState!.weaponBag!.length : 0;
  const deniesWeapon = /(?:没有|没)(?:有)?(?:任何|一把|可用的)?武器/.test(narrative);
  if (!deniesWeapon || (!equipped && bagCount === 0)) return args.dmRecord;

  const replacement = equipped ? "武器仍在手中" : "武器尚未装备，但仍在武器袋中";
  const next = {
    ...args.dmRecord,
    narrative: narrative.replace(/(?:没有|没)(?:有)?(?:任何|一把|可用的)?武器/g, replacement),
  };
  const flags = Array.isArray(args.dmRecord._commit_flags)
    ? args.dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  next._commit_flags = [...new Set([...flags, "weapon_absence_prose_corrected_v1"])];
  return next;
}
