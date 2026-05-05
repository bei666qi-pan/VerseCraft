export const MAX_VISIBLE_SAVE_SLOTS = 5;

export function isAutoSaveSlotId(slotId: string): boolean {
  return slotId === "auto_main" || slotId.startsWith("auto_");
}

export function getAutoSaveSlotId(slotId: string): string {
  return slotId === "main_slot" ? "auto_main" : `auto_${slotId}`;
}

function readIsoFromPath(value: unknown, path: string[]): string | null {
  let cursor = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : null;
}

export function getSaveSlotTimestamp(data: unknown, fallbackIso?: string | null): number {
  const candidates = [
    readIsoFromPath(data, ["slotMeta", "updatedAt"]),
    readIsoFromPath(data, ["runSnapshotV2", "meta", "lastSavedAt"]),
    readIsoFromPath(data, ["updatedAt"]),
    fallbackIso ?? null,
  ];
  for (const iso of candidates) {
    if (!iso) continue;
    const ts = Date.parse(iso);
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

export function pruneVisibleSaveSlots<T>(
  slots: Record<string, T>,
  options?: {
    maxVisible?: number;
    keepSlotIds?: string[];
    getUpdatedAt?: (slotId: string, data: T) => number;
  }
): Record<string, T> {
  const maxVisible = Math.max(1, Math.trunc(options?.maxVisible ?? MAX_VISIBLE_SAVE_SLOTS));
  const keepSlotIds = new Set((options?.keepSlotIds ?? []).filter(Boolean));
  const entries = Object.entries(slots ?? {});
  const visible = entries
    .filter(([slotId]) => !isAutoSaveSlotId(slotId))
    .sort((a, b) => {
      const tb = options?.getUpdatedAt?.(b[0], b[1]) ?? getSaveSlotTimestamp(b[1]);
      const ta = options?.getUpdatedAt?.(a[0], a[1]) ?? getSaveSlotTimestamp(a[1]);
      if (tb !== ta) return tb - ta;
      return a[0].localeCompare(b[0]);
    });

  const selected = new Set<string>();
  for (const [slotId] of visible) {
    if (keepSlotIds.has(slotId)) selected.add(slotId);
  }
  for (const [slotId] of visible) {
    if (selected.size >= maxVisible) break;
    selected.add(slotId);
  }

  const out: Record<string, T> = {};
  for (const [slotId, data] of entries) {
    if (!isAutoSaveSlotId(slotId)) {
      if (selected.has(slotId)) out[slotId] = data;
      continue;
    }

    const parentSlotId = slotId === "auto_main" ? "main_slot" : slotId.slice("auto_".length);
    if (selected.has(parentSlotId)) out[slotId] = data;
  }
  return out;
}
