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
import type { GameLanguage } from "@/lib/i18n/language";
import type { WorldId } from "@/lib/worlds/types";
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
  /** 职业主动技能：label 为 null/undefined 时不渲染按钮（未认证职业前不占位）。 */
  professionActiveLabel?: string | null;
  professionActiveReady?: boolean;
  professionActiveCooldownText?: string | null;
  onUseProfessionActive?: () => void;
};

export type EchoTalentButtonProps = {
  label: string;
  ready: boolean;
  talentName?: string | null;
  onUseTalent?: () => void;
};

export type ProfessionActiveButtonProps = {
  label: string;
  ready: boolean;
  cooldownText?: string | null;
  onUseProfessionActive?: () => void;
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
  worldId: WorldId;
  codex: Record<string, CodexEntry>;
  dynamicNpcStates?: MobileCodexDynamicNpcStates;
  mainThreatByFloor?: MobileCodexMainThreatByFloor;
  playerLocation: string;
  /** G2：用于生成"记忆片段"区块（叙事化关系呈现），缺省时该区块不展示 */
  memorySpine?: MemorySpineState | null;
  /** 图鉴逐条目已读状态：key 为图鉴目录 slot id */
  viewedCodexIds?: Record<string, boolean>;
  /** 玩家点开某图鉴条目详情时回调，用于标记已读并清除"新发现"角标 */
  onViewCodexEntry?: (id: string) => void;
};

export type MobileTaskPanelProps = {
  tasks: GameTask[];
  originium: number;
  codex?: Record<string, CodexEntry>;
  highlightTaskIds?: string[];
  onClaimTask: (taskId: string) => void;
  /** 玩家是否从未打开过任务面板 */
  taskPanelFirstOpen?: boolean;
  /** 玩家打开任务面板时调用，标记面板已查看 */
  onMarkTaskPanelOpened?: () => void;
};

export type MobileSettingsPanelProps = {
  audioMuted: boolean;
  chapterState: ChapterState;
  language: GameLanguage;
  onExitGame: () => void;
  onReturnToActiveChapter: () => void;
  onReviewChapter: (chapterId: ChapterId) => void;
  onSetReadingPreference: (key: ReadingPreferenceKey, value: ReadingPreferences[ReadingPreferenceKey]) => void;
  onSetLanguage: (language: GameLanguage) => void;
  onToggleMute: () => void;
  readingPreferences: ReadingPreferences;
  setVolume: (value: number) => void;
  volume: number;
};

export type MobileBottomNavProps = {
  activeItem: "character" | "story" | "codex" | "settings" | "tasks" | "map";
  onOpenCharacter?: () => void;
  onFocusStory: () => void;
  onOpenCodex: () => void;
  onOpenSettings: () => void;
  onOpenTasks?: () => void;
  onOpenMap?: () => void;
  /** 图鉴是否存在未读的新发现，驱动"图鉴"导航项的角标提示 */
  hasUnreadCodex?: boolean;
  /** 任务是否存在未查看的更新，驱动"任务"导航项的角标提示 */
  hasUnviewedTaskUpdates?: boolean;
  language?: GameLanguage;
};
