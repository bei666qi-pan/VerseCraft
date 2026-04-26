import type { ReactNode } from "react";
import type { StatType } from "@/lib/registry/types";
import type { ProfessionId } from "@/lib/profession/types";
import type { ChapterId, ChapterState } from "@/lib/chapters";
import type { CodexEntry } from "@/store/useGameStore";
import type {
  ReadingPreferenceKey,
  ReadingPreferences,
} from "./readingPreferences";

export type MobileReadingShellProps = {
  children: ReactNode;
  hitEffectActive?: boolean;
};

export type MobileReadingHeaderProps = {
  audioMuted: boolean;
  onToggleAudio: () => void;
  title?: string;
};

export type MobileStoryViewportProps = {
  children: ReactNode;
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

export type MobileOptionsEmptyStateProps = {
  busy: boolean;
};

export type MobileCharacterPanelProps = {
  stats: Record<StatType, number>;
  historicalMaxSanity: number;
  originium: number;
  time: { day: number; hour: number };
  playerLocation: string;
  currentProfession: ProfessionId | null;
  onUpgradeAttribute: (attr: StatType) => void;
};

export type MobileCodexPanelProps = {
  codex: Record<string, CodexEntry>;
};

export type MobileSettingsPanelProps = {
  accountName: string;
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
  activeItem: "character" | "story" | "codex" | "settings";
  onOpenCharacter?: () => void;
  onFocusStory: () => void;
  onOpenCodex: () => void;
  onOpenSettings: () => void;
};
