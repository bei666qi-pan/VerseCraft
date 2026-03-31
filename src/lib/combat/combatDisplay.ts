/**
 * 兼容出口（命名更贴近产品）：隐藏战力玩家可见映射、战斗解释短句等。
 * 注意：这里不包含任何裸数展示。
 */
export {
  dangerTierToPlayerText,
  outcomeTierToConflictText,
  buildCombatExplainSnippets,
  buildNpcCombatPowerDisplay,
  styleTagsToPlayerHint,
} from "./combatPresentation";

