import { isNonNarrativeOptionLike } from "@/lib/play/optionQuality";
import { buildOptionSemanticFingerprint, isHighSimilarOptionAction } from "@/lib/play/optionsSemanticFingerprint";

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

function coerceOptionToString(x: unknown): string | null {
  if (typeof x === "string") return x.trim() || null;
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    if (typeof o.label === "string" && o.label.trim()) return o.label.trim();
    if (typeof o.text === "string" && o.text.trim()) return o.text.trim();
  }
  return null;
}

export function normalizeRegeneratedOptions(rawOptions: unknown, recent: string[], currentOptions: string[] = []): string[] {
  const exactSeen = new Set<string>();
  const recentExactSet = new Set(
    (Array.isArray(recent) ? recent : [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
  );
  const currentExactSet = new Set(
    (Array.isArray(currentOptions) ? currentOptions : [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
  );
  const blockedByCurrent = Array.from(currentExactSet);
  const blockedByRecent = Array.from(recentExactSet);
  const accepted: string[] = [];
  const acceptedFingerprints = new Set<string>();
  const source = Array.isArray(rawOptions) ? rawOptions : [];
  for (const row of source) {
    const v = coerceOptionToString(row);
    if (!v) continue;
    if (isNonNarrativeOptionLike(v)) continue;
    if (v.length > 40) continue;

    // 1) 完全重复：同一批重生成里的重复值直接丢弃
    if (exactSeen.has(v)) continue;
    // 2) 当前选项复用：禁止把屏幕上已有项再次返回
    if (currentExactSet.has(v)) continue;
    // 3) 最近选项复用：默认强排除，不允许作为 fallback 回填
    if (recentExactSet.has(v)) continue;

    const fp = buildOptionSemanticFingerprint(v);
    // 4) 高相似语义复用：与 current/recent/已接受项任一高相似都丢弃
    if (blockedByCurrent.some((old) => isHighSimilarOptionAction(v, old))) continue;
    if (blockedByRecent.some((old) => isHighSimilarOptionAction(v, old))) continue;
    if (accepted.some((old) => isHighSimilarOptionAction(v, old))) continue;
    if (acceptedFingerprints.has(fp.key)) continue;

    exactSeen.add(v);
    acceptedFingerprints.add(fp.key);
    accepted.push(v);
  }
  return accepted.slice(0, 4);
}
