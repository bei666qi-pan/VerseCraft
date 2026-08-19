import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

export type BenchmarkClientStateOverrides = Partial<ClientStructuredContextV1>;

const DEFAULT_BENCHMARK_CLIENT_STATE: ClientStructuredContextV1 = {
  v: 1,
  turnIndex: 0,
  playerLocation: "3F_Hallway",
  stats: { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 },
  time: { day: 1, hour: 8 },
  originium: 10,
  inventoryItemIds: [],
  warehouseItemIds: [],
  equippedWeapon: null,
  weaponBag: [],
  currentProfession: null,
  worldFlags: [],
};

/**
 * Builds the same structured state shape sent by the real client. Benchmark
 * fixtures may grant only the authority needed by that scenario; the default
 * deliberately owns no items, tasks, threats, or NPC presence.
 */
export function buildBenchmarkClientState(
  overrides: BenchmarkClientStateOverrides | undefined,
): ClientStructuredContextV1 {
  return {
    ...DEFAULT_BENCHMARK_CLIENT_STATE,
    ...overrides,
    stats: overrides?.stats ?? { ...DEFAULT_BENCHMARK_CLIENT_STATE.stats! },
    time: overrides?.time ?? { ...DEFAULT_BENCHMARK_CLIENT_STATE.time! },
    inventoryItemIds: [...(overrides?.inventoryItemIds ?? [])],
    warehouseItemIds: [...(overrides?.warehouseItemIds ?? [])],
    weaponBag: [...(overrides?.weaponBag ?? [])],
    worldFlags: [...(overrides?.worldFlags ?? [])],
  };
}
