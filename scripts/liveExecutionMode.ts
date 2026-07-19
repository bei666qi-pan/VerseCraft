import { URL } from "node:url";

export type CampaignExecutionMode = "live" | "mock" | "live_degraded";

export interface CampaignExecution {
  mode: CampaignExecutionMode;
  baseUrl: string;
  reason: string;
  probeLatencyMs: number | null;
}

function normalizeBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/$/, "");
  try {
    // Fail early on accidental paths such as /api/chat; campaign adapters
    // append their own endpoint and need the origin only.
    const parsed = new URL(value);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`invalid campaign base URL: ${raw}`);
  }
}

/**
 * Resolve whether a campaign really exercised the HTTP SUT.
 * A fallback is never implicit: callers must opt in with
 * LIVEPLAY_ALLOW_MOCK_FALLBACK=1 (or allowMockFallback=true).
 */
export async function resolveCampaignExecution(input: {
  baseUrl: string;
  allowMockFallback?: boolean;
  probeTimeoutMs?: number;
}): Promise<CampaignExecution> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const started = Date.now();
  const timeoutMs = Math.max(250, input.probeTimeoutMs ?? 1500);
  const allowFallback = input.allowMockFallback === true || process.env.LIVEPLAY_ALLOW_MOCK_FALLBACK === "1";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The root page may trigger a cold Next.js page compilation in dev mode.
    // Campaign reachability must not depend on that UI work or spend a chat
    // call, so use the small health endpoint instead.
    const response = await fetch(`${baseUrl}/api/health`, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    // Any HTTP response proves that the server is reachable.  A 404/405 is
    // acceptable because the probe intentionally does not spend a chat call.
    return { mode: "live", baseUrl, reason: `http_${response.status}`, probeLatencyMs: Date.now() - started };
  } catch (error) {
    clearTimeout(timer);
    const reason = error instanceof Error ? error.message : String(error);
    if (allowFallback) {
      return { mode: "live_degraded", baseUrl, reason: `probe_failed:${reason}`, probeLatencyMs: Date.now() - started };
    }
    throw new Error(`live SUT unreachable at ${baseUrl}: ${reason}; set LIVEPLAY_ALLOW_MOCK_FALLBACK=1 only for explicitly labelled mock runs`);
  }
}
