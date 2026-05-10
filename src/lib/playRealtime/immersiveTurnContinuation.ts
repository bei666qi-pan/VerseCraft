export type VisibleSiteFailureKind =
  | "network_or_gateway"
  | "site_busy"
  | "auth_or_config"
  | "site_unavailable";

export function buildVisibleSiteFailureMessage(kind: VisibleSiteFailureKind): string {
  if (kind === "network_or_gateway") return "网站连接或网关暂时不稳定，请稍后再试。";
  if (kind === "site_busy") return "网站生成通道繁忙，请稍后再试。";
  if (kind === "auth_or_config") return "网站生成服务暂时不可用，请稍后再试。";
  return "网站暂时无法完成本次生成，请稍后再试。";
}

export function buildVisibleSiteFailureDmJson(args: {
  kind: VisibleSiteFailureKind;
  requestId?: string;
  reason?: string;
}): string {
  return JSON.stringify({
    is_action_legal: false,
    sanity_damage: 0,
    narrative: buildVisibleSiteFailureMessage(args.kind),
    is_death: false,
    consumes_time: false,
    consumed_items: [],
    options: [],
    internal_meta: {
      action: "site_fallback",
      request_id: args.requestId ?? "",
      reason: args.reason ?? args.kind,
      kind: args.kind,
    },
  });
}

export function buildInternalNoNarrativeDmJson(args: { requestId?: string; reason?: string } = {}): string {
  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "",
    is_death: false,
    consumes_time: false,
    consumed_items: [],
    options: [],
    internal_meta: {
      action: "internal_no_visible_fallback",
      request_id: args.requestId ?? "",
      reason: args.reason ?? "internal_non_visible",
    },
  });
}
