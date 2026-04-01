import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import type { ActiveMenu, CodexEntry, GameState, GameTask } from "@/store/useGameStore";
import type { ConflictFeedbackViewModel } from "@/lib/play/conflictFeedbackPresentation";
import type { SaveSlotData } from "@/lib/state/schema";
import type { SnapshotMainThreatState } from "@/lib/state/snapshot/types";

export type StoreGovernanceLayers = {
  playerSurface: {
    playerName: string;
    stats: GameState["stats"];
    time: GameState["time"];
    originium: number;
    playerLocation: string;
    currentOptions: string[];
    inputMode: GameState["inputMode"];
    isGameStarted: boolean;
    currentBgm: string;
    volume: number;
    activeMenu: ActiveMenu;
  };
  turnResult: {
    logs: GameState["logs"];
    tasks: GameTask[];
    journalClues: ClueEntry[];
    conflictTurnFeedback: ConflictFeedbackViewModel | null;
    securityFallback: GameState["securityFallback"];
  };
  supportPlane: {
    memorySpine: GameState["memorySpine"];
    storyDirector: GameState["storyDirector"];
    incidentQueue: GameState["incidentQueue"];
    escapeMainline: GameState["escapeMainline"];
    professionState: GameState["professionState"];
    codex: Record<string, CodexEntry>;
    mainThreatByFloor: Record<string, SnapshotMainThreatState>;
  };
  persistenceCore: Pick<
    GameState,
    | "currentSaveSlot"
    | "saveSlots"
    | "user"
    | "guestId"
    | "isGuest"
    | "playerName"
    | "stats"
    | "inventory"
    | "tasks"
    | "journalClues"
    | "playerLocation"
    | "dynamicNpcStates"
    | "mainThreatByFloor"
    | "equippedWeapon"
    | "weaponBag"
    | "memorySpine"
    | "storyDirector"
    | "incidentQueue"
    | "escapeMainline"
    | "professionState"
  >;
  runtimeOnly: {
    isHydrated: boolean;
    recentOptions: string[];
    intrusionFlashUntil: number;
    pendingClientAction: GameState["pendingClientAction"];
    conflictTurnFeedback: ConflictFeedbackViewModel | null;
    professionNarrativeCues: GameState["professionNarrativeCues"];
    combatSummariesV1: GameState["combatSummariesV1"];
    sceneNpcAppearanceLedger: GameState["sceneNpcAppearanceLedger"];
  };
};

export function selectPlayerSurfaceState(s: GameState): StoreGovernanceLayers["playerSurface"] {
  return {
    playerName: s.playerName,
    stats: s.stats,
    time: s.time,
    originium: s.originium,
    playerLocation: s.playerLocation,
    currentOptions: s.currentOptions,
    inputMode: s.inputMode,
    isGameStarted: s.isGameStarted,
    currentBgm: s.currentBgm,
    volume: s.volume,
    activeMenu: s.activeMenu,
  };
}

export function selectTurnResultState(s: GameState): StoreGovernanceLayers["turnResult"] {
  return {
    logs: s.logs,
    tasks: s.tasks,
    journalClues: s.journalClues,
    conflictTurnFeedback: s.conflictTurnFeedback,
    securityFallback: s.securityFallback,
  };
}

export function selectSupportPlaneState(s: GameState): StoreGovernanceLayers["supportPlane"] {
  return {
    memorySpine: s.memorySpine,
    storyDirector: s.storyDirector,
    incidentQueue: s.incidentQueue,
    escapeMainline: s.escapeMainline,
    professionState: s.professionState,
    codex: s.codex,
    mainThreatByFloor: s.mainThreatByFloor,
  };
}

export function selectPersistenceCoreState(s: GameState): StoreGovernanceLayers["persistenceCore"] {
  return {
    currentSaveSlot: s.currentSaveSlot,
    saveSlots: s.saveSlots,
    user: s.user,
    guestId: s.guestId,
    isGuest: s.isGuest,
    playerName: s.playerName,
    stats: s.stats,
    inventory: s.inventory,
    tasks: s.tasks,
    journalClues: s.journalClues,
    playerLocation: s.playerLocation,
    dynamicNpcStates: s.dynamicNpcStates,
    mainThreatByFloor: s.mainThreatByFloor,
    equippedWeapon: s.equippedWeapon,
    weaponBag: s.weaponBag,
    memorySpine: s.memorySpine,
    storyDirector: s.storyDirector,
    incidentQueue: s.incidentQueue,
    escapeMainline: s.escapeMainline,
    professionState: s.professionState,
  };
}

export function selectRuntimeOnlyState(s: GameState): StoreGovernanceLayers["runtimeOnly"] {
  return {
    isHydrated: s.isHydrated,
    recentOptions: s.recentOptions,
    intrusionFlashUntil: s.intrusionFlashUntil,
    pendingClientAction: s.pendingClientAction,
    conflictTurnFeedback: s.conflictTurnFeedback,
    professionNarrativeCues: s.professionNarrativeCues,
    combatSummariesV1: s.combatSummariesV1,
    sceneNpcAppearanceLedger: s.sceneNpcAppearanceLedger,
  };
}

export function summarizePlaySurfaceDemand(s: GameState): {
  hotUiKeys: string[];
  supportKeys: string[];
  runtimeKeys: string[];
} {
  void s;
  return {
    hotUiKeys: [
      "logs",
      "currentOptions",
      "inputMode",
      "tasks",
      "journalClues",
      "playerLocation",
      "stats",
      "originium",
      "time",
      "activeMenu",
      "conflictTurnFeedback",
    ],
    supportKeys: ["memorySpine", "storyDirector", "incidentQueue", "escapeMainline", "professionState", "mainThreatByFloor", "codex"],
    runtimeKeys: ["isHydrated", "recentOptions", "intrusionFlashUntil", "pendingClientAction", "professionNarrativeCues", "combatSummariesV1"],
  };
}

export function projectPersistableShape(s: GameState): Omit<StoreGovernanceLayers["persistenceCore"], "saveSlots"> & { saveSlotCount: number } {
  const core = selectPersistenceCoreState(s);
  return {
    ...core,
    saveSlotCount: Object.keys(core.saveSlots ?? {}).length,
  };
}

export function extractMainSlotSnapshot(s: GameState): SaveSlotData | null {
  const slot = s.currentSaveSlot;
  if (!slot) return null;
  return s.saveSlots?.[slot] ?? null;
}
