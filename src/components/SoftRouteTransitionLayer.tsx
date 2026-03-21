"use client";

type SoftRouteTransitionLayerProps = {
  open: boolean;
  onDismiss: () => void;
  onContinue: () => void;
  hint?: string;
  continueLabel?: string;
};

/** 淡淡磨砂层 + 中心跳转确认，用于进入世界 / 创建形象 / 意识潜入等过渡 */
export function SoftRouteTransitionLayer({
  open,
  onDismiss,
  onContinue,
  hint = "即将前往下一阶段",
  continueLabel = "确认前往",
}: SoftRouteTransitionLayerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
        aria-label="取消跳转"
        onClick={onDismiss}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white/35 px-8 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_24px_64px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <p className="text-center text-sm font-medium text-slate-600/95">{hint}</p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 w-full rounded-xl bg-white/45 py-3.5 text-sm font-semibold tracking-[0.35em] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-xl transition hover:bg-white/60 active:scale-[0.99]"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
