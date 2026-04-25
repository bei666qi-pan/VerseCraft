export const mobileReadingTokens = {
  colors: {
    background: "#03101a",
    backgroundDeep: "#020d15",
    panel: "#08141e",
    panelRaised: "#0a1722",
    input: "#07121b",
    inputFocus: "#091722",
    gold: "#efb17f",
    goldBright: "#ffd28d",
    goldSoft: "#e7bb8f",
    goldMuted: "#d6a07b",
    storyText: "#e7bb8f",
    storyTextStrong: "#f2c79d",
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
    headerMinHeight: "62px",
    audioButton: "50px",
    actionDockHeight: "64px",
    actionButton: "42px",
    talentButton: "46px",
    sendButton: "48px",
    bottomNavRadius: "28px",
    bottomNavMinHeight: "112px",
  },
  safeArea: {
    topPadding: "max(1.15rem, env(safe-area-inset-top))",
    bottomPadding: "max(1.2rem, env(safe-area-inset-bottom))",
  },
  layout: {
    maxShellWidth: "480px",
    minViewportHeight: "100dvh",
  },
  typography: {
    serifClassName: "vc-reading-serif",
    serifStack: "\"Times New Roman\", \"Songti SC\", \"SimSun\", \"Noto Serif CJK SC\", serif",
  },
} as const;

export type MobileReadingTokens = typeof mobileReadingTokens;

export const mobileReadingTheme = {
  shellFrame:
    "flex h-[100dvh] min-h-[100dvh] w-full justify-center overflow-hidden bg-[#03101a] overscroll-none",
  shell:
    "vc-reading-surface relative flex h-[100dvh] min-h-0 w-full max-w-[480px] flex-col overflow-hidden text-[#e7bb8f] shadow-[0_0_80px_rgba(0,0,0,0.32)] transition-all duration-1000 md:border-x md:border-[#d39a70]/14",
  shellBody: "relative isolate flex min-h-0 flex-1 flex-col overflow-hidden",

  header:
    "shrink-0 border-b border-[#b98563]/15 bg-[#03101a]/95 px-4 pb-3 pt-[max(1.15rem,env(safe-area-inset-top))] text-[#f2c79d] shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
  headerRow: "flex min-h-[62px] items-center justify-between gap-2.5",
  headerBrand: "flex min-w-0 items-center gap-2.5 vc-reading-serif",
  brandWordmark:
    "whitespace-nowrap text-[25px] leading-none text-[#f1b586] drop-shadow-[0_0_10px_rgba(219,148,94,0.3)]",
  brandMark: "mt-1 h-5 w-5 shrink-0 text-[#d89b6c]",
  brandDivider: "h-10 w-px shrink-0 bg-[#d4a076]/55",
  chapterTitle: "shrink-0 whitespace-nowrap text-[18px] leading-none text-[#e5bd93]",
  audioButton:
    "flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-[#d99769]/80 bg-[#07131d]/70 text-[#efb17f] shadow-[0_0_18px_rgba(217,151,105,0.2),inset_0_0_14px_rgba(217,151,105,0.08)] transition hover:bg-[#0b1924] active:scale-95",
  audioIcon: "h-6 w-6",

  iconButton:
    "flex shrink-0 items-center justify-center rounded-full border border-[#d99b6f]/75 bg-[#091722] text-[#efb17f] shadow-[inset_0_0_12px_rgba(217,151,105,0.08)] transition",
  storyViewport: "relative flex min-h-0 flex-1 flex-col overflow-hidden",

  actionDock: "shrink-0 bg-[#03101a] px-4 pb-3 pt-3",
  actionDockPill:
    "flex h-[64px] items-center gap-2 rounded-full border border-[#d79a6f]/75 bg-[#08141e]/95 px-3 shadow-[0_0_22px_rgba(221,151,96,0.2),inset_0_0_18px_rgba(221,151,96,0.06)]",
  talentButton:
    "h-[46px] w-[46px] enabled:hover:bg-[#0d1d2a] enabled:active:scale-95 disabled:opacity-95",
  talentIcon: "h-7 w-7",
  actionInput:
    "min-w-0 flex-1 rounded-full border border-[#2c3a43] bg-[#07121b] px-4 py-2.5 vc-reading-serif text-[17px] leading-none text-[#e6bb91] outline-none transition placeholder:text-[#7b7e82] focus:border-[#d79a6f]/70 focus:bg-[#091722] disabled:opacity-60",
  optionsToggleButton: "h-[42px] w-[42px] hover:bg-[#0d1d2a] active:scale-95",
  optionsToggleIconCollapsed: "h-7 w-7",
  optionsToggleIconExpanded: "h-6 w-6",
  sendButton:
    "flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-[#e5ad78]/85 bg-[#11161a] text-[#ffc37f] shadow-[0_0_20px_rgba(239,177,127,0.35),inset_0_0_16px_rgba(239,177,127,0.08)] transition duration-500 enabled:hover:bg-[#171b1f] enabled:active:scale-95 disabled:opacity-75",
  sendButtonFlash: "scale-95",
  sendIcon: "ml-1 h-7 w-7",

  optionsDropdown:
    "mx-4 mb-3 shrink-0 overflow-hidden rounded-[8px] border border-[#c4936d]/60 bg-[#0a1722]/96 shadow-[0_12px_34px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(236,181,137,0.06)]",
  optionsEmptyState:
    "mx-4 mb-3 shrink-0 rounded-[8px] border border-[#c4936d]/50 bg-[#0a1722]/96 px-6 py-5 vc-reading-serif text-[18px] leading-normal text-[#d6a07b] shadow-[0_12px_34px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(236,181,137,0.05)]",
  optionRow:
    "flex min-h-[66px] w-full items-center justify-between gap-4 border-[#38505d]/55 px-6 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
  optionRowDivider: "border-b",
  optionRowInteractive: "hover:bg-[#102232]/85",
  optionRowHidden: "pointer-events-none",
  optionLabel:
    "block min-w-0 flex-1 truncate vc-reading-serif text-[22px] leading-none text-[#e7bb8f] transition-opacity duration-300",
  optionLabelVisible: "opacity-100",
  optionLabelHidden: "select-none opacity-0",
  optionChevron: "h-6 w-6 shrink-0 text-[#d9a37c] transition-opacity",
  optionChevronVisible: "opacity-90",
  optionChevronHidden: "opacity-0",

  bottomNav:
    "shrink-0 rounded-t-[28px] border border-b-0 border-[#d39a70]/18 bg-[#03101a]/95 px-5 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(233,177,132,0.1)]",
  bottomNavGrid: "grid grid-cols-4 items-end gap-1",
  bottomNavItem:
    "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-none py-1 text-[#d6a07b] transition active:scale-95",
  bottomNavItemActive: "text-[#ffd28d]",
  bottomNavItemInactive: "hover:text-[#f1bf90]",
  bottomNavItemDisabled: "cursor-default",
  bottomNavActiveGlow:
    "pointer-events-none absolute -bottom-6 h-20 w-24 rounded-full bg-[#d8863d]/25 blur-2xl",
  bottomNavIcon: "relative z-10 h-8 w-8",
  bottomNavIconActive: "drop-shadow-[0_0_14px_rgba(255,200,128,0.85)]",
  bottomNavLabel: "relative z-10 vc-reading-serif text-[18px] leading-none",
} as const;
