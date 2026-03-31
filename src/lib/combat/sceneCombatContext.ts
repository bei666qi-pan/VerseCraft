import type { GameTime } from "@/store/useGameStore";
import type { MainThreatPhase, SceneCombatContext } from "./types";
import { B1_ABSOLUTE_SAFE_ROOMS } from "@/lib/registry/world";

function floorFromLocation(locationId: string): string {
  const t = String(locationId ?? "").trim();
  if (t.startsWith("B2_")) return "B2";
  if (t.startsWith("B1_")) return "B1";
  const m = t.match(/^(\d)F_/);
  return m ? m[1]! : "unknown";
}

function timeOfDay(time: GameTime | null | undefined): "day" | "night" {
  const h = Number(time?.hour);
  if (!Number.isFinite(h)) return "day";
  return h >= 19 || h <= 5 ? "night" : "day";
}

function phasePressure(phase: MainThreatPhase, floorId: string): number {
  if (floorId === "B1") return -1.0;
  if (phase === "idle") return 0;
  if (phase === "suppressed") return -0.3;
  if (phase === "active") return 0.8;
  return 1.2;
}

export function buildSceneCombatContext(args: {
  locationId: string;
  threatPhase: MainThreatPhase;
  time?: GameTime | null;
}): SceneCombatContext {
  const locationId = String(args.locationId ?? "").trim() || "unknown";
  const floorId = floorFromLocation(locationId);
  const tod = timeOfDay(args.time);
  const isSafeZone = B1_ABSOLUTE_SAFE_ROOMS.includes(locationId as any) || floorId === "B1";

  // 第一版：场景修正只做“压迫/遮蔽/退路”三轴，且保持轻量可解释
  const pressure = phasePressure(args.threatPhase, floorId) + (floorId === "7" ? 0.5 : floorId === "B2" ? 0.8 : 0);
  const concealment = tod === "night" ? 0.4 : 0;
  const footing = isSafeZone ? 0.7 : floorId === "7" ? -0.4 : 0;

  const notes: string[] = [];
  if (isSafeZone) notes.push("安全区：冲突更容易被压到“可控范围”。");
  if (tod === "night") notes.push("夜间：视线与动线更容易出错。");
  if (floorId === "7") notes.push("高层：退路更少，压迫感更重。");
  if (args.threatPhase === "breached") notes.push("威胁失控：任何冲突都更容易出代价。");

  return {
    locationId,
    floorId,
    threatPhase: args.threatPhase,
    isSafeZone,
    timeOfDay: tod,
    modifiers: { pressure, concealment, footing },
    notes,
  };
}

