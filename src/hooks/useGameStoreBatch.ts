"use client";

import { useShallow } from "zustand/shallow";
import { useGameStore } from "@/store/useGameStore";
import type { GameState } from "@/store/useGameStore";
import type { StatType } from "@/lib/registry/types";
import { FALLBACK_STATS } from "@/features/play/playConstants";

/**
 * Pre-composed selector groups that batch multiple zustand selectors into a
 * single `useShallow` subscription, reducing excessive re-renders from
 * dozens of individual `useGameStore((s) => s.xxx)` calls.
 *
 * Groups are chosen so fields that typically update together live in the same
 * hook (e.g. combat fields change after a combat turn, UI chrome changes
 * after a menu interaction).
 */

// ---------------------------------------------------------------------------
// Group 1: Play UI chrome
// ---------------------------------------------------------------------------

export interface PlayUIState {
  isHydrated: boolean;
  isGameStarted: boolean;
  activeMenu: GameState["activeMenu"];
  inputMode: GameState["inputMode"];
  isGuest: boolean;
  guestId: string | null;
}

export function usePlayUIState(): Readonly<PlayUIState> {
  return useGameStore(
    useShallow((s) => ({
      isHydrated: s.isHydrated,
      isGameStarted: s.isGameStarted ?? false,
      activeMenu: s.activeMenu,
      inputMode: s.inputMode ?? "options",
      isGuest: s.isGuest ?? false,
      guestId: s.guestId ?? null,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 2: Player stats & talents
// ---------------------------------------------------------------------------

export interface PlayerStatsBundle {
  /** Defensively merged Record<StatType, number>; always non-null. */
  stats: Record<StatType, number>;
  rawStats: Record<StatType, number>;
  historicalMaxSanity: number;
  talent: GameState["talent"];
  talentCooldowns: GameState["talentCooldowns"];
  originium: number;
}

export function usePlayerStats(): Readonly<PlayerStatsBundle> {
  return useGameStore(
    useShallow((s) => {
      const rawStats = s.stats ?? FALLBACK_STATS;
      const safe: Record<StatType, number> = { ...FALLBACK_STATS };
      for (const key of Object.keys(FALLBACK_STATS) as StatType[]) {
        const v = rawStats[key];
        safe[key] = Number.isFinite(v) ? v : FALLBACK_STATS[key];
      }
      return {
        stats: safe,
        rawStats,
        historicalMaxSanity: s.historicalMaxSanity ?? 50,
        talent: s.talent,
        talentCooldowns: s.talentCooldowns ?? {},
        originium: s.originium ?? 0,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Group 3: AI options & pending client actions
// ---------------------------------------------------------------------------

export interface OptionsState {
  currentOptions: string[];
  recentOptions: string[];
  pendingClientAction: GameState["pendingClientAction"];
}

export function useOptionsState(): Readonly<OptionsState> {
  return useGameStore(
    useShallow((s) => ({
      currentOptions: s.currentOptions ?? [],
      recentOptions: s.recentOptions ?? [],
      pendingClientAction: s.pendingClientAction ?? null,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 4: Chapter & ending
// ---------------------------------------------------------------------------

export interface ChapterEndingState {
  chapterState: GameState["chapterState"];
  endingState: GameState["endingState"];
}

export function useChapterEndingState(): Readonly<ChapterEndingState> {
  return useGameStore(
    useShallow((s) => ({
      chapterState: s.chapterState,
      endingState: s.endingState,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 5: World / location / time
// ---------------------------------------------------------------------------

export interface WorldState {
  playerLocation: string;
  time: GameState["time"];
  dynamicNpcStates: GameState["dynamicNpcStates"];
  mainThreatByFloor: GameState["mainThreatByFloor"];
  intrusionFlashUntil: number;
  dialogueCount: number;
}

export function useWorldState(): Readonly<WorldState> {
  return useGameStore(
    useShallow((s) => ({
      playerLocation: s.playerLocation ?? "B1_SafeZone",
      time: s.time ?? { day: 0, hour: 0 },
      dynamicNpcStates: s.dynamicNpcStates ?? {},
      mainThreatByFloor: s.mainThreatByFloor ?? {},
      intrusionFlashUntil: s.intrusionFlashUntil ?? 0,
      dialogueCount: s.dialogueCount ?? 0,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 6: Codex
// ---------------------------------------------------------------------------

export interface CodexState {
  codex: GameState["codex"];
  viewedCodexIds: GameState["viewedCodexIds"];
  hasCheckedCodex: boolean;
}

export function useCodexState(): Readonly<CodexState> {
  return useGameStore(
    useShallow((s) => ({
      codex: s.codex ?? {},
      viewedCodexIds: s.viewedCodexIds ?? {},
      hasCheckedCodex: s.hasCheckedCodex ?? false,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 7: Inventory & warehouse
// ---------------------------------------------------------------------------

export interface InventoryState {
  inventory: GameState["inventory"];
  warehouse: GameState["warehouse"];
}

export function useInventoryState(): Readonly<InventoryState> {
  return useGameStore(
    useShallow((s) => ({
      inventory: s.inventory ?? [],
      warehouse: s.warehouse ?? [],
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 8: Task
// ---------------------------------------------------------------------------

export interface TaskState {
  tasks: GameState["tasks"];
  taskUnviewedCount: number;
  taskPanelFirstOpen: boolean;
}

export function useTaskState(): Readonly<TaskState> {
  return useGameStore(
    useShallow((s) => ({
      tasks: s.tasks ?? [],
      taskUnviewedCount: s._taskUnviewedCount ?? 0,
      taskPanelFirstOpen: s._taskPanelFirstOpen ?? true,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 9: Combat
// ---------------------------------------------------------------------------

export interface CombatState {
  equippedWeapon: GameState["equippedWeapon"];
  weaponBag: GameState["weaponBag"];
  combatSummariesV1: GameState["combatSummariesV1"];
  conflictTurnFeedback: GameState["conflictTurnFeedback"];
}

export function useCombatState(): Readonly<CombatState> {
  return useGameStore(
    useShallow((s) => ({
      equippedWeapon: s.equippedWeapon ?? null,
      weaponBag: s.weaponBag ?? [],
      combatSummariesV1: s.combatSummariesV1,
      conflictTurnFeedback: s.conflictTurnFeedback,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 10: Profession
// ---------------------------------------------------------------------------

export interface ProfessionState {
  professionState: GameState["professionState"];
  hasMetProfessionCertifier: boolean;
}

export function useProfessionState(): Readonly<ProfessionState> {
  return useGameStore(
    useShallow((s) => ({
      professionState: s.professionState,
      hasMetProfessionCertifier: s.hasMetProfessionCertifier ?? false,
    })),
  );
}

// ---------------------------------------------------------------------------
// Group 11: Save / settings
// ---------------------------------------------------------------------------

export interface SaveSettingsState {
  volume: number;
  readingPreferences: GameState["readingPreferences"];
  language: GameState["language"];
}

export function useSaveSettingsState(): Readonly<SaveSettingsState> {
  return useGameStore(
    useShallow((s) => ({
      volume: s.volume ?? 50,
      readingPreferences: s.readingPreferences,
      language: s.language,
    })),
  );
}
