/**
 * 玩家可见文案：将内部 NPC id（N-xxx）替换为注册表显示名（可灰度）。
 */

import { lookupNpcNameById } from "@/lib/registry/codexDisplay";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { incrPlayerFacingIdLeakCount } from "@/lib/observability/versecraftRolloutMetrics";

const NPC_ID_RE = /\bN-\d{3}\b/g;

/**
 * 若开启清洗：将独立出现的 `N-xxx` 替换为显示名；计数疑似泄露次数。
 */
export function sanitizePlayerFacingText(input: string): string {
  const flags = getVerseCraftRolloutFlags();
  if (!flags.enablePlayerFacingTextCleanup || !input) return input;
  let leaks = 0;
  const out = input.replace(NPC_ID_RE, (id) => {
    const name = lookupNpcNameById(id);
    if (name && name !== id) {
      leaks += 1;
      return name;
    }
    return id;
  });
  if (leaks > 0) incrPlayerFacingIdLeakCount(leaks);
  return out;
}

/** 纯函数版本（单测 / 不读 env）：强制替换并返回是否发生替换 */
export function replaceInternalNpcIdsForDisplay(input: string): { text: string; replaced: number } {
  let replaced = 0;
  const text = input.replace(NPC_ID_RE, (id) => {
    const name = lookupNpcNameById(id);
    if (name && name !== id) {
      replaced += 1;
      return name;
    }
    return id;
  });
  return { text, replaced };
}
