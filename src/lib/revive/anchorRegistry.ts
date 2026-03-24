export type AnchorId = "ANCHOR_B1" | "ANCHOR_1F" | "ANCHOR_7F";

export interface AnchorDefinition {
  id: AnchorId;
  nodeId: "B1_SafeZone" | "1F_Lobby" | "7F_Bench";
  floorTier: "B1" | "1" | "7";
  label: string;
}

export const ANCHOR_REGISTRY: readonly AnchorDefinition[] = [
  { id: "ANCHOR_B1", nodeId: "B1_SafeZone", floorTier: "B1", label: "B1 安全锚点" },
  { id: "ANCHOR_1F", nodeId: "1F_Lobby", floorTier: "1", label: "1F 门厅锚点" },
  { id: "ANCHOR_7F", nodeId: "7F_Bench", floorTier: "7", label: "7F 长椅锚点" },
] as const;

export function mapAnchorUnlocksToEnabledAnchors(anchorUnlocks: Record<"B1" | "1" | "7", boolean>): AnchorDefinition[] {
  const allowed = new Set<string>();
  if (anchorUnlocks.B1) allowed.add("B1");
  if (anchorUnlocks["1"]) allowed.add("1");
  if (anchorUnlocks["7"]) allowed.add("7");
  return ANCHOR_REGISTRY.filter((a) => allowed.has(a.floorTier));
}
