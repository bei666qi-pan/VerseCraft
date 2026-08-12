/**
 * Phase-1 协议一致性语义守卫（纯函数，可前后端共用）
 * - 避免在 route/page 等多处复制正则导致分叉
 */

export function hasStrongAcquireSemantics(text: string): boolean {
  const t = String(text ?? "");
  if (!t) return false;
  // 保守：只覆盖最常见的“已获得/已拿到”确定性措辞；不要把“看见/发现”算作强获得。
  // “捡起/拾起”在自然叙事中经常不带“了”（例如“我弯腰捡起刚才放下的铁管”），
  // 但仍是明确的所有权/获得断言。漏掉该形态会让 final resolver 的保守降级
  // 根本不执行，造成“结构化状态没有发奖、正文却说已收入背包”的分裂。
  // Bare “得到/获得” frequently describes abstract observations (for example
  // “得到相同反应” or “获得确认”) and must not trigger an inventory rollback.
  // Completion particles are strong enough on their own; bare verbs require a
  // nearby concrete-object / possession cue.
  if (/(获得了|拿到了|得到了|入手了|收下了|拾起(?:了)?|捡起(?:了)?)/.test(t)) return true;
  return /(?:获得|拿到|得到|入手|收下)(?:一|这|那|某|半|两|三|四|五|六|七|八|九|十|[0-9]|.{0,3}(?:钥匙|物品|道具|武器|装备|材料|药|绷带|档案|纸条|硬币|原石|铁管|手机|手电|卡片|徽章))/.test(t);
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
