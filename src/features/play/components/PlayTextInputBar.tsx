"use client";

import { Clock3, Keyboard, List, Send } from "lucide-react";
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
  onTextIntent,
  onSubmitKey,
  onSubmitClick,
  onToggleOptions,
  chatBusy,
  helperText,
  showRegisterPrompt,
  isGuestDialogueExhausted,
  optionsExpanded = false,
  talentLabel,
  talentReady = false,
  talentCooldownText,
  onUseTalent,
}: {
  inputMode: "options" | "text" | string;
  hasAnyGate: boolean;
  gateMessage: string;
  isLowSanity: boolean;
  isDarkMoon: boolean;
  input: string;
  inputError: string;
  onInputChange: (value: string) => void;
  onTextIntent?: () => void;
  onSubmitKey: () => void;
  onSubmitClick: () => void;
  onToggleOptions: () => void;
  chatBusy: boolean;
  helperText: string;
  showRegisterPrompt: boolean;
  isGuestDialogueExhausted: boolean;
  optionsExpanded?: boolean;
  talentLabel?: string | null;
  talentReady?: boolean;
  talentCooldownText?: string | null;
  onUseTalent?: () => void;
}) {
  void inputMode;
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
  const talentButtonLabel = talentLabel
    ? talentReady
      ? `发动天赋：${talentLabel}`
      : `${talentLabel}${talentCooldownText ? `，${talentCooldownText}` : ""}`
    : "暂无可发动天赋";
  const statusText = inputError
    ? inputError
    : isGuestDialogueExhausted
      ? (showRegisterPrompt ? "体验次数已耗尽。若你仍要继续行动，请注册或登录。" : "")
      : input.trim().length > MAX_INPUT
        ? "文本过长：将被叙事拒绝。"
        : helperText;

  function submitWithFlash() {
    if (!canSubmitNow) return;
    setSubmitFlash(true);
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setSubmitFlash(false);
      flashTimerRef.current = null;
    }, 650);
    onSubmitClick();
  }

  return (
    <div className="shrink-0 bg-[#03101a] px-4 pb-3 pt-3">
      {hasAnyGate ? (
        <p className="py-3 text-center text-sm font-medium text-[#d6a07b]">
          {gateMessage}
        </p>
      ) : (
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            submitWithFlash();
          }}
        >
          <div className="flex h-[64px] items-center gap-2 rounded-full border border-[#d79a6f]/75 bg-[#08141e]/95 px-3 shadow-[0_0_22px_rgba(221,151,96,0.2),inset_0_0_18px_rgba(221,151,96,0.06)]">
            <button
              type="button"
              onClick={() => {
                if (!talentReady) return;
                onUseTalent?.();
              }}
              disabled={!talentReady}
              aria-label={talentButtonLabel}
              title={talentButtonLabel}
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-[#d99b6f]/75 bg-[#091722] text-[#efb17f] shadow-[inset_0_0_12px_rgba(217,151,105,0.08)] transition enabled:hover:bg-[#0d1d2a] enabled:active:scale-95 disabled:opacity-95"
            >
              <Clock3 className="h-7 w-7" strokeWidth={1.85} />
            </button>
            <input
              value={input}
              onFocus={onTextIntent}
              onChange={(event) => {
                onTextIntent?.();
                onInputChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmitKey();
                }
              }}
              placeholder="输入下一步行动或对白…"
              inputMode="text"
              enterKeyHint="send"
              aria-describedby="play-input-status"
              className="min-w-0 flex-1 rounded-full border border-[#2c3a43] bg-[#07121b] px-4 py-2.5 vc-reading-serif text-[17px] leading-none text-[#e6bb91] outline-none transition placeholder:text-[#7b7e82] focus:border-[#d79a6f]/70 focus:bg-[#091722] disabled:opacity-60"
              disabled={chatBusy || isGuestDialogueExhausted}
            />
            <button
              type="button"
              onClick={onToggleOptions}
              aria-label={optionsExpanded ? "收起行动选项" : "展开行动选项"}
              aria-pressed={optionsExpanded}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-[#d99b6f]/75 bg-[#091722] text-[#efb17f] shadow-[inset_0_0_12px_rgba(217,151,105,0.08)] transition hover:bg-[#0d1d2a] active:scale-95"
            >
              {optionsExpanded ? <Keyboard className="h-6 w-6" strokeWidth={1.8} /> : <List className="h-7 w-7" strokeWidth={1.8} />}
            </button>
            <button
              type="submit"
              disabled={!canSubmitNow}
              aria-label="提交行动"
              className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-[#e5ad78]/85 bg-[#11161a] text-[#ffc37f] shadow-[0_0_20px_rgba(239,177,127,0.35),inset_0_0_16px_rgba(239,177,127,0.08)] transition duration-500 enabled:hover:bg-[#171b1f] enabled:active:scale-95 disabled:opacity-75 ${
                submitFlash ? "scale-95" : ""
              }`}
            >
              <Send className="ml-1 h-7 w-7" strokeWidth={2.2} />
            </button>
          </div>
          <div id="play-input-status" className="sr-only" aria-live="polite">
            {statusText} 字数：{input.trim().length}/{MAX_INPUT}
          </div>
        </form>
      )}
    </div>
  );
}
