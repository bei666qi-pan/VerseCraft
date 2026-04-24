export type OptionsRegenTrigger = "auto_switch" | "manual_button" | "opening_fallback" | "auto_missing_main";
export type ClientTurnMode = "decision_required" | "narrative_only" | "system_transition";

export function getOptionsRegenSuccessHint(args: {
  trigger: OptionsRegenTrigger;
  turnMode: ClientTurnMode;
}): string | null {
  // 已移除长叙事自动续写功能：任何 turn_mode 下都需要选项，成功提示统一展示。
  void args.turnMode;
  if (args.trigger === "auto_missing_main") return "主笔已按当前剧情补全可选行动。";
  if (args.trigger === "manual_button") return "主笔已重新整理可选行动。";
  if (args.trigger === "opening_fallback") return "主笔已补全首轮可选行动。";
  return null;
}

