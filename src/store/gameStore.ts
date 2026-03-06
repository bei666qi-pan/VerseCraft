"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

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

export interface GameState {
  currentSaveSlot: number;
  stats: GameStats;
  echoTalent: string | null;
  inventory: string[];
  isHydrated: boolean;
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
}

const initialState: GameState = {
  currentSaveSlot: 1,
  stats: { ...DEFAULT_STATS },
  echoTalent: null,
  inventory: [],
  isHydrated: false,
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
        }),
    }),
    {
      name: DB_KEY,
      skipHydration: true,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        currentSaveSlot: s.currentSaveSlot,
        stats: s.stats,
        echoTalent: s.echoTalent,
        inventory: s.inventory,
      }),
    }
  )
);
