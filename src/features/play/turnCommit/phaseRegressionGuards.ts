/**
 * 阶段回归守卫（纯函数）：
 * - 道具获得叙事一致性判定
 * - text -> options 自动补拉触发条件
 * - options 再生成结果规范化
 *
 * 注意：acquire 语义相关逻辑已提纯到 `semanticGuards.ts`，这里保持旧导出名以完全向后兼容。
 */

export { hasStrongAcquireSemantics, shouldWarnAcquireMismatch } from "./semanticGuards";

export function shouldAutoRegenerateOptionsOnModeSwitch(input: {
  prevMode: "text" | "options";
  nextMode: "text" | "options";
  switchedByUser: boolean;
  currentOptionsLength: number;
  /** 主链路 wait/stream/commit 阶段；与「全文 isChatBusy」不同，tail_draining 时为 false。 */
  blocksOptionsRegen: boolean;
  optionsRegenBusy: boolean;
  endgameActive: boolean;
  showEmbeddedOpening: boolean;
  isGuestDialogueExhausted: boolean;
}): boolean {
  if (!input.switchedByUser) return false;
  if (!(input.prevMode === "text" && input.nextMode === "options")) return false;
  if ((input.currentOptionsLength ?? 0) > 0) return false;
  if (input.blocksOptionsRegen || input.optionsRegenBusy) return false;
  if (input.endgameActive) return false;
  if (input.isGuestDialogueExhausted) return false;
  return true;
}

export function normalizeRegeneratedOptions(rawOptions: unknown, recent: string[]): string[] {
  const seen = new Set<string>();
  const recentSet = new Set(
    (Array.isArray(recent) ? recent : [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
  );
  const primary: string[] = [];
  const fallback: string[] = [];
  const source = Array.isArray(rawOptions) ? rawOptions : [];
  for (const row of source) {
    if (typeof row !== "string") continue;
    const v = row.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    if (v.length > 40) continue;
    if (!recentSet.has(v)) primary.push(v);
    else fallback.push(v);
  }
  return [...primary, ...fallback].slice(0, 4);
}
