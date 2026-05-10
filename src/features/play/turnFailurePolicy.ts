import { buildVisibleSiteFailureMessage } from "@/lib/playRealtime/immersiveTurnContinuation";

export type PlayTurnFailureKind =
  | "network_or_gateway"
  | "site_busy"
  | "auth_or_config"
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
  if (kind === "auth_or_config") return buildVisibleSiteFailureMessage("auth_or_config");
  return "";
}

export function shouldShowFailureAsNarrative(kind: PlayTurnFailureKind): boolean {
  return kind === "network_or_gateway" || kind === "site_busy" || kind === "auth_or_config";
}
