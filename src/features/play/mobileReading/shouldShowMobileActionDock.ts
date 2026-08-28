/**
 * The action dock and the option-generation card occupy the same interaction
 * layer. While the latter is actively generating an empty option set, expose
 * only its single loading affordance instead of a second, disabled action UI.
 */
export function shouldShowMobileActionDock({
  optionsExpanded,
  optionsRegenBusy,
  optionCount,
}: {
  optionsExpanded: boolean;
  optionsRegenBusy: boolean;
  optionCount: number;
}): boolean {
  return !(optionsExpanded && optionsRegenBusy && optionCount === 0);
}
