import type { ModerationResult, RiskCategory } from "@/lib/security/types";
import type { VolcengineClientResponse } from "@/lib/security/providers/volcengine/types";

function mapLabelsToCategories(labels: string[]): RiskCategory[] {
  const out = new Set<RiskCategory>();
  for (const label of labels) {
    const l = String(label).toLowerCase();
    if (l.includes("sexual") || l.includes("porn")) out.add("sexual");
    else if (l.includes("violence")) out.add("violence");
    else if (l.includes("hate")) out.add("hate");
    else if (l.includes("illegal") || l.includes("extreme")) out.add("illegal_extreme");
    else if (l.includes("inject")) out.add("prompt_injection");
    else out.add("malicious_payload");
  }
  return out.size > 0 ? [...out] : ["none"];
}

export function normalizeVolcengineResult(resp: VolcengineClientResponse, sanitizedText: string): ModerationResult {
  if (!resp.ok || !resp.result) {
    return {
      decision: "review",
      severity: "medium",
      score: 55,
      categories: ["none"],
      reason: `volcengine_unavailable:${resp.error ?? "unknown"}`,
      sanitizedText,
      metadata: { status: resp.status, providerRequestId: resp.providerRequestId },
    };
  }

  const score = Number.isFinite(resp.result.score) ? Number(resp.result.score) : 50;
  const decision = resp.result.decision === "block" ? "block" : resp.result.decision === "allow" ? "allow" : "review";
  const categories = mapLabelsToCategories(resp.result.labels ?? []);
  const severity = score >= 90 ? "critical" : score >= 70 ? "high" : score >= 45 ? "medium" : "low";
  return {
    decision,
    severity,
    score,
    categories,
    reason: resp.result.reason ?? "volcengine_result",
    sanitizedText,
    metadata: { providerRequestId: resp.result.requestId ?? resp.providerRequestId },
  };
}
