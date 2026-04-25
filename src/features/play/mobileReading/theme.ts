export const mobileReadingTheme = {
  shell:
    "vc-reading-surface flex h-[100dvh] flex-col overflow-hidden text-[#e7bb8f] transition-all duration-1000",
  shellBody: "relative flex min-h-0 flex-1 flex-col",
  header:
    "shrink-0 border-b border-[#b98563]/15 bg-[#03101a]/95 px-4 pb-3 pt-[max(1.15rem,env(safe-area-inset-top))] text-[#f2c79d] shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
  headerRow: "flex min-h-[62px] items-center justify-between gap-2.5",
  headerBrand: "flex min-w-0 items-center gap-2.5 vc-reading-serif",
  iconButton:
    "flex shrink-0 items-center justify-center rounded-full border border-[#d99b6f]/75 bg-[#091722] text-[#efb17f] shadow-[inset_0_0_12px_rgba(217,151,105,0.08)] transition",
  storyViewport: "flex min-h-0 flex-1 flex-col",
  actionDock: "shrink-0 bg-[#03101a] px-4 pb-3 pt-3",
  actionDockPill:
    "flex h-[64px] items-center gap-2 rounded-full border border-[#d79a6f]/75 bg-[#08141e]/95 px-3 shadow-[0_0_22px_rgba(221,151,96,0.2),inset_0_0_18px_rgba(221,151,96,0.06)]",
  actionInput:
    "min-w-0 flex-1 rounded-full border border-[#2c3a43] bg-[#07121b] px-4 py-2.5 vc-reading-serif text-[17px] leading-none text-[#e6bb91] outline-none transition placeholder:text-[#7b7e82] focus:border-[#d79a6f]/70 focus:bg-[#091722] disabled:opacity-60",
  optionsDropdown:
    "mx-4 mb-3 overflow-hidden rounded-[8px] border border-[#c4936d]/60 bg-[#0a1722]/96 shadow-[0_12px_34px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(236,181,137,0.06)]",
  bottomNav:
    "shrink-0 rounded-t-[28px] border border-b-0 border-[#d39a70]/18 bg-[#03101a]/95 px-5 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(233,177,132,0.1)]",
} as const;
