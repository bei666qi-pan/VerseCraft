export const mobileReadingTokens = {
  colors: {
    background: "#03101a",
    backgroundDeep: "#020b12",
    panel: "#07131d",
    panelRaised: "#091824",
    input: "#07121b",
    inputFocus: "#091722",
    gold: "#f2a765",
    goldBright: "#ffd08a",
    goldSoft: "#efb17f",
    goldMuted: "#c98e6a",
    storyText: "#f0a96b",
    storyTextStrong: "#ffc07a",
    secondaryText: "#7b7e82",
  },
  borders: {
    goldStrong: "rgba(217, 155, 111, 0.75)",
    goldMedium: "rgba(196, 147, 109, 0.6)",
    goldSoft: "rgba(211, 154, 112, 0.18)",
    blueSoft: "rgba(56, 80, 93, 0.55)",
  },
  shadows: {
    header: "0 10px 24px rgba(0, 0, 0, 0.18)",
    actionDock: "0 0 22px rgba(221, 151, 96, 0.2)",
    sendGlow: "0 0 20px rgba(239, 177, 127, 0.35)",
    bottomNav: "0 -18px 34px rgba(0, 0, 0, 0.24)",
    activeNavGlow: "0 0 14px rgba(255, 200, 128, 0.85)",
  },
  spacing: {
    pageX: "1rem",
    headerGap: "0.625rem",
    actionGap: "0.5rem",
    optionX: "1.5rem",
  },
  sizes: {
    headerMinHeight: "var(--vc-mobile-header-height)",
    audioButton: "50px",
    actionDockHeight: "4.4rem",
    actionButton: "2.8rem",
    talentButton: "2.9rem",
    sendButton: "3rem",
    bottomNavRadius: "0px",
    bottomNavMinHeight: "var(--vc-mobile-bottom-nav-height)",
  },
  safeArea: {
    topPadding: "max(1.15rem, env(safe-area-inset-top))",
    bottomPadding: "max(1.2rem, env(safe-area-inset-bottom))",
  },
  layout: {
    maxShellWidth: "480px",
    minViewportHeight: "100svh",
  },
  typography: {
    serifClassName: "vc-reading-serif",
    serifStack: "\"Times New Roman\", \"Songti SC\", \"SimSun\", \"Noto Serif CJK SC\", serif",
  },
} as const;

export type MobileReadingTokens = typeof mobileReadingTokens;

export const mobileReadingTheme = {
  shellFrame:
    "flex min-h-[100svh] w-full justify-center overflow-x-hidden bg-[#03101a]",
  shell:
    "vc-reading-surface relative flex min-h-[100svh] w-full max-w-[480px] flex-col overflow-x-hidden text-[#f0a96b] shadow-[0_0_80px_rgba(0,0,0,0.32)] transition-all duration-1000 md:border-x md:border-[#d39a70]/14",
  shellBody: "relative isolate min-h-[100svh] overflow-visible",

  header:
    "sticky top-0 z-40 box-border h-[var(--vc-mobile-header-height)] border-b border-[#b98563]/15 bg-[#03101a]/95 px-5 pb-0 pt-[max(0.7rem,env(safe-area-inset-top))] text-[#f2c79d] shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-[10px] min-[420px]:px-6",
  headerRow: "flex h-full items-center justify-between gap-2.5",
  headerBrand: "flex min-w-0 items-center gap-2.5 vc-reading-serif",
  brandWordmark:
    "whitespace-nowrap text-[27px] leading-none text-[#f1b586] drop-shadow-[0_0_10px_rgba(219,148,94,0.3)] min-[420px]:text-[31px]",
  brandMark: "mt-1 h-5 w-5 shrink-0 text-[#d89b6c] min-[420px]:h-6 min-[420px]:w-6",
  brandDivider: "h-10 w-px shrink-0 bg-[#d4a076]/55 min-[420px]:h-12",
  chapterTitle: "shrink-0 whitespace-nowrap text-[18px] leading-none text-[#e5bd93] min-[420px]:text-[24px]",
  audioButton:
    "flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-[#d99769]/80 bg-[#07131d]/70 text-[#efb17f] shadow-[0_0_18px_rgba(217,151,105,0.2),inset_0_0_14px_rgba(217,151,105,0.08)] transition hover:bg-[#0b1924] active:scale-95",
  audioIcon: "h-6 w-6",

  iconButton:
    "flex shrink-0 items-center justify-center rounded-full border border-[#d99b6f]/75 bg-[#091722] text-[#efb17f] shadow-[inset_0_0_12px_rgba(217,151,105,0.08)] transition disabled:cursor-not-allowed disabled:opacity-45",
  storyViewport: "relative flex flex-col",

  actionDock:
    "pointer-events-none fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+0.25rem)] left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 px-[1.45rem] pb-0 pt-0",
  actionDockPill:
    "pointer-events-auto flex h-[3.95rem] items-center gap-1.5 rounded-full border border-[#d98655]/80 bg-[#06111a]/88 px-2.5 shadow-[0_0_18px_rgba(229,134,75,0.16),inset_0_0_16px_rgba(229,134,75,0.05)] backdrop-blur-[8px]",
  talentButton:
    "h-[2.9rem] w-[2.9rem] enabled:hover:bg-[#0d1d2a] enabled:active:scale-95 disabled:opacity-95",
  talentIcon: "h-6 w-6",
  actionInput:
    "min-w-0 flex-1 rounded-full border border-[#31404a]/85 bg-[#07121b]/88 px-3 py-2.5 vc-reading-serif text-[14px] leading-none text-[#efb17f] outline-none transition placeholder:text-[#6f7479] focus:border-[#d98655]/75 focus:bg-[#091722] disabled:opacity-60",
  optionsToggleButton: "h-[2.8rem] w-[2.8rem] hover:bg-[#0d1d2a] active:scale-95",
  optionsToggleIconCollapsed: "h-6 w-6",
  optionsToggleIconExpanded: "h-5 w-5",
  sendButton:
    "flex h-[3rem] w-[3rem] shrink-0 items-center justify-center rounded-full border border-[#e09a61]/90 bg-[#0d141a]/86 text-[#f3a765] shadow-[0_0_17px_rgba(239,151,86,0.28),inset_0_0_14px_rgba(239,151,86,0.07)] transition duration-500 enabled:hover:bg-[#171b1f] enabled:active:scale-95 disabled:opacity-75",
  sendButtonFlash: "scale-95",
  sendIcon: "ml-0.5 h-6 w-6",

  optionsDropdown:
    "fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-action-dock-height)+0.35rem)] left-1/2 z-40 w-[calc(100%-2.9rem)] max-w-[438px] -translate-x-1/2 overflow-hidden rounded-[8px] border border-[#c98555]/62 bg-[#07131d]/96 shadow-[0_12px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(236,181,137,0.06)]",
  optionsEmptyState:
    "fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-action-dock-height)+0.35rem)] left-1/2 z-40 w-[calc(100%-2.9rem)] max-w-[438px] -translate-x-1/2 rounded-[8px] border border-[#c98555]/50 bg-[#07131d]/96 px-6 py-5 vc-reading-serif text-[18px] leading-normal text-[#d79a6f] shadow-[0_12px_34px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(236,181,137,0.05)]",
  optionRow:
    "flex min-h-[66px] w-full items-center justify-between gap-4 border-[#38505d]/55 px-6 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
  optionRowDivider: "border-b",
  optionRowInteractive: "hover:bg-[#102232]/85",
  optionRowHidden: "pointer-events-none",
  optionLabel:
    "block min-w-0 flex-1 truncate vc-reading-serif text-[var(--vc-option-font-size)] leading-[var(--vc-option-line-height)] text-[#f0a96b] transition-opacity duration-300",
  optionLabelVisible: "opacity-100",
  optionLabelHidden: "select-none opacity-0",
  optionChevron: "h-6 w-6 shrink-0 text-[#d9a37c] transition-opacity",
  optionChevronVisible: "opacity-90",
  optionChevronHidden: "opacity-0",

  bottomNav:
    "fixed bottom-0 left-1/2 z-40 box-border h-[var(--vc-mobile-bottom-nav-height)] w-full max-w-[480px] -translate-x-1/2 rounded-t-[28px] border border-b-0 border-[#9a5b37]/48 bg-[#04111a]/88 px-8 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(220,142,79,0.12)] backdrop-blur-[10px] min-[420px]:px-10 min-[420px]:pt-4",
  bottomNavGrid: "grid h-full grid-cols-4 items-end gap-1",
  bottomNavItem:
    "relative flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-none text-[#d9986c] transition active:scale-95",
  bottomNavItemActive: "text-[#ffbf79]",
  bottomNavItemInactive: "hover:text-[#efb17f]",
  bottomNavItemDisabled: "cursor-default",
  bottomNavActiveGlow:
    "pointer-events-none absolute -bottom-4 h-20 w-24 rounded-full bg-[#d8863d]/25 blur-2xl",
  bottomNavIcon: "relative z-10 h-8 w-8 min-[420px]:h-10 min-[420px]:w-10",
  bottomNavIconActive: "drop-shadow-[0_0_14px_rgba(255,184,106,0.86)]",
  bottomNavLabel: "relative z-10 vc-reading-serif text-[17px] leading-none min-[420px]:text-[20px]",
} as const;
