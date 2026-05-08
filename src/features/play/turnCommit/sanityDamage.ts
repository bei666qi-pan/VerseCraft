export function normalizeTurnSanityDamage(args: {
  rawDamage: unknown;
  isOpeningSystemRequest?: boolean;
  passiveMitigation?: boolean;
  activeMitigation?: boolean;
}): number {
  if (args.isOpeningSystemRequest) return 0;
  let damage =
    typeof args.rawDamage === "number" && Number.isFinite(args.rawDamage)
      ? Math.trunc(args.rawDamage)
      : Math.trunc(Number.parseInt(String(args.rawDamage ?? "0"), 10)) || 0;
  damage = Math.max(0, Math.min(9999, damage));
  if (args.passiveMitigation && damage > 0) damage = Math.max(0, damage - 1);
  if (args.activeMitigation && damage > 0) damage = Math.max(0, damage - 1);
  return damage;
}

export function applyTurnSanityDamage(args: {
  currentSanity: number;
  damage: number;
}): { nextSanity: number; triggerHitEffect: boolean } {
  const currentSanity = Number.isFinite(args.currentSanity) ? Math.max(0, Math.trunc(args.currentSanity)) : 0;
  const damage = Number.isFinite(args.damage) ? Math.max(0, Math.trunc(args.damage)) : 0;
  return {
    nextSanity: Math.max(0, currentSanity - damage),
    triggerHitEffect: damage > 0,
  };
}
