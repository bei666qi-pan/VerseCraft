import { env } from "@/lib/env";
import { auditModeration } from "@/lib/security/audit";
import { createRequestId, safeErrorMessage } from "@/lib/security/helpers";
import { localRulesProvider } from "@/lib/security/providers/localRules";
import { riskDecision } from "@/lib/security/policy";
import type { ModerationContext, ModerationProvider, ModerationResult } from "@/lib/security/types";

function getProvider(): ModerationProvider {
  const configured = env.securityModerationProvider;
  if (configured === "local-rules") return localRulesProvider;
  if (configured === "auto") return localRulesProvider;
  if (configured === "volcengine") {
    // Deprecated: Volcano safety provider has been removed.
    console.warn("[security][moderation] volcengine provider has been removed; fallback to local-rules");
    return localRulesProvider;
  }
  return localRulesProvider;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("moderation_timeout")), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export async function moderateText(input: string, context: Omit<ModerationContext, "requestId"> & { requestId?: string }) {
  if (!env.securityModerationEnabled) {
    const pass: ModerationResult = {
      decision: "allow",
      score: 0,
      categories: ["none"],
      severity: "low",
      reason: "moderation_disabled",
      sanitizedText: input,
    };
    return { context: { ...context, requestId: context.requestId ?? createRequestId() }, result: pass, policy: riskDecision(pass) };
  }

  const requestId = context.requestId ?? createRequestId();
  const ctx: ModerationContext = { ...context, requestId };
  const provider = getProvider();

  try {
    const result = await withTimeout(provider.moderate(input, ctx), env.securityModerationTimeoutMs);
    auditModeration(ctx, result);
    return { context: ctx, result, policy: riskDecision(result), provider: provider.name };
  } catch (error) {
    const fallback: ModerationResult = env.securityModerationFailOpen
      ? {
          decision: "allow",
          score: 35,
          categories: ["none"],
          severity: "medium",
          reason: `moderation_fail_open:${safeErrorMessage(error)}`,
          sanitizedText: input,
        }
      : {
          decision: "block",
          score: 90,
          categories: ["malicious_payload"],
          severity: "critical",
          reason: `moderation_fail_closed:${safeErrorMessage(error)}`,
          sanitizedText: "",
        };

    auditModeration(ctx, fallback);
    return { context: ctx, result: fallback, policy: riskDecision(fallback), provider: provider.name };
  }
}
