import type { ReactNode } from "react";

export type MobileReadingShellProps = {
  children: ReactNode;
  hitEffectActive?: boolean;
};

export type MobileReadingHeaderProps = {
  audioMuted: boolean;
  onToggleAudio: () => void;
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

export type MobileBottomNavProps = {
  onOpenCharacter?: () => void;
  onFocusStory: () => void;
  onOpenCodex: () => void;
  onOpenSettings: () => void;
};
