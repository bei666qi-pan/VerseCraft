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
    options: ["观察周围环境", "与附近住户沟通", "回到安全区整理思路", "检查行囊并重新行动"],
    security_meta: {
      action: meta?.action ?? "degrade",
      stage: meta?.stage ?? "pre_input",
      risk_level: meta?.riskLevel ?? "gray",
      request_id: meta?.requestId ?? "",
      reason: meta?.reason ?? "blocked_by_policy",
    },
  });
}
