"use client";

import { X } from "lucide-react";
import { glassModalOverlay, glassPlayDialogSurface } from "@/lib/ui/glassStyles";

export function PlayBlockingModals({
  showDialoguePaywall,
  showRegisterPrompt,
  onPaywallRegister,
  showExitModal,
  onDismissExitModal,
  onSaveAndExit,
  onAbandonAndDie,
}: {
  showDialoguePaywall: boolean;
  showRegisterPrompt: boolean;
  onPaywallRegister: () => void;
  showExitModal: boolean;
  onDismissExitModal: () => void;
  onSaveAndExit: () => void;
  onAbandonAndDie: () => void;
}) {
  return (
    <>
      {showDialoguePaywall && (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center ${glassModalOverlay}`}
          role="dialog"
          aria-modal
        >
          <div className={`${glassPlayDialogSurface} p-8`}>
            <h2 className="text-lg font-semibold tracking-wide text-white">体验次数已耗尽</h2>
            {showRegisterPrompt && (
              <p className="mt-3 text-sm leading-relaxed text-slate-200">
                体验次数已耗尽。若你仍要继续行动，请注册或登录。
              </p>
            )}
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={onPaywallRegister}
                className="group relative inline-flex items-center gap-3 rounded-full border border-white/15 bg-slate-900/70 px-8 py-3 text-sm font-semibold text-slate-50 shadow-[0_0_40px_rgba(15,23,42,0.9)] backdrop-blur-2xl transition-all duration-300 hover:scale-105 hover:border-cyan-300/70 hover:shadow-[0_0_55px_rgba(56,189,248,0.85)]"
              >
                <span className="relative">注册 / 登录</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#f2eee7]/68 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal
          aria-labelledby="exit-modal-title"
        >
          <div
            data-testid="play-exit-paper-modal"
            className="relative w-full max-w-[1040px] rounded-[30px] border border-[#bfb4a2] bg-[#fffdf8]/97 p-[clamp(2rem,5vw,5rem)] text-[#0f5a52] shadow-[0_26px_76px_rgba(76,61,42,0.22),inset_0_0_0_10px_rgba(248,243,235,0.96),inset_0_0_0_11px_rgba(218,207,191,0.7),inset_0_0_0_24px_rgba(255,253,248,0.9),inset_0_0_0_25px_rgba(226,216,200,0.62)] sm:rounded-[42px]"
          >
            <button
              type="button"
              onClick={onDismissExitModal}
              aria-label="取消退出"
              className="absolute right-[clamp(1.4rem,4vw,4rem)] top-[clamp(1.4rem,4vw,4rem)] inline-flex h-[clamp(3.4rem,6vw,5.2rem)] w-[clamp(3.4rem,6vw,5.2rem)] items-center justify-center rounded-full border border-[#9f967f] bg-[#fffdf8] text-[#0f5a52] shadow-[0_5px_14px_rgba(78,63,47,0.12)] transition hover:bg-white"
            >
              <X className="h-[56%] w-[56%]" strokeWidth={1.9} aria-hidden />
            </button>
            <h2
              id="exit-modal-title"
              className="vc-reading-serif pr-20 text-[clamp(2.3rem,6vw,5rem)] font-semibold leading-none tracking-normal text-[#0f5a52]"
            >
              退出确认
            </h2>
            <p className="vc-reading-serif mt-[clamp(2.2rem,5vw,4.5rem)] max-w-[760px] text-[clamp(1.35rem,3.1vw,2.6rem)] leading-[1.75] tracking-normal text-[#0f5a52]">
              选择“存档退出”会先存档再返回首页；
              <br />
              选择“直接退出”将放弃本次存档。
            </p>
            <div className="mt-[clamp(2.8rem,6vw,5.4rem)] flex flex-col gap-5 sm:flex-row sm:justify-center sm:gap-10">
              <button
                type="button"
                onClick={onSaveAndExit}
                data-testid="play-exit-save-button"
                className="vc-reading-serif relative min-h-[4.4rem] min-w-[min(100%,300px)] rounded-[16px] border border-[#b7ad99] bg-[#fffdf8] px-10 py-4 text-[clamp(1.45rem,3vw,2.5rem)] font-semibold text-[#0f5a52] shadow-[0_5px_14px_rgba(78,63,47,0.12)] transition hover:bg-white"
              >
                <span className="absolute left-5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border border-[#b7ad99]" aria-hidden />
                存档退出
                <span className="absolute right-5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border border-[#b7ad99]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onAbandonAndDie}
                data-testid="play-exit-direct-button"
                className="vc-reading-serif relative min-h-[4.4rem] min-w-[min(100%,300px)] rounded-[16px] border border-[#0f5a52] bg-[#fffdf8] px-10 py-4 text-[clamp(1.45rem,3vw,2.5rem)] font-semibold text-[#0f5a52] shadow-[0_5px_14px_rgba(78,63,47,0.12)] transition hover:bg-white"
              >
                <span className="absolute left-5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border border-[#b7ad99]" aria-hidden />
                直接退出
                <span className="absolute right-5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border border-[#b7ad99]" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
