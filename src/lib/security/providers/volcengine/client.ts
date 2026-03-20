import { env } from "@/lib/env";
import type { ModerationContext } from "@/lib/security/types";
import type { VolcengineClientResponse } from "@/lib/security/providers/volcengine/types";

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.volcengineSafetyApiKey ?? ""}`,
    "X-Volc-App-Id": env.volcengineSafetyAppId ?? "",
    "X-Volc-Region": env.volcengineSafetyRegion ?? "",
    "X-Volc-Api-Secret": env.volcengineSafetyApiSecret ?? "",
  };
}

export async function callVolcengineModeration(input: string, context: ModerationContext): Promise<VolcengineClientResponse> {
  const endpoint = env.volcengineSafetyEndpoint;
  if (!endpoint) {
    return { ok: false, status: 0, error: "missing_endpoint" };
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), env.securityModerationTimeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        text: input,
        scene: context.stage,
        request_id: context.requestId,
        user_id: context.userId ?? "",
        ip: context.ip ?? "",
      }),
      signal: ac.signal,
    });

    const txt = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      const value = txt ? JSON.parse(txt) : null;
      parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        providerRequestId: typeof parsed?.request_id === "string" ? parsed.request_id : undefined,
        error: typeof parsed?.error === "string" ? parsed.error : `http_${res.status}`,
      };
    }

    return {
      ok: true,
      status: res.status,
      providerRequestId: typeof parsed?.request_id === "string" ? parsed.request_id : undefined,
      result: {
        decision:
          typeof parsed?.decision === "string" &&
          (parsed.decision === "allow" || parsed.decision === "review" || parsed.decision === "block")
            ? parsed.decision
            : "review",
        score: Number(parsed?.score ?? 50),
        labels: Array.isArray(parsed?.labels) ? parsed.labels.map(String) : [],
        reason: typeof parsed?.reason === "string" ? parsed.reason : "provider_response",
        requestId: typeof parsed?.request_id === "string" ? parsed.request_id : undefined,
      },
    };
  } catch (error) {
    const err = error as Error;
    const isTimeout = err?.name === "AbortError";
    return { ok: false, status: 0, error: isTimeout ? "timeout" : "network_error" };
  } finally {
    clearTimeout(t);
  }
}
