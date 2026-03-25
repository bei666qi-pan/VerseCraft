"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_INPUT } from "../playConstants";

export function PlayTextInputBar({
  inputMode,
  hasAnyGate,
  gateMessage,
  isLowSanity: _isLowSanity,
  isDarkMoon: _isDarkMoon,
  input,
  inputError,
  onInputChange,
  onSubmitKey,
  onSubmitClick,
  chatBusy,
  helperText,
  showRegisterPrompt,
  isGuestDialogueExhausted,
}: {
  inputMode: "options" | "text" | string;
  hasAnyGate: boolean;
  gateMessage: string;
  isLowSanity: boolean;
  isDarkMoon: boolean;
  input: string;
  inputError: string;
  onInputChange: (value: string) => void;
  onSubmitKey: () => void;
  onSubmitClick: () => void;
  chatBusy: boolean;
  helperText: string;
  showRegisterPrompt: boolean;
  isGuestDialogueExhausted: boolean;
}) {
  void _isLowSanity;
  void _isDarkMoon;

  const [submitFlash, setSubmitFlash] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, []);

  const canSubmitNow = !chatBusy && !isGuestDialogueExhausted && input.trim().length > 0;

  return (
    <div className="shrink-0 bg-slate-900/10 px-3 py-3 md:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {hasAnyGate ? (
        <p className="py-3 text-center text-sm font-medium text-neutral-600">
          {gateMessage}
        </p>
      ) : inputMode === "text" ? (
        <div className="relative">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmitKey();
              }}
              placeholder="输入你的创作动作/对白（最多20字）"
              inputMode="text"
              enterKeyHint="done"
              className="min-h-[44px] w-full rounded-xl bg-white/90 px-3 text-base text-slate-800 outline-none transition placeholder:text-slate-500 focus:bg-white touch-manipulation"
              disabled={chatBusy || isGuestDialogueExhausted}
            />
            <button
              type="button"
              onClick={() => {
                if (!canSubmitNow) return;
                setSubmitFlash(true);
                if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
                flashTimerRef.current = window.setTimeout(() => {
                  setSubmitFlash(false);
                  flashTimerRef.current = null;
                }, 650);
                onSubmitClick();
              }}
              disabled={chatBusy || input.trim().length === 0 || isGuestDialogueExhausted}
              className={`min-h-[44px] shrink-0 rounded-lg px-5 text-base font-semibold transition-colors duration-700 touch-manipulation disabled:opacity-40 ${
                canSubmitNow && !submitFlash
                  ? "bg-white/90 text-blue-700 hover:bg-white"
                  : "bg-foreground text-white"
              }`}
            >
              提交
            </button>
          </div>
          <div
            className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600"
          >
            <span>
              字数：{input.trim().length}/{MAX_INPUT}
            </span>
            <div className="flex items-center gap-3">
              {inputError ? (
                <span className="font-medium text-red-500">{inputError}</span>
              ) : (
                <span
                  className={
                    input.trim().length > MAX_INPUT || isGuestDialogueExhausted ? "text-red-500" : ""
                  }
                >
                  {isGuestDialogueExhausted
                    ? (showRegisterPrompt ? "体验次数已耗尽，可注册账号以继续执笔创作。" : "")
                    : input.trim().length > MAX_INPUT
                      ? "文本过长：将被叙事拒绝。"
                      : helperText}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-neutral-600">
          <span className="opacity-80">当前为选项模式，请直接点击上方选项推进文本。</span>
          <span className="hidden sm:inline opacity-60">
            想自由输入时，可用右上角按钮切换为手动输入。
          </span>
        </div>
      )}
      <div className="mt-2 text-center">
        <span className="text-[10px] tracking-wide text-slate-500/55">
          内容由 AI 演算生成，纯属虚构，请注意甄别，切勿代入现实。
        </span>
      </div>
    </div>
  );
}
