import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";
import type { FloorId } from "@/lib/registry/types";

export type CodexCatalogSlotType = "npc" | "anomaly";

export type CodexCatalogSlot = {
  id: string;
  type: CodexCatalogSlotType;
  floor: FloorId | "random";
  displayName: string;
  fallbackLocation: string;
  quote?: string;
};

function floorLabel(floor: FloorId | "random"): string {
  if (floor === "B2") return "B2";
  if (floor === "B1") return "B1";
  if (floor === "random") return "流动楼层";
  return `${floor}F`;
}

const CODEX_SLOT_QUOTES: Partial<Record<string, string>> = {
  "N-008": "别乱碰开关，线路会记住你的房间号。",
};

const NPC_CODEX_SLOTS: CodexCatalogSlot[] = NPCS.map((npc) => ({
  id: npc.id,
  type: "npc",
  floor: npc.floor,
  displayName: npc.name,
  fallbackLocation: npc.location,
  quote: CODEX_SLOT_QUOTES[npc.id],
}));

const ANOMALY_CODEX_SLOTS: CodexCatalogSlot[] = ANOMALIES.map((anomaly) => ({
  id: anomaly.id,
  type: "anomaly",
  floor: anomaly.floor,
  displayName: anomaly.name,
  fallbackLocation: `${floorLabel(anomaly.floor)} 主威胁`,
}));

export const ALL_CODEX_CATALOG_SLOTS: readonly CodexCatalogSlot[] = [
  ...NPC_CODEX_SLOTS,
  ...ANOMALY_CODEX_SLOTS,
] as const;

export const B1_NPC_CODEX_SLOTS: readonly CodexCatalogSlot[] = ALL_CODEX_CATALOG_SLOTS.filter(
  (slot) => slot.type === "npc" && slot.floor === "B1"
);

export const B1_NPC_CODEX_TOTAL = B1_NPC_CODEX_SLOTS.length;
