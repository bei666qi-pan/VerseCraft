import type { ReactElement, ReactNode, SVGProps } from "react";
import { VerseCraftLogoMark } from "@/components/VerseCraftLogo";

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

const PAPER_ICON_FILL = "#FAF9F6";
const PAPER_ICON_STROKE = "#2D6B68";
const PAPER_ICON_STROKE_WIDTH = 0.66;

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

function PaperIconSoftShadow({ id }: { id: string }): ReactElement {
  return (
    <defs>
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#8AA6A2" floodOpacity="0.45" />
      </filter>
    </defs>
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
  const { className, size, style, title } = props;
  const dimensionStyle =
    size == null
      ? style
      : {
          ...style,
          height: size,
          width: size,
        };

  return (
    <VerseCraftLogoMark
      alt={title ?? "文界工坊"}
      className={className}
      decorative={!title}
      sizes={typeof size === "number" ? `${size}px` : "40px"}
      style={dimensionStyle}
    />
  );
}

function EchoDefaultIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M7.4 15.4V10a4.6 4.6 0 0 1 9.2 0v5.4" />
      <path d="M6.2 15.4h11.6" />
      <path d="M9.8 18a2.3 2.3 0 0 0 4.4 0" />
      <path d="M12 4.3V3" />
      <path d="M4.7 9.2a7.6 7.6 0 0 0-.8 3.3" />
      <path d="M19.3 9.2a7.6 7.6 0 0 1 .8 3.3" />
      <path d="M5.1 5.2 3.8 3.8" />
      <path d="M18.9 5.2 20.2 3.8" />
      <circle cx="12" cy="10.7" r="7.9" opacity="0.14" />
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
    <IconSvg {...props} strokeWidth={PAPER_ICON_STROKE_WIDTH}>
      <PaperIconSoftShadow id="mobileCharacterSoftShadow" />
      <g
        filter="url(#mobileCharacterSoftShadow)"
        stroke={PAPER_ICON_STROKE}
        strokeWidth={PAPER_ICON_STROKE_WIDTH}
      >
        <circle cx="12" cy="5.65" r="3.25" fill={PAPER_ICON_FILL} />
        <path
          d="M4.9 20.2h14.2c-.45-4.7-3.1-7.35-7.1-7.35S5.35 15.5 4.9 20.2z"
          fill={PAPER_ICON_FILL}
        />
      </g>
    </IconSvg>
  );
}

function OriginiumIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <path d="M12 3.4 19.2 7.6 17.4 17.1 12 20.6 6.6 17.1 4.8 7.6z" fill="currentColor" fillOpacity="0.14" />
      <path
        d="M12 3.4 19.2 7.6 17.4 17.1 12 20.6 6.6 17.1 4.8 7.6z"
      />
      <path d="m12 3.4-2.1 8.4 2.1 8.8 2.1-8.8z" opacity="0.74" />
      <path d="M4.8 7.6 9.9 11.8 6.6 17.1" opacity="0.74" />
      <path d="M19.2 7.6 14.1 11.8 17.4 17.1" opacity="0.74" />
      <path d="M9.9 11.8h4.2" opacity="0.74" />
    </IconSvg>
  );
}

function StoryIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props} strokeWidth={PAPER_ICON_STROKE_WIDTH}>
      <PaperIconSoftShadow id="mobileStorySoftShadow" />
      <g filter="url(#mobileStorySoftShadow)" stroke={PAPER_ICON_STROKE} strokeWidth={PAPER_ICON_STROKE_WIDTH}>
        <path
          d="M3.95 5.85h1.75c2.35 0 4.35.62 6.3 1.95v10.55c-1.9-1.28-4.05-1.9-6.45-1.9h-1.6z"
          fill={PAPER_ICON_FILL}
        />
        <path
          d="M20.05 5.85H18.3c-2.35 0-4.35.62-6.3 1.95v10.55c1.9-1.28 4.05-1.9 6.45-1.9h1.6z"
          fill={PAPER_ICON_FILL}
        />
        <path d="M12 7.75v10.55" />
        <path d="M6.25 8.25c1.35.02 2.55.32 3.65.98" />
        <path d="M17.75 8.25c-1.35.02-2.55.32-3.65.98" />
      </g>
    </IconSvg>
  );
}

function CodexIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props}>
      <PaperIconSoftShadow id="mobileCodexSoftShadow" />
      <g transform="translate(-14.58 -1.2) scale(0.3038)" filter="url(#mobileCodexSoftShadow)">
        <rect
          x="57.5"
          y="23"
          width="36"
          height="43"
          rx="3.5"
          transform="rotate(-10 75.5 44.5)"
          fill="#FAF9F6"
          stroke="#2D6B68"
          strokeWidth="2"
        />
        <rect
          x="76.5"
          y="23"
          width="36"
          height="43"
          rx="3.5"
          transform="rotate(10 94.5 44.5)"
          fill="#FAF9F6"
          stroke="#2D6B68"
          strokeWidth="2"
        />
        <rect
          x="68.5"
          y="19.5"
          width="38"
          height="46"
          rx="3.8"
          fill="#FAF9F6"
          stroke="#2D6B68"
          strokeWidth="2.2"
        />
        <circle cx="87.5" cy="36.2" r="5.6" fill="#FAF9F6" stroke="#2D6B68" strokeWidth="2" />
        <path
          d="M76.8 52.8C78 46.4 82.4 42.5 87.5 42.5C92.6 42.5 97 46.4 98.2 52.8"
          stroke="#2D6B68"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </IconSvg>
  );
}

function CodexDetailEyeIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props} strokeWidth={PAPER_ICON_STROKE_WIDTH}>
      <PaperIconSoftShadow id="mobileCodexEyeSoftShadow" />
      <g
        filter="url(#mobileCodexEyeSoftShadow)"
        stroke={PAPER_ICON_STROKE}
        strokeWidth={PAPER_ICON_STROKE_WIDTH}
      >
        <path
          d="M3.75 12s3.35-5.25 8.25-5.25S20.25 12 20.25 12 16.9 17.25 12 17.25 3.75 12 3.75 12z"
          fill={PAPER_ICON_FILL}
        />
        <circle cx="12" cy="12" r="2.15" fill={PAPER_ICON_FILL} />
      </g>
    </IconSvg>
  );
}

function CodexDetailHeartIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props} strokeWidth={PAPER_ICON_STROKE_WIDTH}>
      <PaperIconSoftShadow id="mobileCodexHeartSoftShadow" />
      <path
        d="M12 20.25s-7.35-4.45-7.35-9.25c0-2.45 1.75-4.15 3.9-4.15 1.55 0 2.75.85 3.45 2.15.7-1.3 1.9-2.15 3.45-2.15 2.15 0 3.9 1.7 3.9 4.15 0 4.8-7.35 9.25-7.35 9.25z"
        fill={PAPER_ICON_FILL}
        stroke={PAPER_ICON_STROKE}
        strokeWidth={PAPER_ICON_STROKE_WIDTH}
        filter="url(#mobileCodexHeartSoftShadow)"
      />
    </IconSvg>
  );
}

function SettingsIcon(props: MobileReadingIconProps): ReactElement {
  return (
    <IconSvg {...props} strokeWidth={PAPER_ICON_STROKE_WIDTH}>
      <PaperIconSoftShadow id="mobileSettingsSoftShadow" />
      <g
        filter="url(#mobileSettingsSoftShadow)"
        stroke={PAPER_ICON_STROKE}
        strokeWidth={PAPER_ICON_STROKE_WIDTH}
      >
        <path
          d="M10.75 3.2h2.5l.52 2.25c.58.18 1.13.42 1.63.72l1.98-1.18 1.76 1.76-1.18 1.98c.3.5.54 1.05.72 1.63l2.25.52v2.5l-2.25.52a7.2 7.2 0 0 1-.72 1.63l1.18 1.98-1.76 1.76-1.98-1.18c-.5.3-1.05.54-1.63.72l-.52 2.25h-2.5l-.52-2.25a7.2 7.2 0 0 1-1.63-.72l-1.98 1.18-1.76-1.76 1.18-1.98a7.2 7.2 0 0 1-.72-1.63l-2.25-.52v-2.5l2.25-.52c.18-.58.42-1.13.72-1.63L4.86 6.75l1.76-1.76L8.6 6.17c.5-.3 1.05-.54 1.63-.72z"
          fill={PAPER_ICON_FILL}
        />
        <circle cx="12" cy="12.13" r="3" fill={PAPER_ICON_FILL} />
      </g>
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
  CodexBook: StoryIcon,
  CodexEye: CodexDetailEyeIcon,
  CodexHeart: CodexDetailHeartIcon,
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
