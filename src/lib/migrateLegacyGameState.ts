// One-shot migration from pre-unification `versecraft-game-state` (legacy UI+bootstrap store).
// Preserves user volume preference only; legacy gameplay fields were superseded by `versecraft-storage`.

import { del, get } from "idb-keyval";
import { useGameStore } from "@/store/useGameStore";

const LEGACY_PERSIST_KEY = "versecraft-game-state";

function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function migrateLegacyVersecraftGameStateVolume(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const raw = await get(LEGACY_PERSIST_KEY);
    if (typeof raw !== "string" || !raw.trim()) return;
    const parsed = JSON.parse(raw) as { state?: { volume?: unknown } } | null;
    const vol = parsed?.state?.volume;
    if (typeof vol === "number") {
      useGameStore.getState().setVolume(clampVolume(vol));
    }
    await del(LEGACY_PERSIST_KEY);
  } catch {
    /* ignore: corrupt legacy payload or IDB unavailable */
  }
}
