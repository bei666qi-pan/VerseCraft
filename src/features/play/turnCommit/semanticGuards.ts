/**
 * Phase-1 协议一致性语义守卫（纯函数，可前后端共用）
 * - 避免在 route/page 等多处复制正则导致分叉
 */

export function hasStrongAcquireSemantics(text: string): boolean {
  const t = String(text ?? "");
  if (!t) return false;
  // 保守：只覆盖最常见的“已获得/已拿到”确定性措辞；不要把“看见/发现”算作强获得。
  return /(获得了|拿到了|得到了|入手了|收下了|拾起了|捡起了|获得|拿到|得到|入手|收下)/.test(t);
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

