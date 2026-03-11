"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createResilientIdbStorage } from "@/lib/resilientStorage";
import { createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/idbDebouncedStorage";

export type AchievementGrade = "S" | "A" | "B" | "C" | "D" | "E";

export interface AchievementRecord {
  survivalTimeText: string;
  grade: AchievementGrade;
  kills: number;
  maxFloor: number;
  maxFloorDisplay: string;
  reviewLine1: string;
  reviewLine2: string;
  /** Timestamp for deterministic ordering when grades equal */
  createdAt: number;
}

const GRADE_ORDER: Record<AchievementGrade, number> = {
  S: 6,
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
};

function compareRecords(a: AchievementRecord, b: AchievementRecord): number {
  const ga = GRADE_ORDER[a.grade] ?? 0;
  const gb = GRADE_ORDER[b.grade] ?? 0;
  if (gb !== ga) return gb - ga;
  if (b.maxFloor !== a.maxFloor) return b.maxFloor - a.maxFloor;
  if (b.kills !== a.kills) return b.kills - a.kills;
  return b.createdAt - a.createdAt;
}

interface AchievementsState {
  records: AchievementRecord[];
  addRecord: (record: Omit<AchievementRecord, "createdAt">) => void;
}

const idbStorage = createResilientIdbStorage();

export const useAchievementsStore = create<AchievementsState>()(
  persist(
    (set) => ({
      records: [],

      addRecord: (record) =>
        set((s) => {
          const full: AchievementRecord = { ...record, createdAt: Date.now() };
          const merged = [...s.records, full].sort(compareRecords);
          return { records: merged.slice(0, 5) };
        }),
    }),
    {
      name: "versecraft-achievements",
      storage: createJSONStorage(() =>
        createDebouncedStorage(idbStorage, 500)
      ),
      partialize: (state) => ({ records: state.records }),
    }
  )
);
