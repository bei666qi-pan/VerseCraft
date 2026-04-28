"use client";

import { GAME_GUIDE_SECTIONS } from "../settingsCopy";

function OrnamentLine() {
  return (
    <div className="flex items-center gap-2 text-[#9fb0aa]" aria-hidden>
      <span className="h-px flex-1 bg-[#d8d1c6]" />
      <span className="text-[14px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#d8d1c6]" />
    </div>
  );
}

export function GameGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      data-testid="game-guide-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#ede7de]/64 px-4 py-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-guide-title"
    >
      <section className="relative w-full max-w-[440px] rounded-[26px] border border-[#d8d1c6] bg-[#fffdf8]/96 p-4 text-[#174d46] shadow-[0_18px_46px_rgba(73,63,51,0.16),inset_0_1px_0_rgba(255,255,255,0.92)]">
        <div className="pointer-events-none absolute inset-2 rounded-[22px] border border-[#ebe5dc]" aria-hidden />
        <div className="pointer-events-none absolute inset-4 rounded-[18px] border border-[#f0ece6]" aria-hidden />
        <div className="relative px-2 pb-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 top-1 z-10 rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-4 py-2 vc-reading-serif text-[17px] leading-none text-[#174d46] shadow-[0_6px_14px_rgba(73,63,51,0.1)] transition hover:bg-white active:scale-95"
          >
            关闭
          </button>
          <h2 id="game-guide-title" className="pointer-events-none vc-reading-serif text-center text-[42px] font-semibold leading-none text-[#174d46]">
            游戏指南
          </h2>
          <div className="mt-6">
            <OrnamentLine />
          </div>
          <div
            data-testid="game-guide-scroll"
            className="mt-5 max-h-[66vh] overflow-y-auto rounded-[16px] border border-[#d8d1c6] bg-[#fffdf8] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] [scrollbar-color:#8fa79f_#eee8df] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#8fa79f] [&::-webkit-scrollbar-track]:bg-[#eee8df]"
          >
            <div className="divide-y divide-[#ded8ce]">
              {GAME_GUIDE_SECTIONS.map((section) => (
                <section key={section.id} className="py-5 first:pt-0 last:pb-0">
                  <h3 className="vc-reading-serif text-[25px] font-semibold leading-tight text-[#174d46]">
                    {section.index} | {section.title}
                  </h3>
                  <p className="mt-3 vc-reading-serif text-[21px] leading-[1.75] text-[#174d46]">
                    {section.body}
                  </p>
                </section>
              ))}
            </div>
            <div className="mt-4 text-center text-[#9fb0aa]" aria-hidden>
              ◇
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
