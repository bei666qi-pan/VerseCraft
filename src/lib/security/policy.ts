import type { ModerationResult, RiskDecision } from "@/lib/security/types";

export const NARRATIVE_GUARD_IMMERSIVE_FALLBACK =
  "眼前的动静没有断开，我把尚未坐实的判断压在心里，顺着能确认的细节继续往前探。";

function compactVisibleText(value: unknown, max = 80): string {
  const text = String(value ?? "")
    .replace(/__VERSECRAFT_[A-Z_]+__:[\s\S]*$/g, "")
    .replace(/[{}[\]"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length <= max ? text : text.slice(Math.max(0, text.length - max)).trim();
}

function inferSceneAnchor(args: { narrative?: unknown; playerContext?: unknown; latestUserInput?: unknown }): string {
  const text = `${String(args.narrative ?? "")}\n${String(args.playerContext ?? "")}\n${String(args.latestUserInput ?? "")}`;
  if (/电梯/.test(text)) return "电梯口的暗光";
  if (/楼梯|台阶/.test(text)) return "楼梯间的回声";
  if (/门|门缝|门锁/.test(text)) return "门边的细响";
  if (/配电|灯|电线/.test(text)) return "灯管下的影子";
  if (/水|潮|湿/.test(text)) return "脚边的潮意";
  if (/走廊/.test(text)) return "走廊尽头的阴影";
  return "眼前这片安静";
}

export function buildImmersiveGuardFallback(args: {
  narrative?: unknown;
  playerContext?: unknown;
  latestUserInput?: unknown;
  reason?: unknown;
} = {}): string {
  const anchor = inferSceneAnchor(args);
  const tail = compactVisibleText(args.narrative, 64);
  const intent = compactVisibleText(args.latestUserInput, 36);
  if (intent && tail) {
    return `我把「${intent}」留在动作里，没有急着把它说成已经发生的结果。${anchor}还贴着刚才那一幕，我顺着能确认的痕迹继续往前探。`;
  }
  if (intent) {
    return `我把「${intent}」压低到更稳的节奏里。${anchor}还在，我一边确认退路，一边继续追着最近的动静走。`;
  }
  if (tail) {
    return `${tail} 我没有把不确定的影子当成答案，只让呼吸稳下来，沿着眼前能确认的细节继续判断。`;
  }
  return NARRATIVE_GUARD_IMMERSIVE_FALLBACK;
}

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
  message = NARRATIVE_GUARD_IMMERSIVE_FALLBACK,
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
