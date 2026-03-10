"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import { createDebouncedStorage } from "@/lib/idbDebouncedStorage";

const DB_KEY = "versecraft-game-state";

const idbStorage: import("zustand/middleware").StateStorage = {
  getItem: async (name: string) => {
    try {
      const value = await get(name);
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await set(name, value);
    } catch {
      // ignore
    }
  },
  removeItem: async (name: string) => {
    try {
      await del(name);
    } catch {
      // ignore
    }
  },
};

export interface GameStats {
  sanity: number;
  agility: number;
  luck: number;
  charm: number;
  background: number;
}

export type ActiveMenu = "settings" | "backpack" | "codex" | "warehouse" | "tasks" | null;

const RECENT_OPTIONS_MAX = 8;

export interface GameState {
  currentSaveSlot: number;
  stats: GameStats;
  echoTalent: string | null;
  inventory: string[];
  isHydrated: boolean;
  /** Past 2 rounds of generated options (max 8), for anti-loop. */
  recentOptions: string;
  /** Unified modal/panel state: null = all closed. */
  activeMenu: ActiveMenu;
  /** Volume 0–100, for audioEngine binding. */
  volume: number;
  /** Input mode: options = 4-choice cards, text = manual input. Persisted for load restore. */
  inputMode: "options" | "text";
  /** Current 4 options from last DM response. Persisted for load restore. */
  currentOptions: string[];
}

const DEFAULT_STATS: GameStats = {
  sanity: 0,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};

interface GameActions {
  setCurrentSaveSlot: (slot: number) => void;
  setStats: (stats: Partial<GameStats>) => void;
  setEchoTalent: (talent: string | null) => void;
  setInventory: (inventory: string[]) => void;
  addToInventory: (item: string) => void;
  removeFromInventory: (item: string) => void;
  setHydrated: (hydrated: boolean) => void;
  resetGame: () => void;
  /** Append new options to recentOptions, trim to max 8. */
  appendRecentOptions: (options: string[]) => void;
  setActiveMenu: (menu: ActiveMenu) => void;
  setVolume: (volume: number) => void;
  setInputMode: (mode: "options" | "text") => void;
  setCurrentOptions: (options: string[]) => void;
  /** 物理级清档：清空 inventory、inputMode、currentOptions，配合 useGameStore.destroySaveData 使用。 */
  destroySaveData: () => void;
}

const initialState: GameState = {
  currentSaveSlot: 1,
  stats: { ...DEFAULT_STATS },
  echoTalent: null,
  inventory: [],
  isHydrated: false,
  recentOptions: "",
  activeMenu: null,
  volume: 50,
  inputMode: "options" as const,
  currentOptions: [],
};

export const useGameStore = create<GameState & GameActions>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentSaveSlot: (slot) => set({ currentSaveSlot: slot }),

      setStats: (stats) =>
        set((state) => ({
          stats: { ...state.stats, ...stats },
        })),

      setEchoTalent: (talent) => set({ echoTalent: talent }),

      setInventory: (inventory) => set({ inventory }),

      addToInventory: (item) =>
        set((state) => ({
          inventory: state.inventory.includes(item)
            ? state.inventory
            : [...state.inventory, item],
        })),

      removeFromInventory: (item) =>
        set((state) => ({
          inventory: state.inventory.filter((i) => i !== item),
        })),

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),

      resetGame: () =>
        set({
          stats: { ...DEFAULT_STATS },
          echoTalent: null,
          inventory: [],
          recentOptions: "",
        }),

      appendRecentOptions: (options) =>
        set((state) => {
          const sep = "\u0001";
          const prev = (state.recentOptions || "").split(sep).filter(Boolean);
          const next = [...prev, ...options].slice(-RECENT_OPTIONS_MAX);
          return { recentOptions: next.join(sep) };
        }),

      setActiveMenu: (menu) => set({ activeMenu: menu }),

      setVolume: (vol) => set({ volume: Math.max(0, Math.min(100, vol)) }),

      setInputMode: (mode) => set({ inputMode: mode }),

      setCurrentOptions: (opts) =>
        set({ currentOptions: Array.isArray(opts) ? opts.slice(0, 4) : [] }),

      destroySaveData: () =>
        set({
          inventory: [],
          inputMode: "options" as const,
          currentOptions: [],
        }),
    }),
    {
      name: DB_KEY,
      skipHydration: true,
      storage: createJSONStorage(() => createDebouncedStorage(idbStorage, 1000)),
      partialize: (s) => ({
        currentSaveSlot: s.currentSaveSlot,
        stats: s.stats,
        echoTalent: s.echoTalent,
        inventory: s.inventory,
        inputMode: s.inputMode ?? "options",
        currentOptions: s.currentOptions ?? [],
      }),
    }
  )
);
