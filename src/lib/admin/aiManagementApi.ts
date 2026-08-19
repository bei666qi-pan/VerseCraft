import "server-only";

import { adminFail, adminJson } from "./apiEnvelope";
import { verifyAdminRequest } from "./authGuard";
import { checkAiManagementMutationRate, verifySameOrigin } from "./aiManagementSecurity";

export function friendlyAiManagementReason(error: unknown): string {
  const code = error instanceof Error ? error.message : "unknown";
  if (code.includes("encryption_key")) return "系统尚未完成安全密钥配置，请联系部署人员。";
  if (code.includes("url_")) return "服务地址不安全或无法访问，请填写公开的 HTTPS 地址。";
  if (code.includes("auth")) return "连接未通过，请确认 API Key 是否有效。";
  if (code.includes("timeout")) return "连接测试超时，请稍后重试或检查服务状态。";
  if (code.includes("dimension")) return "向量维度与模型返回结果不一致，请核对后重试。";
  if (code.includes("not_found")) return "没有找到这项配置，请刷新页面后重试。";
  if (code.includes("required") || code.includes("fields")) return "请补全服务和模型信息。";
  if (code.includes("route_model")) return "候选顺序中包含已停用的模型，请刷新后重新选择。";
  return "操作未完成，请稍后重试。";
}

export async function guardAiMutation(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard;
  if (!verifySameOrigin(req)) return { ok: false as const, response: adminJson(adminFail<null>("请求来源校验失败。", null), { status: 403 }) };
  const rate = checkAiManagementMutationRate(guard.actor);
  if (!rate.allowed) return { ok: false as const, response: adminJson(adminFail<null>("操作过于频繁，请稍后再试。", null), { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }) };
  return guard;
}

