/**
 * 开场模式：首轮由主笔生成 options，与「仅本地四选项」旧模式区分（产品语义，非持久化存档字段）。
 */
export type PlayOpeningOptionsSource = "model_first_turn" | "legacy_embedded_pool";

/** 当前产品默认：固定前文 + 主笔首轮四选项 */
export const CURRENT_OPENING_OPTIONS_SOURCE: PlayOpeningOptionsSource = "model_first_turn";
