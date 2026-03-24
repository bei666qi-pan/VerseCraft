import type { InfusionState } from "@/lib/registry/types";

export function tickInfusions(current: InfusionState[] | null | undefined): InfusionState[] {
  const safe = Array.isArray(current) ? current : [];
  return safe
    .map((x) => ({
      threatTag: x.threatTag,
      turnsLeft: Math.max(0, Math.trunc(Number(x.turnsLeft ?? 0)) - 1),
    }))
    .filter((x) => x.turnsLeft > 0);
}

