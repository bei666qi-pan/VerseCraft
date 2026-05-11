import { buildVisibleSiteFailureMessage } from "@/lib/playRealtime/immersiveTurnContinuation";

export type PlayTurnFailureKind =
  | "network_or_gateway"
  | "site_busy"
  | "local_rate_limited"
  | "auth_or_config"
  | "csrf_failed"
  | "internal";

export function classifyPlayTurnFailure(args: {
  status?: number;
  upstreamStatus?: number;
  code?: string;
  reason?: string;
  body?: string;
  errorName?: string;
  errorMessage?: string;
  deadlineHit?: boolean;
}): PlayTurnFailureKind {
  const haystack = [
    args.code,
    args.reason,
    args.body,
    args.errorName,
    args.errorMessage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // CSRF check failure has a specific error code; surface it explicitly.
  if (/\bcsrf_check_failed\b/.test(haystack)) return "csrf_failed";

  const isLocalRateLimited =
    args.status === 429 &&
    /\brate_limited\b/.test(haystack) &&
    !/\b(upstream|upstream_rate|queue_full|risk_control|capacity|overloaded)\b/.test(haystack);
  if (isLocalRateLimited) return "local_rate_limited";

  if (
    args.status === 429 ||
    args.status === 503 ||
    args.upstreamStatus === 429 ||
    args.upstreamStatus === 503 ||
    /\b(rate[_-]?limit|too many requests|overloaded|capacity|queue_full|busy)\b/.test(haystack)
  ) {
    return "site_busy";
  }

  if (
    args.deadlineHit === true ||
    args.status === 504 ||
    /\b(timeout|timed out|aborterror|networkerror|fetch failed|econnreset|enotfound|socket|gateway)\b/.test(
      haystack
    )
  ) {
    return "network_or_gateway";
  }

  if (
    args.status === 401 ||
    args.status === 403 ||
    args.upstreamStatus === 401 ||
    args.upstreamStatus === 403 ||
    /\b(auth|credential|key|keys_missing|forbidden|invalid_ticket|upstream_auth_failed|no_credentials)\b/.test(
      haystack
    )
  ) {
    return "auth_or_config";
  }

  return "internal";
}

export function getPlayTurnFailureMessage(kind: PlayTurnFailureKind): string {
  if (kind === "network_or_gateway") return buildVisibleSiteFailureMessage("network_or_gateway");
  if (kind === "site_busy") return buildVisibleSiteFailureMessage("site_busy");
  if (kind === "local_rate_limited") return "请求节奏过快，请稍等片刻。";
  if (kind === "auth_or_config") return buildVisibleSiteFailureMessage("auth_or_config");
  if (kind === "csrf_failed") return "当前浏览器请求校验失败，请刷新页面或将链接复制到系统浏览器打开。";
  return "";
}

export function shouldShowFailureAsNarrative(kind: PlayTurnFailureKind): boolean {
  return kind === "network_or_gateway" || kind === "site_busy" || kind === "auth_or_config" || kind === "csrf_failed";
}
