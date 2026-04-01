export type OptionsRegenTrigger = "auto_switch" | "manual_button" | "opening_fallback" | "auto_missing_main";
export type ClientTurnMode = "decision_required" | "narrative_only" | "system_transition";

export function getOptionsRegenSuccessHint(args: {
  trigger: OptionsRegenTrigger;
  turnMode: ClientTurnMode;
}): string | null {
  // 仅在“需要选项的决策回合”提示；过场/长叙事不提示，避免误导用户以为应该有选项。
  if (args.turnMode !== "decision_required") return null;
  if (args.trigger === "auto_missing_main") return "主笔已按当前剧情补全可选行动。";
  if (args.trigger === "manual_button") return "主笔已重新整理可选行动。";
  if (args.trigger === "opening_fallback") return "主笔已补全首轮可选行动。";
  return null;
}

