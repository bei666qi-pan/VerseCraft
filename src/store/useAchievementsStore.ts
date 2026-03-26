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

const VALID_GRADES = new Set<AchievementGrade>(["S", "A", "B", "C", "D", "E"]);

function normalizeGrade(g: string): AchievementGrade {
  const x = (g || "E").toUpperCase().slice(0, 1) as AchievementGrade;
  return VALID_GRADES.has(x) ? x : "E";
}

/** 与结算页展示一致的本机回退 */
function fallbackFloorLabel(score: number, stored: string): string {
  const t = (stored ?? "").trim();
  if (t) return t;
  if (score >= 99) return "地下二层出口";
  if (score <= 0) return "地下一层";
  return `第 ${score} 层`;
}

function compareRecords(a: AchievementRecord, b: AchievementRecord): number {
  const ga = GRADE_ORDER[a.grade] ?? 0;
  const gb = GRADE_ORDER[b.grade] ?? 0;
  if (gb !== ga) return gb - ga;
  if (b.maxFloor !== a.maxFloor) return b.maxFloor - a.maxFloor;
  if (b.kills !== a.kills) return b.kills - a.kills;
  return b.createdAt - a.createdAt;
}

export type RemoteHistoryRowForCache = {
  createdAt: string;
  grade: string;
  survivalDay: number;
  survivalHour: number;
  killedAnomalies: number;
  maxFloorScore: number;
  maxFloorLabel: string;
  recapSummary: string;
  aiRecapSummary: string | null;
};

interface AchievementsState {
  records: AchievementRecord[];
  addRecord: (record: Omit<AchievementRecord, "createdAt">) => void;
  /** 登录用户：把账号履历合并进本地展示（去重后截断，非权威数据源） */
  mergeRemoteHistoryPreview: (rows: RemoteHistoryRowForCache[]) => void;
}

const idbStorage = createResilientIdbStorage();

const LOCAL_PREVIEW_CAP = 15;

function dedupeRecords(records: AchievementRecord[]): AchievementRecord[] {
  const seen = new Set<string>();
  const out: AchievementRecord[] = [];
  for (const r of records) {
    const k = `${r.createdAt}|${r.grade}|${r.maxFloor}|${r.kills}|${r.survivalTimeText}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.sort(compareRecords);
}

export const useAchievementsStore = create<AchievementsState>()(
  persist(
    (set) => ({
      records: [],

      addRecord: (record) =>
        set((s) => {
          const full: AchievementRecord = { ...record, createdAt: Date.now() };
          return { records: dedupeRecords([...s.records, full]).slice(0, LOCAL_PREVIEW_CAP) };
        }),

      mergeRemoteHistoryPreview: (rows) =>
        set((s) => {
          const fromRemote: AchievementRecord[] = rows.map((it) => {
            const ts = Date.parse(it.createdAt);
            const createdAt = Number.isFinite(ts) ? ts : Date.now();
            const lines = (it.recapSummary ?? "").split("\n").filter(Boolean);
            const reviewLine1 = lines[0] ?? "";
            const reviewLine2 =
              it.aiRecapSummary?.trim() ||
              lines.slice(1).join("\n") ||
              "";
            return {
              survivalTimeText: `${Math.max(0, it.survivalDay)} 日 ${Math.max(0, it.survivalHour)} 时`,
              grade: normalizeGrade(it.grade),
              kills: Math.max(0, Math.trunc(it.killedAnomalies)),
              maxFloor: Math.max(0, Math.trunc(it.maxFloorScore)),
              maxFloorDisplay: fallbackFloorLabel(it.maxFloorScore, it.maxFloorLabel),
              reviewLine1,
              reviewLine2,
              createdAt,
            };
          });
          return { records: dedupeRecords([...fromRemote, ...s.records]).slice(0, LOCAL_PREVIEW_CAP) };
        }),
    }),
    {
      name: "versecraft-achievements",
      storage: createJSONStorage(() =>
        createDebouncedStorage(idbStorage, 500)
      ),
      partialize: (state) => ({ records: state.records ?? [] }),
      skipHydration: true,
    }
  )
);
