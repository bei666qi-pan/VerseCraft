import type { SnapshotDeath } from "./types";

export function createDefaultDeathState(): SnapshotDeath {
  return {
    lastDeathLocation: null,
    lastDeathCause: null,
    reviveOffered: false,
    reviveConsumed: false,
    droppedLootLedger: [],
  };
}

export function normalizeDeathState(input: unknown): SnapshotDeath {
  const base = createDefaultDeathState();
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;
  const raw = input as Record<string, unknown>;
  return {
    lastDeathLocation:
      typeof raw.lastDeathLocation === "string" ? raw.lastDeathLocation : null,
    lastDeathCause:
      typeof raw.lastDeathCause === "string" ? raw.lastDeathCause : null,
    reviveOffered:
      typeof raw.reviveOffered === "boolean" ? raw.reviveOffered : false,
    reviveConsumed:
      typeof raw.reviveConsumed === "boolean" ? raw.reviveConsumed : false,
    droppedLootLedger: Array.isArray(raw.droppedLootLedger)
      ? raw.droppedLootLedger.filter((x): x is string => typeof x === "string")
      : [],
  };
}
