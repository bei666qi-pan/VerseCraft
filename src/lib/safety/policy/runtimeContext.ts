import type { SafetyRuntimeContext } from "@/lib/safety/policy/model";

/**
 * Build minimal SafetyRuntimeContext from the runtime packet object produced by `buildRuntimeContextPackets`.
 * This keeps safety policy independent from prompt formatting.
 */
export function buildSafetyRuntimeContextFromPackets(packets: Record<string, unknown>): SafetyRuntimeContext {
  const locPacket = packets["current_location_packet"];
  const loc = locPacket && typeof locPacket === "object" && !Array.isArray(locPacket) ? (locPacket as Record<string, unknown>) : {};

  const mainThreatPacket = packets["main_threat_packet"];
  const mainThreat =
    mainThreatPacket && typeof mainThreatPacket === "object" && !Array.isArray(mainThreatPacket)
      ? (mainThreatPacket as Record<string, unknown>)
      : {};

  const activeTasksPacket = packets["active_tasks_packet"];
  const activeTasks = Array.isArray(activeTasksPacket) ? activeTasksPacket.map((x) => String(x)).slice(0, 12) : [];

  const nearbyNpcPacket = packets["nearby_npc_packet"];
  const nearbyNpcIds = Array.isArray(nearbyNpcPacket) ? nearbyNpcPacket.map((x) => String(x)).slice(0, 12) : [];

  const locationId = typeof loc.location === "string" ? loc.location : null;
  const floorId =
    typeof mainThreat.floorId === "string"
      ? mainThreat.floorId
      : typeof locationId === "string" && locationId.includes("_")
        ? locationId.split("_")[0] ?? null
        : null;

  const isB1SafeZone = Boolean(locationId && String(locationId).startsWith("B1"));

  return {
    locationId,
    floorId,
    isB1SafeZone,
    threat: {
      activeThreatId: typeof mainThreat.activeThreatId === "string" ? mainThreat.activeThreatId : null,
      phase: typeof mainThreat.phase === "string" ? mainThreat.phase : null,
      suppressionProgress: typeof mainThreat.suppressionProgress === "number" ? mainThreat.suppressionProgress : null,
    },
    activeTasks,
    nearbyNpcIds,
    worldFlags: [],
    isPublic: false,
  };
}

