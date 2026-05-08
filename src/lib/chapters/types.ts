export type ChapterId = string;

export type ChapterKind = "tutorial" | "standard" | "climax" | "side" | "transition" | "ending";

export type ChapterProgressStatus = "locked" | "active" | "completed" | "reviewing";

export type ChapterTurnSource = "manual" | "option" | "system" | "resume" | "talent";

export interface ChapterBeatDefinition {
  id: string;
  label: string;
  description: string;
  required?: boolean;
}

export interface ChapterDefinition {
  id: ChapterId;
  order: number;
  title: string;
  subtitle?: string;
  kind: ChapterKind;
  objective: string;
  minTurns: number;
  targetTurns: number;
  maxTurns: number;
  minKeyChoices: number;
  targetKeyChoices: number;
  targetTextChars: [number, number];
  hardTextChars: number;
  beats: ChapterBeatDefinition[];
  endHook: string;
  nextChapterId?: ChapterId;
  previousChapterId?: ChapterId;
}

export interface ChapterProgress {
  chapterId: ChapterId;
  status: ChapterProgressStatus;
  startedAt: number | null;
  completedAt: number | null;
  turnCount: number;
  narrativeCharCount: number;
  keyChoiceCount: number;
  completedBeatIds: string[];
  stateChangeCount: number;
  lastObjectiveText?: string;
  startedLogIndex?: number | null;
  completedLogIndex?: number | null;
}

export interface ChapterSummary {
  chapterId: ChapterId;
  title: string;
  completedAt: number;
  summaryForPlayer?: string;
  resultLines: string[];
  obtainedLines: string[];
  lostLines: string[];
  relationshipLines: string[];
  clueLines: string[];
  nextObjective: string;
  hook: string;
}

export interface ChapterState {
  currentChapterId: ChapterId;
  activeChapterId: ChapterId;
  reviewChapterId: ChapterId | null;
  chapterTitlesById: Record<ChapterId, string>;
  completedChapterIds: ChapterId[];
  unlockedChapterIds: ChapterId[];
  progressByChapterId: Record<ChapterId, ChapterProgress>;
  summariesByChapterId: Record<ChapterId, ChapterSummary>;
  lastChapterEndAt: number | null;
  pendingChapterEndId: ChapterId | null;
}

export interface ChapterTurnSignals {
  source: ChapterTurnSource;
  isLegalAction: boolean;
  isDeath?: boolean;
  narrativeText?: string;
  logCountBefore?: number;
  logCountAfter?: number;
  previousLocation?: string | null;
  nextLocation?: string | null;
  newTaskCount?: number;
  taskUpdateCount?: number;
  codexUpdateCount?: number;
  relationshipUpdateCount?: number;
  awardedItemCount?: number;
  awardedWarehouseItemCount?: number;
  clueUpdateCount?: number;
  sanityDamage?: number;
  currencyChange?: number;
  mainThreatUpdateCount?: number;
  weaponUpdateCount?: number;
  weaponBagUpdateCount?: number;
  obtainedLines?: string[];
  lostLines?: string[];
  relationshipLines?: string[];
  clueLines?: string[];
  resultLines?: string[];
}

export interface ChapterCompletionRuntime {
  suppressCompletion?: boolean;
  closeDecision?: {
    shouldClose?: boolean;
    confidence?: number;
    hasResolvedSmallQuestion?: boolean;
    hasNewHook?: boolean;
    hasPlayerChoiceEcho?: boolean;
    hasReadablePause?: boolean;
    hasNoLoreConflict?: boolean;
    playerRecapCandidate?: string;
    modelSummaryCandidate?: string;
    nextChapterTitleCandidate?: string | null;
  } | null;
}
