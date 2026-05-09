import type { ModerationResult, RiskDecision } from "@/lib/security/types";

export function riskDecision(result: ModerationResult): RiskDecision {
  if (result.decision === "block") {
    return {
      blocked: true,
      statusCode: 403,
      userMessage: "当前输入或内容触发安全规则，请调整后重试。",
    };
  }
  if (result.decision === "review") {
    return {
      blocked: false,
      statusCode: 200,
      userMessage: "内容风险较高，已记录审计。",
    };
  }
  return {
    blocked: false,
    statusCode: 200,
    userMessage: "ok",
  };
}

export function safeBlockedDmJson(
  message: string,
  meta?: {
    action?: "allow" | "review" | "degrade" | "terminate" | "block";
    stage?: "pre_input" | "post_model" | "final_output" | "risk_control";
    riskLevel?: "normal" | "gray" | "black";
    requestId?: string;
    reason?: string;
  }
): string {
  return JSON.stringify({
    is_action_legal: false,
    sanity_damage: 1,
    narrative: message,
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    // 不再注入罐头短句冒充模型输出；客户端在 options 为空时会走
    // `requestFreshOptions` 再调一次实时模型，保证选项始终来自大模型。
    options: [] as string[],
    security_meta: {
      action: meta?.action ?? "degrade",
      stage: meta?.stage ?? "pre_input",
      risk_level: meta?.riskLevel ?? "gray",
      request_id: meta?.requestId ?? "",
      reason: meta?.reason ?? "blocked_by_policy",
    },
  });
}

export function nonNarrativeTurnGuardDmJson(
  message = "本回合触发叙事一致性保护，未写入剧情状态。请换一种方式重试。",
  meta?: {
    requestId?: string;
    reason?: string;
  }
): string {
  return JSON.stringify({
    is_action_legal: false,
    sanity_damage: 0,
    narrative: message,
    is_death: false,
    consumes_time: false,
    consumed_items: [],
    options: [] as string[],
    security_meta: {
      action: "review",
      stage: "post_model",
      risk_level: "normal",
      request_id: meta?.requestId ?? "",
      reason: meta?.reason ?? "turn_guard_blocked",
    },
  });
}

export function buildInWorldSafetyRedirect(input?: string | null): string {
  const text = String(input ?? "").trim();
  if (text.includes("无敌")) {
    return "当前行动包含无法由玩家直接声明成立的结果，请改成可执行动作后重试。";
  }
  if (text.length > 0) {
    return "当前行动无法按原描述执行，请调整措辞后重试。";
  }
  return "当前行动为空，请输入具体行动后重试。";
}
