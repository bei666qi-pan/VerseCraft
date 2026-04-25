import type { ReactElement, ReactNode, SVGProps } from "react";

export type MobileReadingIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number | string;
  title?: string;
};

export type MobileReadingIcon = (props: MobileReadingIconProps) => ReactElement;

export type MobileReadingTalentIconProps = MobileReadingIconProps & {
  talentName?: string | null;
};

type IconSvgProps = MobileReadingIconProps & {
  children: ReactNode;
};

function IconSvg({
  children,
  className,
  size,
  strokeWidth = 1.75,
  title,
  ...props
}: IconSvgProps): ReactElement {
  const dimensionProps =
    size == null
      ? {}
      : {
          height: size,
          width: size,
        };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      focusable="false"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...dimensionProps}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

function AudioOnIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M4.5 9.2h3.1l4.5-3.7v13l-4.5-3.7H4.5z" />
      <path d="M15.3 8.4a5.1 5.1 0 0 1 0 7.2" />
      <path d="M17.7 5.9a8.5 8.5 0 0 1 0 12.2" />
    </IconSvg>
  );
}

function AudioOffIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M4.5 9.2h3.1l4.5-3.7v13l-3.2-2.6" />
      <path d="M4 4.4 20 20.4" />
      <path d="M16.8 9.1a4.5 4.5 0 0 1 .1 5.8" />
    </IconSvg>
  );
}

function BrandMarkIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M5 19.3c6.8-2.7 10.8-7.2 13.3-14.7" />
      <path d="M8.1 17.4 6.3 13l4.5 1.5-1.5-4.4 4.2 1.1-.8-4.1 3.4.6" />
      <path d="M5.2 19.2c2-5.5 6.4-9.8 13.1-13.9" />
    </IconSvg>
  );
}

function EchoDefaultIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M17.2 7.1a7.2 7.2 0 1 0 1.7 7.6" />
      <path d="M18.9 4.7v4.8h-4.8" />
      <path d="M12 7.5v4.8l3 1.7" />
      <circle cx="12" cy="12" r="8.1" opacity="0.18" />
    </IconSvg>
  );
}

function TimeRewindIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M18.4 6.2a8.3 8.3 0 1 0 1.4 9.8" />
      <path d="M18.6 3.7v4.9h-4.9" />
      <circle cx="12" cy="12" r="5.2" opacity="0.28" />
      <path d="M12 8.8v3.7l2.5 1.4" />
    </IconSvg>
  );
}

function FateGiftIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M5.3 10h13.4v9H5.3z" />
      <path d="M4.6 7.1h14.8V10H4.6z" />
      <path d="M12 7.1V19" />
      <path d="M8.6 7.1c-1.5-1.8-.2-3.9 1.7-3 1 .5 1.7 1.7 1.7 3" />
      <path d="M15.4 7.1c1.5-1.8.2-3.9-1.7-3-1 .5-1.7 1.7-1.7 3" />
      <path d="M17.4 3.1v2.2" />
      <path d="M16.3 4.2h2.2" />
    </IconSvg>
  );
}

function ProtagonistHaloIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <ellipse cx="12" cy="7" rx="5.9" ry="2.1" />
      <path d="M7.3 15.7c.9-2.2 2.5-3.3 4.7-3.3s3.8 1.1 4.7 3.3" />
      <path d="M5.8 19.2c1.2-2.3 3.4-3.5 6.2-3.5s5 1.2 6.2 3.5" />
      <path d="M19.4 9.6l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
    </IconSvg>
  );
}

function LifeConfluenceIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M12 19.4s-7-4.1-7-9.1A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.3c0 5-7 9.1-7 9.1z" />
      <path d="M7.4 12.2h2.3l1.1-2.1 2 4.4 1.2-2.3h2.6" />
      <path d="M12 4.2c1.2 1.4 1.7 2.5 1.7 3.5a1.7 1.7 0 1 1-3.4 0c0-1 .5-2.1 1.7-3.5z" />
    </IconSvg>
  );
}

function InsightEyeIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M3.5 12s3-5.3 8.5-5.3 8.5 5.3 8.5 5.3-3 5.3-8.5 5.3S3.5 12 3.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M18.3 4.2l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
      <path d="M6 4.8 7 6.2" />
    </IconSvg>
  );
}

function TollingBellIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M7.5 17.3h9" />
      <path d="M9 17.2V11a3 3 0 0 1 6 0v6.2" />
      <path d="M8.1 17.2c-.7 0-1.2-.6-.9-1.2.6-1.2 1-2.4 1-4" />
      <path d="M15.8 12c0 1.6.4 2.8 1 4 .3.6-.2 1.2-.9 1.2" />
      <path d="M11 19.2a1.2 1.2 0 0 0 2 0" />
      <path d="M5 8.2a8.6 8.6 0 0 0-1.5 4.6" />
      <path d="M19 8.2a8.6 8.6 0 0 1 1.5 4.6" />
      <path d="M12 5.4V4.1" />
    </IconSvg>
  );
}

function OptionsListIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M9.3 7h9.2" />
      <path d="M9.3 12h9.2" />
      <path d="M9.3 17h9.2" />
      <circle cx="5.7" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="5.7" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="5.7" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </IconSvg>
  );
}

function OptionsPanelIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <rect x="4.2" y="6" width="15.6" height="12" rx="2" />
      <path d="M7.1 9.1h1.5" />
      <path d="M10.7 9.1h1.5" />
      <path d="M14.3 9.1h1.5" />
      <path d="M7.1 12h1.5" />
      <path d="M10.7 12h1.5" />
      <path d="M14.3 12h1.5" />
      <path d="M8 15h8" />
    </IconSvg>
  );
}

function SendActionIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M4 5.7 20.2 12 4 18.3l3.8-6.3z" fill="currentColor" fillOpacity="0.18" />
      <path d="M4 5.7 20.2 12 4 18.3l3.8-6.3z" />
      <path d="M7.8 12h8.5" />
    </IconSvg>
  );
}

function CharacterIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <circle cx="12" cy="7.5" r="3.2" />
      <path d="M5.6 20c.7-4.1 3.1-6.2 6.4-6.2s5.7 2.1 6.4 6.2z" />
    </IconSvg>
  );
}

function OriginiumIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M12 3.4 19.2 7.6 17.4 17.1 12 20.6 6.6 17.1 4.8 7.6z" fill="currentColor" fillOpacity="0.14" />
      <path d="M12 3.4 19.2 7.6 17.4 17.1 12 20.6 6.6 17.1 4.8 7.6z" />
      <path d="m12 3.4-2.1 8.4 2.1 8.8 2.1-8.8z" opacity="0.74" />
      <path d="M4.8 7.6 9.9 11.8 6.6 17.1" opacity="0.74" />
      <path d="M19.2 7.6 14.1 11.8 17.4 17.1" opacity="0.74" />
      <path d="M9.9 11.8h4.2" opacity="0.74" />
    </IconSvg>
  );
}

function StoryIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M4.5 5.8c2.9-.6 5.2.1 7.5 2.1v11.2c-2.2-1.9-4.7-2.6-7.5-2z" />
      <path d="M19.5 5.8c-2.9-.6-5.2.1-7.5 2.1v11.2c2.2-1.9 4.7-2.6 7.5-2z" />
      <path d="M12 7.9v11.2" />
      <path d="M7.2 9.3c1.1 0 2 .3 2.8.8" opacity="0.6" />
      <path d="M16.8 9.3c-1.1 0-2 .3-2.8.8" opacity="0.6" />
    </IconSvg>
  );
}

function CodexIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M7.1 6.4 4.4 7.1l2.9 11 2.2-.6" />
      <path d="M16.9 6.4l2.7.7-2.9 11-2.2-.6" />
      <rect x="8.1" y="4.8" width="7.8" height="13.6" rx="1.2" />
      <circle cx="12" cy="10.8" r="1.8" />
      <path d="M9.8 15.3c.6-1 1.4-1.5 2.2-1.5s1.6.5 2.2 1.5" />
    </IconSvg>
  );
}

function SettingsIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M12 3.1 13.5 5.4 16.2 4.8 17.1 7.4 19.6 8.6 18.4 11.1 19.6 13.8 17.1 15 16.2 17.6 13.5 17 12 19.4 10.5 17 7.8 17.6 6.9 15 4.4 13.8 5.6 11.1 4.4 8.6 6.9 7.4 7.8 4.8 10.5 5.4z" />
      <circle cx="12" cy="12" r="3.2" />
    </IconSvg>
  );
}

function OptionChevronIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="m9 5 6 7-6 7" />
    </IconSvg>
  );
}

export const MOBILE_READING_TALENT_ICON_NAMES = [
  "时间回溯",
  "命运馈赠",
  "主角光环",
  "生命汇源",
  "洞察之眼",
  "丧钟回响",
] as const;

export type MobileReadingTalentIconName = (typeof MOBILE_READING_TALENT_ICON_NAMES)[number];

export type MobileReadingTalentIconMap = Record<MobileReadingTalentIconName, MobileReadingIcon>;

const mobileReadingTalentIconSet = new Set<string>(MOBILE_READING_TALENT_ICON_NAMES);

export const MobileReadingTalentIcons: MobileReadingTalentIconMap = {
  时间回溯: TimeRewindIcon,
  命运馈赠: FateGiftIcon,
  主角光环: ProtagonistHaloIcon,
  生命汇源: LifeConfluenceIcon,
  洞察之眼: InsightEyeIcon,
  丧钟回响: TollingBellIcon,
};

export function isMobileReadingTalentIconName(
  value: string | null | undefined
): value is MobileReadingTalentIconName {
  return typeof value === "string" && mobileReadingTalentIconSet.has(value);
}

export function getMobileReadingTalentIcon(value: string | null | undefined): MobileReadingIcon {
  return isMobileReadingTalentIconName(value) ? MobileReadingTalentIcons[value] : EchoDefaultIcon;
}

export function MobileReadingTalentIcon({
  talentName,
  ...props
}: MobileReadingTalentIconProps): ReactElement {
  switch (talentName) {
    case "时间回溯":
      return <TimeRewindIcon {...props} />;
    case "命运馈赠":
      return <FateGiftIcon {...props} />;
    case "主角光环":
      return <ProtagonistHaloIcon {...props} />;
    case "生命汇源":
      return <LifeConfluenceIcon {...props} />;
    case "洞察之眼":
      return <InsightEyeIcon {...props} />;
    case "丧钟回响":
      return <TollingBellIcon {...props} />;
    default:
      return <EchoDefaultIcon {...props} />;
  }
}

export const MobileReadingIcons = {
  AudioOff: AudioOffIcon,
  AudioOn: AudioOnIcon,
  BrandMark: BrandMarkIcon,
  Character: CharacterIcon,
  Codex: CodexIcon,
  CollapseOptions: OptionsPanelIcon,
  ExpandOptions: OptionsListIcon,
  OptionChevron: OptionChevronIcon,
  Originium: OriginiumIcon,
  SendAction: SendActionIcon,
  Settings: SettingsIcon,
  Story: StoryIcon,
  Talent: EchoDefaultIcon,
  Talents: MobileReadingTalentIcons,
} as const;
