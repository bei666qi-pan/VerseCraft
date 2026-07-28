export const mobileReadingTokens = {
  colors: {
    background: "#f3eee6",
    paper: "#f9f5ee",
    paperRaised: "#fffdf9",
    ink: "#123f3c",
    inkSoft: "#55736d",
    muted: "#8c908b",
    line: "#d6cfc4",
    lineStrong: "#c9c0b3",
    accent: "#2d756b",
    accentSoft: "#91aaa3",
  },
  shadows: {
    header: "0 10px 30px rgba(52, 45, 35, 0.08)",
    actionDock: "0 16px 36px rgba(46, 40, 32, 0.14)",
    sendGlow: "0 8px 18px rgba(45, 117, 107, 0.16)",
    bottomNav: "0 -14px 36px rgba(46, 40, 32, 0.1)",
    activeNavGlow: "0 8px 20px rgba(45, 117, 107, 0.11)",
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
    actionDockHeight: "4.05rem",
    actionButton: "2.35rem",
    talentButton: "2.35rem",
    sendButton: "2.35rem",
    bottomNavRadius: "30px",
    bottomNavMinHeight: "var(--vc-mobile-bottom-nav-height)",
  },
  safeArea: {
    topPadding: "max(1rem, env(safe-area-inset-top))",
    bottomPadding: "max(1.2rem, env(safe-area-inset-bottom))",
  },
  layout: {
    maxShellWidth: "480px",
    minViewportHeight: "calc(var(--vc-vh, 1svh) * 100)",
  },
  typography: {
    serifClassName: "vc-reading-serif",
    serifStack: "\"Times New Roman\", \"Songti SC\", \"SimSun\", \"Noto Serif CJK SC\", serif",
  },
} as const;

export type MobileReadingTokens = typeof mobileReadingTokens;

export const mobileReadingTheme = {
  shellFrame:
    "flex min-h-[calc(var(--vc-vh,1svh)_*_100)] w-full justify-center overflow-x-hidden bg-[#f3eee6]",
  shell:
    "vc-reading-surface relative flex min-h-[calc(var(--vc-vh,1svh)_*_100)] w-full max-w-[480px] flex-col overflow-x-hidden text-[#123f3c] shadow-[0_0_80px_rgba(55,46,35,0.14)] transition-all duration-700 md:border-x md:border-[#d6cfc4]",
  shellBody: "relative isolate min-h-[calc(var(--vc-vh,1svh)_*_100)] overflow-visible",

  header:
    "sticky top-0 z-40 box-border h-[var(--vc-mobile-header-height)] border-b border-[#d6cfc4]/90 bg-[rgba(249,245,238,0.94)] px-6 pb-0 pt-[max(0.75rem,env(safe-area-inset-top))] text-[#123f3c] shadow-[0_10px_30px_rgba(52,45,35,0.08)] backdrop-blur-xl",
  headerCodex:
    "sticky top-0 z-40 box-border h-[var(--vc-mobile-header-height)] border-b border-[#d6cfc4]/90 bg-[rgba(249,245,238,0.94)] px-5 pb-0 pt-[max(0.7rem,env(safe-area-inset-top))] text-[#123f3c] shadow-[0_8px_24px_rgba(52,45,35,0.065)] backdrop-blur-xl min-[420px]:px-6",
  headerPinned:
    "fixed left-1/2 top-0 z-50 box-border h-[var(--vc-mobile-header-height)] w-full max-w-[480px] -translate-x-1/2 border-b border-[#d6cfc4]/90 bg-[rgba(249,245,238,0.94)] px-6 pb-0 pt-[max(0.75rem,env(safe-area-inset-top))] text-[#123f3c] shadow-[0_10px_30px_rgba(52,45,35,0.08)] backdrop-blur-xl md:border-x md:border-[#d6cfc4]",
  headerCodexPinned:
    "fixed left-1/2 top-0 z-50 box-border h-[var(--vc-mobile-header-height)] w-full max-w-[480px] -translate-x-1/2 border-b border-[#d6cfc4]/90 bg-[rgba(249,245,238,0.94)] px-5 pb-0 pt-[max(0.7rem,env(safe-area-inset-top))] text-[#123f3c] shadow-[0_8px_24px_rgba(52,45,35,0.065)] backdrop-blur-xl min-[420px]:px-6 md:border-x md:border-[#d6cfc4]",
  headerSpacer: "h-[var(--vc-mobile-header-height)] shrink-0",
  headerRow: "flex h-full items-center justify-between gap-3",
  headerBrand: "flex min-w-0 flex-1 flex-col items-start justify-center gap-1 vc-reading-serif",
  headerBrandCodex: "flex min-w-0 flex-1 items-center gap-3 vc-reading-serif",
  headerLogoGroup: "flex shrink-0 items-center gap-1.5",
  headerCodexLogoGroup: "flex shrink-0 items-center gap-2",
  brandWordmark:
    "whitespace-nowrap text-[18px] font-semibold leading-none tracking-[-0.015em] text-[#55736d] min-[420px]:text-[20px]",
  brandWordmarkCodex:
    "whitespace-nowrap text-[31px] font-semibold leading-none tracking-[-0.025em] text-[#123f3c] min-[420px]:text-[36px]",
  brandMark: "h-4 w-4 shrink-0 text-[#55736d] min-[420px]:h-5 min-[420px]:w-5",
  brandMarkCodex: "h-7 w-7 shrink-0 text-[#123f3c] min-[420px]:h-8 min-[420px]:w-8",
  brandDivider: "hidden",
  brandDividerCodex: "h-9 w-px shrink-0 bg-[#c9c0b3] min-[420px]:h-11",
  chapterTitle:
    "block w-full max-w-full whitespace-normal break-keep text-[24px] font-semibold leading-[1.08] tracking-[-0.025em] text-[#123f3c] [text-wrap:balance] min-[420px]:text-[28px]",
  chapterTitleCodex:
    "min-w-0 truncate text-[25px] font-semibold leading-none tracking-[-0.02em] text-[#123f3c] min-[420px]:text-[30px]",
  audioButton:
    "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-[#d6cfc4] bg-[rgba(255,253,249,0.86)] text-[#123f3c] shadow-[0_10px_24px_rgba(51,44,35,0.12),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-xl transition hover:border-[#2d756b]/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d756b]/35 active:scale-95 min-[420px]:h-[58px] min-[420px]:w-[58px]",
  audioButtonCodex:
    "flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#d6cfc4] bg-[rgba(255,253,249,0.88)] text-[#123f3c] shadow-[0_10px_24px_rgba(51,44,35,0.12),inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-xl transition hover:border-[#2d756b]/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d756b]/35 active:scale-95 min-[420px]:h-[64px] min-[420px]:w-[64px]",
  audioIcon: "h-[1.55rem] w-[1.55rem] min-[420px]:h-7 min-[420px]:w-7",
  audioIconCodex: "h-7 w-7 min-[420px]:h-8 min-[420px]:w-8",

  iconButton:
    "flex shrink-0 items-center justify-center rounded-full border border-[#d6cfc4] bg-[rgba(255,253,249,0.88)] text-[#123f3c] shadow-[0_8px_18px_rgba(51,44,35,0.1),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-xl transition hover:border-[#2d756b]/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d756b]/35 disabled:cursor-not-allowed disabled:opacity-45",
  storyViewport: "relative flex flex-col",

  actionDock:
    "pointer-events-none fixed left-1/2 z-[80] w-full max-w-[480px] -translate-x-1/2 px-[1rem] pb-0 pt-0 min-[420px]:px-[1.35rem]",
  actionDockCollapsed:
    "bottom-[calc(var(--vc-mobile-bottom-nav-height)+0.65rem)]",
  actionDockExpanded:
    "bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-options-panel-height)+var(--vc-mobile-stack-gap)+var(--vc-mobile-stack-gap))]",
  actionDockPill:
    "pointer-events-auto flex h-[3.9rem] items-center gap-1 rounded-[1.25rem] border border-[#d6cfc4] bg-[rgba(255,253,249,0.92)] px-2 shadow-[0_16px_36px_rgba(46,40,32,0.14),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-xl",
  talentButton:
    "h-[2.35rem] w-[2.35rem] enabled:hover:bg-white enabled:active:scale-95 min-[420px]:h-[2.56rem] min-[420px]:w-[2.56rem]",
  talentButtonReady:
    "border-[#b9d0c7] bg-[#fffef9] text-[#0f6a60] shadow-[0_0_18px_rgba(45,117,107,0.24),0_7px_16px_rgba(45,117,107,0.12),inset_0_1px_0_rgba(255,255,255,0.96)]",
  talentButtonCooling:
    "border-[#d6cfc4] bg-[#f2ede5] text-[#8c908b] opacity-70 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
  talentIcon: "h-[1.25rem] w-[1.25rem] min-[420px]:h-[1.35rem] min-[420px]:w-[1.35rem]",
  actionInput:
    "min-w-0 flex-1 rounded-[0.9rem] border border-transparent bg-[#f8f4ed] px-3 py-2.5 vc-reading-serif text-[14px] leading-none text-[#123f3c] outline-none transition placeholder:text-[#969b96] focus:border-[#2d756b]/55 focus:bg-white focus:shadow-[0_0_0_3px_rgba(45,117,107,0.12)] disabled:opacity-60 min-[420px]:px-4 min-[420px]:text-[15px]",
  optionsToggleButton: "h-[2.35rem] w-[2.35rem] hover:bg-white active:scale-95 min-[420px]:h-[2.56rem] min-[420px]:w-[2.56rem]",
  optionsToggleIconCollapsed: "h-[1.25rem] w-[1.25rem] min-[420px]:h-[1.35rem] min-[420px]:w-[1.35rem]",
  optionsToggleIconExpanded: "h-[1.25rem] w-[1.25rem]",
  sendButton:
    "flex h-[2.35rem] w-[2.35rem] shrink-0 items-center justify-center rounded-[0.9rem] border border-[#b9cec8] bg-[linear-gradient(180deg,#fafffd,#edf7f3)] text-[#155c54] shadow-[0_8px_18px_rgba(45,117,107,0.16),inset_0_1px_0_rgba(255,255,255,0.96)] transition duration-300 enabled:hover:border-[#2d756b]/45 enabled:hover:bg-white enabled:active:scale-95 disabled:opacity-60 min-[420px]:h-[2.56rem] min-[420px]:w-[2.56rem]",
  sendButtonFlash: "scale-95 brightness-105",
  sendIcon: "ml-0.5 h-[1.45rem] w-[1.45rem]",

  optionsDropdown:
    "fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-stack-gap))] left-1/2 z-40 h-[var(--vc-mobile-options-panel-height)] w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 overflow-hidden rounded-[1.25rem] border border-[#d6cfc4] bg-[rgba(255,253,249,0.95)] shadow-[0_18px_42px_rgba(46,40,32,0.14),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-xl min-[420px]:w-[calc(100%-2.7rem)]",
  optionsEmptyState:
    "fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-stack-gap))] left-1/2 z-40 w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 rounded-[1.25rem] border border-[#d6cfc4] bg-[rgba(255,253,249,0.95)] px-6 py-5 vc-reading-serif text-[18px] leading-normal text-[#55736d] shadow-[0_18px_42px_rgba(46,40,32,0.14),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-xl min-[420px]:w-[calc(100%-2.7rem)]",
  optionRow:
    "flex h-1/4 w-full items-center justify-between gap-2.5 border-[#e4ded5] px-5 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 min-[420px]:gap-3 min-[420px]:px-6",
  optionRowDivider: "border-b",
  optionRowInteractive: "hover:bg-[#f3efe8] active:bg-[#eee8df]",
  optionRowHidden: "pointer-events-none",
  optionLabel:
    "block min-w-0 flex-1 whitespace-normal break-words vc-reading-serif text-[15px] leading-[1.3] text-[#123f3c] transition-opacity duration-300 [text-wrap:pretty] min-[420px]:text-[17px]",
  optionLabelVisible: "opacity-100",
  optionLabelHidden: "select-none opacity-0",
  optionChevron: "h-6 w-6 shrink-0 text-[#2d756b] transition-opacity",
  optionChevronVisible: "opacity-[0.85]",
  optionChevronHidden: "opacity-0",

  bottomNav:
    "fixed bottom-0 left-1/2 z-40 box-border h-[var(--vc-mobile-bottom-nav-height)] w-full max-w-[480px] -translate-x-1/2 rounded-t-[30px] border border-b-0 border-[#d6cfc4] bg-[rgba(255,253,249,0.94)] px-5 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_36px_rgba(46,40,32,0.1),inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-xl min-[420px]:px-7",
  bottomNavGrid: "grid h-full grid-cols-5 items-end gap-1",
  bottomNavItem:
    "relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[#123f3c] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d756b]/30 active:scale-95",
  bottomNavItemActive: "bg-[#edf5f1] text-[#2d756b] shadow-[0_8px_20px_rgba(45,117,107,0.1)]",
  bottomNavItemInactive: "hover:bg-[#f6f2eb] hover:text-[#2d756b]",
  bottomNavItemDisabled: "cursor-default",
  bottomNavActiveIndicator:
    "pointer-events-none absolute bottom-[0.1rem] h-[3px] w-6 rounded-full bg-[#2d756b]",
  bottomNavIcon: "relative z-10 h-8 w-8 min-[420px]:h-9 min-[420px]:w-9",
  bottomNavIconActive: "",
  bottomNavLabel: "relative z-10 vc-reading-serif text-[15px] leading-none min-[420px]:text-[17px]",
} as const;
