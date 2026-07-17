"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_INPUT } from "../../playConstants";
import { useGameStore } from "@/store/useGameStore";

export function useMobileActionDock({
  chatBusy,
  helperText,
  input,
  inputError,
  isGuestDialogueExhausted,
  onSubmitClick,
  showRegisterPrompt,
  talentCooldownText,
  talentLabel,
  talentReady,
}: {
  chatBusy: boolean;
  helperText: string;
  input: string;
  inputError: string;
  isGuestDialogueExhausted: boolean;
  onSubmitClick: () => void;
  showRegisterPrompt: boolean;
  talentCooldownText?: string | null;
  talentLabel?: string | null;
  talentReady: boolean;
}) {
  const isEnglish = useGameStore((state) => state.language) === "en-US";
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
      ? isEnglish ? `Use talent: ${talentLabel}` : `发动天赋：${talentLabel}`
      : `${talentLabel}${talentCooldownText ? isEnglish ? ` · ${talentCooldownText}` : `，${talentCooldownText}` : ""}`
    : isEnglish ? "No talent available" : "暂无可发动天赋";
  const statusText = inputError
    ? inputError
    : isGuestDialogueExhausted
      ? (showRegisterPrompt ? isEnglish ? "Your free turns are used. Register or sign in to keep playing." : "体验次数已耗尽。若你仍要继续行动，请注册或登录。" : "")
      : input.trim().length > MAX_INPUT
        ? isEnglish ? "This action is too long for the narrator." : "文本过长：将被叙事拒绝。"
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

  return {
    canSubmitNow,
    inputLength: input.trim().length,
    statusText,
    submitFlash,
    submitWithFlash,
    talentButtonLabel,
  };
}
