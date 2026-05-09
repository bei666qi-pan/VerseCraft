export const LIVE_GATE_TOTAL_BUDGET_MS = 6 * 60 * 1000;
export const LIVE_GATE_CASE_TIMEOUT_MS = 45 * 1000;
export const LIVE_GATE_MAX_CASES = 3;
export const LIVE_GATE_MAX_RETRIES = 1;
export const LIVE_GATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type MainAiLiveGateStatus = "pass" | "skipped" | "soft_failed";

export type LiveGateBypassDecision =
  | { kind: "none" }
  | { kind: "skipped"; reason: string }
  | { kind: "invalid"; reason: "bypass_reason_missing" };

export type LiveGateCacheEntry = {
  cacheKey: string;
  status: MainAiLiveGateStatus;
  createdAt: string;
};

export function resolveLiveGateBypass(env: Record<string, string | undefined>): LiveGateBypassDecision {
  if (env.VC_LIVE_GATE_BYPASS !== "1") return { kind: "none" };
  const reason = env.VC_LIVE_GATE_BYPASS_REASON?.trim();
  if (!reason) return { kind: "invalid", reason: "bypass_reason_missing" };
  return { kind: "skipped", reason };
}

export function isLiveGateCacheHit(entry: LiveGateCacheEntry | null, cacheKey: string, nowMs: number): boolean {
  if (!entry || entry.cacheKey !== cacheKey || entry.status !== "pass") return false;
  const createdAtMs = Date.parse(entry.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  return nowMs - createdAtMs >= 0 && nowMs - createdAtMs <= LIVE_GATE_CACHE_TTL_MS;
}

export function classifyLiveGateFailure(args: {
  missingLiveEnable?: boolean;
  missingServer?: boolean;
  budgetExceeded?: boolean;
  gatePass?: boolean;
  errors?: string[];
}): { status: MainAiLiveGateStatus; reason: string } {
  if (args.gatePass) return { status: "pass", reason: "live_cases_passed" };
  if (args.missingLiveEnable) return { status: "skipped", reason: "e2e_ai_live_not_enabled" };
  if (args.missingServer) return { status: "soft_failed", reason: "local_server_unavailable" };
  if (args.budgetExceeded) return { status: "soft_failed", reason: "budget_exceeded" };
  const firstError = args.errors?.find(Boolean);
  return { status: "soft_failed", reason: firstError ?? "live_gate_failed" };
}

export function shouldExitNonZero(status: MainAiLiveGateStatus, strict: boolean): boolean {
  return strict && status === "soft_failed";
}
