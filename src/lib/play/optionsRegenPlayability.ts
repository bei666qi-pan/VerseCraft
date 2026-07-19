/**
 * Options-only 是玩家的辅助行动入口，不是状态提交入口。
 * 两条以上互不重复、已通过语义门的模型行动已足以让玩家继续游玩；
 * 仍保留四条作为补齐目标，绝不由客户端伪造剩余槽位。
 */
export const MIN_PLAYABLE_REGENERATED_OPTIONS = 2;
export const TARGET_REGENERATED_OPTIONS = 4;

export function isPlayableRegeneratedOptions(options: readonly unknown[]): boolean {
  return (
    options.length >= MIN_PLAYABLE_REGENERATED_OPTIONS &&
    options.length <= TARGET_REGENERATED_OPTIONS &&
    options.every((option) => typeof option === "string" && option.trim().length > 0)
  );
}

export function isCompleteRegeneratedOptions(options: readonly unknown[]): boolean {
  return options.length === TARGET_REGENERATED_OPTIONS && isPlayableRegeneratedOptions(options);
}
