/**
 * 浏览器端可读的灰度（需 `NEXT_PUBLIC_` 前缀注入构建）。
 * 与 `versecraftRolloutFlags.ts` 服务器开关语义对齐；未设时默认与主线路径一致（true）。
 */

function readPublicBoolean(envName: string, defaultTrue: boolean): boolean {
  if (typeof process === "undefined") return defaultTrue;
  const v = process.env[envName];
  if (v === undefined) return defaultTrue;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "off") return false;
  return true;
}

/** 与 VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2 对齐；客户端用 NEXT_PUBLIC_ 镜像 */
export function getClientTaskVisibilityPolicyV2Enabled(): boolean {
  return readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2", true);
}
