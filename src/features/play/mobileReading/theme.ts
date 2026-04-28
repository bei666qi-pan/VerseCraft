export const mobileReadingTokens = {
  colors: {
    background: "#f6f2ec",
    paper: "#fbf8f2",
    paperRaised: "#fffdf8",
    ink: "#174d46",
    inkSoft: "#4f706a",
    muted: "#8b8a84",
    line: "#ded8ce",
    lineStrong: "#cfc8bc",
    accent: "#2f746a",
    accentSoft: "#8fa79f",
  },
  shadows: {
    header: "0 8px 22px rgba(67, 55, 42, 0.08)",
    actionDock: "0 10px 24px rgba(73, 63, 51, 0.14)",
    sendGlow: "0 8px 18px rgba(47, 116, 106, 0.18)",
    bottomNav: "0 -14px 28px rgba(73, 63, 51, 0.12)",
    activeNavGlow: "0 8px 22px rgba(47, 116, 106, 0.22)",
  },
  spacing: {
    pageX: "1rem",
    headerGap: "0.625rem",
    actionGap: "0.5rem",
    optionX: "1.5rem",
  },
  sizes: {
    headerMinHeight: "var(--vc-mobile-header-height)",
    audioButton: "56px",
    actionDockHeight: "4.4rem",
    actionButton: "2.8rem",
    talentButton: "3rem",
    sendButton: "3rem",
    bottomNavRadius: "32px",
    bottomNavMinHeight: "var(--vc-mobile-bottom-nav-height)",
  },
  safeArea: {
    topPadding: "max(1rem, env(safe-area-inset-top))",
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
    "flex min-h-[100svh] w-full justify-center overflow-x-hidden bg-[#f6f2ec]",
  shell:
    "vc-reading-surface relative flex min-h-[100svh] w-full max-w-[480px] flex-col overflow-x-hidden text-[#174d46] shadow-[0_0_70px_rgba(76,65,51,0.12)] transition-all duration-1000 md:border-x md:border-[#ded8ce]",
  shellBody: "relative isolate min-h-[100svh] overflow-visible",

  header:
    "sticky top-0 z-40 box-border h-[var(--vc-mobile-header-height)] border-b border-[#ded8ce] bg-[#fbf8f2]/96 px-6 pb-0 pt-[max(0.75rem,env(safe-area-inset-top))] text-[#174d46] shadow-[0_8px_22px_rgba(67,55,42,0.08)] backdrop-blur-[10px]",
  headerRow: "flex h-full items-center justify-between gap-3",
  headerBrand: "flex min-w-0 items-center gap-3 vc-reading-serif",
  brandWordmark:
    "whitespace-nowrap text-[30px] leading-none text-[#174d46] min-[420px]:text-[38px]",
  brandMark: "mt-1 h-6 w-6 shrink-0 text-[#174d46] min-[420px]:h-7 min-[420px]:w-7",
  brandDivider: "h-10 w-px shrink-0 bg-[#cfc8bc] min-[420px]:h-12",
  chapterTitle:
    "min-w-0 truncate text-[22px] leading-none text-[#174d46] min-[420px]:text-[30px]",
  audioButton:
    "flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_8px_18px_rgba(69,58,45,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-white active:scale-95 min-[420px]:h-[64px] min-[420px]:w-[64px]",
  audioIcon: "h-7 w-7 min-[420px]:h-8 min-[420px]:w-8",

  iconButton:
    "flex shrink-0 items-center justify-center rounded-full border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_6px_14px_rgba(69,58,45,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] transition disabled:cursor-not-allowed disabled:opacity-45",
  storyViewport: "relative flex flex-col",

  actionDock:
    "pointer-events-none fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+0.65rem)] left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 px-[1.45rem] pb-0 pt-0",
  actionDockPill:
    "pointer-events-auto flex h-[3.95rem] items-center gap-2 rounded-full border border-[#d8d1c6] bg-[#fffdf8]/94 px-2.5 shadow-[0_10px_24px_rgba(73,63,51,0.14),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-[8px]",
  talentButton:
    "h-[2.9rem] w-[2.9rem] enabled:hover:bg-white enabled:active:scale-95 disabled:opacity-95",
  talentIcon: "h-6 w-6",
  actionInput:
    "min-w-0 flex-1 rounded-full border border-[#d8d1c6] bg-[#fbf8f2] px-4 py-2.5 vc-reading-serif text-[15px] leading-none text-[#174d46] outline-none transition placeholder:text-[#9a9993] focus:border-[#2f746a]/65 focus:bg-white disabled:opacity-60",
  optionsToggleButton: "h-[2.8rem] w-[2.8rem] hover:bg-white active:scale-95",
  optionsToggleIconCollapsed: "h-6 w-6",
  optionsToggleIconExpanded: "h-5 w-5",
  sendButton:
    "flex h-[3rem] w-[3rem] shrink-0 items-center justify-center rounded-full border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_8px_18px_rgba(47,116,106,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] transition duration-500 enabled:hover:bg-white enabled:active:scale-95 disabled:opacity-60",
  sendButtonFlash: "scale-95",
  sendIcon: "ml-0.5 h-6 w-6",

  optionsDropdown:
    "fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-action-dock-height)+0.95rem)] left-1/2 z-40 w-[calc(100%-2.9rem)] max-w-[438px] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[#d8d1c6] bg-[#fffdf8]/96 shadow-[0_14px_32px_rgba(73,63,51,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]",
  optionsEmptyState:
    "fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-action-dock-height)+0.95rem)] left-1/2 z-40 w-[calc(100%-2.9rem)] max-w-[438px] -translate-x-1/2 rounded-[18px] border border-[#d8d1c6] bg-[#fffdf8]/96 px-6 py-5 vc-reading-serif text-[18px] leading-normal text-[#4f706a] shadow-[0_14px_32px_rgba(73,63,51,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]",
  optionRow:
    "flex min-h-[66px] w-full items-center justify-between gap-4 border-[#e3ded6] px-6 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
  optionRowDivider: "border-b",
  optionRowInteractive: "hover:bg-[#f3f0ea]",
  optionRowHidden: "pointer-events-none",
  optionLabel:
    "block min-w-0 flex-1 truncate vc-reading-serif text-[var(--vc-option-font-size)] leading-[var(--vc-option-line-height)] text-[#174d46] transition-opacity duration-300",
  optionLabelVisible: "opacity-100",
  optionLabelHidden: "select-none opacity-0",
  optionChevron: "h-6 w-6 shrink-0 text-[#174d46] transition-opacity",
  optionChevronVisible: "opacity-90",
  optionChevronHidden: "opacity-0",

  bottomNav:
    "fixed bottom-0 left-1/2 z-40 box-border h-[var(--vc-mobile-bottom-nav-height)] w-full max-w-[480px] -translate-x-1/2 rounded-t-[34px] border border-b-0 border-[#d8d1c6] bg-[#fffdf8]/96 px-8 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-14px_28px_rgba(73,63,51,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-[10px] min-[420px]:px-10 min-[420px]:pt-4",
  bottomNavGrid: "grid h-full grid-cols-4 items-end gap-1",
  bottomNavItem:
    "relative flex h-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-none text-[#174d46] transition active:scale-95",
  bottomNavItemActive: "text-[#2f746a]",
  bottomNavItemInactive: "hover:text-[#2f746a]",
  bottomNavItemDisabled: "cursor-default",
  bottomNavActiveGlow:
    "pointer-events-none absolute -bottom-5 h-20 w-24 rounded-full bg-[#8fa79f]/28 blur-2xl",
  bottomNavIcon: "relative z-10 h-9 w-9 min-[420px]:h-10 min-[420px]:w-10",
  bottomNavIconActive: "drop-shadow-[0_8px_18px_rgba(47,116,106,0.2)]",
  bottomNavLabel: "relative z-10 vc-reading-serif text-[18px] leading-none min-[420px]:text-[23px]",
} as const;
