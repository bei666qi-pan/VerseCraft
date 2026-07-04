import type { ReactNode } from "react";
import type { StatType } from "@/lib/registry/types";
import type { ProfessionId } from "@/lib/profession/types";
import type { ChapterId, ChapterState } from "@/lib/chapters";
import type { CodexEntry, GameTask } from "@/store/useGameStore";
import type { MemorySpineState } from "@/lib/memorySpine/types";
import type { EscapeStage } from "@/lib/escapeMainline/types";
import type {
  ReadingPreferenceKey,
  ReadingPreferences,
} from "./readingPreferences";
import type {
  MobileCodexDynamicNpcStates,
  MobileCodexMainThreatByFloor,
} from "./codexFormat";

export type MobileReadingShellProps = {
  children: ReactNode;
  hitEffectActive?: boolean;
};

export type MobileReadingHeaderProps = {
  audioMuted: boolean;
  canGoNextChapter?: boolean;
  canGoPreviousChapter?: boolean;
  onToggleAudio: () => void;
  onGoNextChapter?: () => void;
  onGoPreviousChapter?: () => void;
  pinned?: boolean;
  title: string;
  variant?: "default" | "codex";
};

export type MobileStoryViewportProps = {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

export type MobileActionDockProps = {
  inputMode: "options" | "text" | string;
  hasAnyGate: boolean;
  gateMessage: string;
  isLowSanity: boolean;
  isDarkMoon: boolean;
  input: string;
  inputError: string;
  onInputChange: (value: string) => void;
  onTextIntent?: () => void;
  onSubmitKey: () => void;
  onSubmitClick: () => void;
  onToggleOptions: () => void;
  chatBusy: boolean;
  helperText: string;
  showRegisterPrompt: boolean;
  isGuestDialogueExhausted: boolean;
  optionsExpanded?: boolean;
  talentLabel?: string | null;
  talentReady?: boolean;
  talentCooldownText?: string | null;
  onUseTalent?: () => void;
};

export type EchoTalentButtonProps = {
  label: string;
  ready: boolean;
  talentName?: string | null;
  onUseTalent?: () => void;
};

export type MobileOptionsDropdownProps = {
  options: string[];
  isLowSanity: boolean;
  isDarkMoon: boolean;
  disabled: boolean;
  onPick: (option: string) => void;
  revealed?: boolean;
};

export type MobileOptionsRegenStage =
  | "idle"
  | "request_sent"
  | "context_building"
  | "generating"
  | "finalizing"
  | "complete";

export type MobileOptionsEmptyStateProps = {
  busy: boolean;
  message?: string | null;
  progress?: number;
  stage?: MobileOptionsRegenStage;
};

export type MobileCharacterPanelProps = {
  stats: Record<StatType, number>;
  historicalMaxSanity: number;
  originium: number;
  time: { day: number; hour: number };
  playerLocation: string;
  currentProfession: ProfessionId | null;
  onUpgradeAttribute: (attr: StatType) => void;
  /** 出口主线阶段（只读展示用，缺省时不展示主线小节） */
  escapeStage?: EscapeStage | null;
};

export type MobileCodexPanelProps = {
  codex: Record<string, CodexEntry>;
  dynamicNpcStates?: MobileCodexDynamicNpcStates;
  mainThreatByFloor?: MobileCodexMainThreatByFloor;
  playerLocation: string;
  /** G2：用于生成"记忆片段"区块（叙事化关系呈现），缺省时该区块不展示 */
  memorySpine?: MemorySpineState | null;
};

export type MobileTaskPanelProps = {
  tasks: GameTask[];
  originium: number;
  codex?: Record<string, CodexEntry>;
  highlightTaskIds?: string[];
  onClaimTask: (taskId: string) => void;
};

export type MobileSettingsPanelProps = {
  audioMuted: boolean;
  chapterState: ChapterState;
  onExitGame: () => void;
  onReturnToActiveChapter: () => void;
  onReviewChapter: (chapterId: ChapterId) => void;
  onSetReadingPreference: (key: ReadingPreferenceKey, value: ReadingPreferences[ReadingPreferenceKey]) => void;
  onToggleMute: () => void;
  readingPreferences: ReadingPreferences;
  setVolume: (value: number) => void;
  volume: number;
};

export type MobileBottomNavProps = {
  activeItem: "character" | "story" | "codex" | "settings" | "tasks";
  onOpenCharacter?: () => void;
  onFocusStory: () => void;
  onOpenCodex: () => void;
  onOpenSettings: () => void;
  onOpenTasks?: () => void;
};
