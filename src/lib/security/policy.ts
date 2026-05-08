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

export function buildInWorldSafetyRedirect(input?: string | null): string {
  const text = String(input ?? "").trim();
  if (text.includes("无敌")) {
    return "我大喊一声：“我无敌了！”声音撞在水泥墙上，把安全区里的尘灰震下来一点。老人先是愣住，随即压低嗓子骂我别把东西引过来。走廊尽头的摩擦声真的停了半拍，然后更贴近门缝地响起。荒唐没有变成力量，却把藏着的东西惊动了；趁那东西还没靠近，我必须马上决定是追问老人、后撤，还是换个方向离开。";
  }
  if (text.length > 0) {
    return "老人没有接我的话。他先看我的嘴唇，再看向走廊尽头，像是那几个字已经把什么东西从黑暗里拽醒。灯管啪地暗了一瞬，门缝后的摩擦声换了方向；这句话没能改变规则，却换来一个能利用的反应。趁它还在判断声源，我可以追问老人、立刻后撤，或贴着墙根换一条路。";
  }
  return "我刚要把那个念头说出口，安全区的灯忽然暗了一下。老人伸手按住桌沿，示意我先别出声；走廊深处的摩擦声停住，又在几秒后贴着墙根重新响起。这个停顿很短，却足够我重新选择下一步。";
}
