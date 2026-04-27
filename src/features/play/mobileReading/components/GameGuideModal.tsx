"use client";

import { GAME_GUIDE_SECTIONS } from "../settingsCopy";

function OrnamentLine() {
  return (
    <div className="flex items-center gap-2 text-[#c97843]" aria-hidden>
      <span className="h-px flex-1 bg-[#a85d36]/80" />
      <span className="text-[14px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#a85d36]/80" />
    </div>
  );
}

export function GameGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      data-testid="game-guide-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 py-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-guide-title"
    >
      <section className="relative w-full max-w-[440px] rounded-[18px] border border-[#b86637]/85 bg-[#03110f]/96 p-4 text-[#e2bd73] shadow-[0_0_0_1px_rgba(211,126,64,0.35),0_22px_70px_rgba(0,0,0,0.55),inset_0_0_34px_rgba(226,151,79,0.06)]">
        <div className="pointer-events-none absolute inset-2 rounded-[16px] border border-[#b86637]/45" aria-hidden />
        <div className="pointer-events-none absolute inset-4 rounded-[14px] border border-[#7d4c31]/35" aria-hidden />
        <div className="relative px-2 pb-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 top-1 z-10 rounded-[10px] border border-[#c97843]/75 bg-[#06131a]/80 px-4 py-2 vc-reading-serif text-[17px] leading-none text-[#eeb16b] transition hover:bg-[#10202a] active:scale-95"
          >
            关闭
          </button>
          <h2 id="game-guide-title" className="pointer-events-none vc-reading-serif text-center text-[42px] font-semibold leading-none text-[#d9954b] drop-shadow-[0_0_14px_rgba(217,149,75,0.3)]">
            游戏指南
          </h2>
          <div className="mt-6">
            <OrnamentLine />
          </div>
          <div
            data-testid="game-guide-scroll"
            className="mt-5 max-h-[66vh] overflow-y-auto rounded-[12px] border border-[#96613e]/70 bg-black/84 px-5 py-5 shadow-[inset_0_0_22px_rgba(0,0,0,0.55)] [scrollbar-color:#c8874d_#1b120d] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c8874d] [&::-webkit-scrollbar-track]:bg-[#1b120d]"
          >
            <div className="divide-y divide-[#9d6037]/75">
              {GAME_GUIDE_SECTIONS.map((section) => (
                <section key={section.id} className="py-5 first:pt-0 last:pb-0">
                  <h3 className="vc-reading-serif text-[25px] font-semibold leading-tight text-[#e4a052]">
                    {section.index} | {section.title}
                  </h3>
                  <p className="mt-3 vc-reading-serif text-[21px] leading-[1.75] text-[#d7bd78]">
                    {section.body}
                  </p>
                </section>
              ))}
            </div>
            <div className="mt-4 text-center text-[#c97843]" aria-hidden>
              ◆
            </div>
          </div>
          <div className="mx-auto mt-5 w-[58%]">
            <OrnamentLine />
          </div>
        </div>
      </section>
    </div>
  );
}
