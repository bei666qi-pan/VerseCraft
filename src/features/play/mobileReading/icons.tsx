import {
  BookOpen,
  ChevronRight,
  Clock3,
  Feather,
  Images,
  Keyboard,
  List,
  Send,
  Settings,
  UserRound,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";

export type MobileReadingIcon = LucideIcon;

export const MobileReadingIcons = {
  AudioOff: VolumeX,
  AudioOn: Volume2,
  BrandMark: Feather,
  Character: UserRound,
  Codex: Images,
  CollapseOptions: Keyboard,
  ExpandOptions: List,
  OptionChevron: ChevronRight,
  SendAction: Send,
  Settings,
  Story: BookOpen,
  Talent: Clock3,
} as const;
