"use client";

import { MAX_INPUT } from "../../playConstants";
import { MobileReadingIcons } from "../icons";
import { useMobileActionDock } from "../hooks/useMobileActionDock";
import { mobileReadingTheme } from "../theme";
import type { MobileActionDockProps } from "../types";
import { EchoTalentButton } from "./EchoTalentButton";

export function MobileActionDock({
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
}: MobileActionDockProps) {
  void inputMode;
  void _isLowSanity;
  void _isDarkMoon;

  const { canSubmitNow, inputLength, statusText, submitFlash, submitWithFlash, talentButtonLabel } =
    useMobileActionDock({
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
    });

  const OptionsIcon = optionsExpanded ? MobileReadingIcons.CollapseOptions : MobileReadingIcons.ExpandOptions;

  return (
    <div data-testid="mobile-action-dock" className={mobileReadingTheme.actionDock}>
      {hasAnyGate ? (
        <p className="py-3 text-center text-sm font-medium text-[#4f706a]">
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
          <div className={mobileReadingTheme.actionDockPill}>
            <EchoTalentButton
              label={talentButtonLabel}
              talentName={talentLabel}
              ready={talentReady}
              onUseTalent={onUseTalent}
            />
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
              placeholder="输入下一步行动或对白..."
              inputMode="text"
              enterKeyHint="send"
              maxLength={MAX_INPUT}
              aria-describedby="play-input-status"
              data-testid="manual-action-input"
              className={mobileReadingTheme.actionInput}
              disabled={chatBusy || isGuestDialogueExhausted}
            />
            <button
              type="button"
              onClick={onToggleOptions}
              aria-label={optionsExpanded ? "收起行动选项" : "展开行动选项"}
              aria-pressed={optionsExpanded}
              data-testid="options-toggle-button"
              disabled={chatBusy || isGuestDialogueExhausted}
              className={`${mobileReadingTheme.iconButton} ${mobileReadingTheme.optionsToggleButton}`}
            >
              <OptionsIcon
                className={
                  optionsExpanded
                    ? mobileReadingTheme.optionsToggleIconExpanded
                    : mobileReadingTheme.optionsToggleIconCollapsed
                }
                strokeWidth={1.8}
              />
            </button>
            <button
              type="submit"
              disabled={!canSubmitNow}
              aria-label="提交行动"
              data-testid="send-action-button"
              className={`${mobileReadingTheme.sendButton} ${
                submitFlash ? mobileReadingTheme.sendButtonFlash : ""
              }`}
            >
              <MobileReadingIcons.SendAction className={mobileReadingTheme.sendIcon} strokeWidth={2.2} />
            </button>
          </div>
          <div id="play-input-status" className="sr-only" aria-live="polite">
            {statusText} 字数：{inputLength}/{MAX_INPUT}
          </div>
        </form>
      )}
    </div>
  );
}
