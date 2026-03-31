import type { MainThreatPhase } from "@/lib/playRealtime/stage2Packets";

export type SurvivalLoopState = {
  safeZone: boolean;
  hotThreat: boolean;
  hotThreatFloors: string[];
  weaponNeedsMaintenance: boolean;
  originium: number;
  timePressure: "low" | "mid" | "high";
};

export type RelationshipLoopState = {
  promiseCount: number;
  activeTaskCount: number;
  debtNpcs: number;
  certifierInSight: boolean;
  leverageHint: string;
};

export type InvestigationLoopState = {
  codexNpcCount: number;
  codexAnomalyCount: number;
  hasHotThreat: boolean;
  truthChainHint: string;
  nextValidationHint: string;
};

export function inferTimePressure(args: { day: number | null; hour: number | null }): SurvivalLoopState["timePressure"] {
  const day = typeof args.day === "number" ? args.day : 0;
  if (day >= 8) return "high";
  if (day >= 4) return "mid";
  return "low";
}

export function isHotThreatPhase(phase: MainThreatPhase | string): boolean {
  return phase === "active" || phase === "suppressed" || phase === "breached";
}

