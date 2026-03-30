/**
 * 冷开场阶段（仅描述主链路顺序，供注释与测试对齐）。
 */
export type ColdOpeningStage =
  | "embedded_narrative_visible"
  | "awaiting_model_first_turn"
  | "first_turn_committed";
