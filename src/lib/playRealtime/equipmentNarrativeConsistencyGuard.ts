type RecordLike = Record<string, unknown>;

const INVENTED_EQUIPPED_ORIGIN_RE =
  /(?:(手里(?:的)?(?:铁管|武器)|(?:铁管|武器))\s*[—-]+\s*从[^，。；\n]{0,32}(?:捡|拾|拿|找到)[^，。；\n]{0,20}|(?:三楼)?消防箱里(?:顺|偷|捡|摸)?来的(?:那根)?(?:铁管)?)/gu;

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
  const hasKnownWeapon = Boolean(equipped || bagCount > 0);
  if (!hasKnownWeapon) return args.dmRecord;

  let nextNarrative = narrative;
  let changed = false;
  if (INVENTED_EQUIPPED_ORIGIN_RE.test(nextNarrative)) {
    nextNarrative = nextNarrative.replace(INVENTED_EQUIPPED_ORIGIN_RE, (_match, namedWeapon: string | undefined) => namedWeapon || "手里的铁管");
    changed = true;
  }
  if (!deniesWeapon) {
    if (!changed) return args.dmRecord;
    const flags = Array.isArray(args.dmRecord._commit_flags)
      ? args.dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
      : [];
    return { ...args.dmRecord, narrative: nextNarrative, _commit_flags: [...new Set([...flags, "equipped_weapon_origin_prose_removed_v1"])] };
  }

  const replacement = equipped ? "武器仍在手中" : "武器尚未装备，但仍在武器袋中";
  const flags = Array.isArray(args.dmRecord._commit_flags)
    ? args.dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  return {
    ...args.dmRecord,
    narrative: nextNarrative.replace(/(?:没有|没)(?:有)?(?:任何|一把|可用的)?武器/g, replacement),
    _commit_flags: [...new Set([...flags, "weapon_absence_prose_corrected_v1", ...(changed ? ["equipped_weapon_origin_prose_removed_v1"] : [])])],
  };
}
