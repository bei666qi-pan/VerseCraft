"use client";

import { glassModalOverlay, glassPlayDialogSurface } from "@/lib/ui/glassStyles";

export function PlayBlockingModals({
  showDialoguePaywall,
  showRegisterPrompt,
  onPaywallRegister,
  showExitModal,
  onSaveAndExit,
  onAbandonAndDie,
}: {
  showDialoguePaywall: boolean;
  showRegisterPrompt: boolean;
  onPaywallRegister: () => void;
  showExitModal: boolean;
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
                体验次数已耗尽，可注册账号以继续执笔创作。
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
          className={`fixed inset-0 z-50 flex items-center justify-center ${glassModalOverlay}`}
          role="dialog"
          aria-modal
          aria-labelledby="exit-modal-title"
        >
          <div
            className={`${glassPlayDialogSurface} border-white/10 p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]`}
          >
            <h2 id="exit-modal-title" className="text-lg font-semibold text-slate-100">
              退出确认
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              选择“存档并退出”会先保存当前进度再返回首页；选择“直接退出”将不再额外保存本次进度。
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onSaveAndExit}
                className="rounded-xl border border-white/60 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 shadow-[0_0_12px_rgba(59,130,246,0.4)] transition hover:bg-white/10 hover:shadow-[0_0_16px_rgba(59,130,246,0.5)]"
              >
                存档并退出
              </button>
              <button
                type="button"
                onClick={onAbandonAndDie}
                className="rounded-xl bg-gradient-to-r from-red-700 to-red-800 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] transition hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]"
              >
                直接退出
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}