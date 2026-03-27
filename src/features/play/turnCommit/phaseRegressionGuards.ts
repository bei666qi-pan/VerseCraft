/**
 * 阶段回归守卫（纯函数）：
 * - 道具获得叙事一致性判定
 * - text -> options 自动补拉触发条件
 * - options 再生成结果规范化
 */

export function hasStrongAcquireSemantics(text: string): boolean {
  const t = String(text ?? "");
  if (!t) return false;
  return /(获得|拿到|拾起|收下|找到|得到|入手|获得了|拿到了)/.test(t);
}

export function shouldWarnAcquireMismatch(input: {
  narrative: string;
  awardedItemWriteCount: number;
  awardedWarehouseWriteCount: number;
}): boolean {
  return (
    hasStrongAcquireSemantics(input.narrative) &&
    Math.max(0, Math.trunc(input.awardedItemWriteCount ?? 0)) === 0 &&
    Math.max(0, Math.trunc(input.awardedWarehouseWriteCount ?? 0)) === 0
  );
}

export function shouldAutoRegenerateOptionsOnModeSwitch(input: {
  prevMode: "text" | "options";
  nextMode: "text" | "options";
  switchedByUser: boolean;
  currentOptionsLength: number;
  isChatBusy: boolean;
  optionsRegenBusy: boolean;
  endgameActive: boolean;
  showEmbeddedOpening: boolean;
  isGuestDialogueExhausted: boolean;
}): boolean {
  if (!input.switchedByUser) return false;
  if (!(input.prevMode === "text" && input.nextMode === "options")) return false;
  if ((input.currentOptionsLength ?? 0) > 0) return false;
  if (input.isChatBusy || input.optionsRegenBusy) return false;
  if (input.endgameActive || input.showEmbeddedOpening) return false;
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
