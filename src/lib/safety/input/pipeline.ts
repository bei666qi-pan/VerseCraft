import { createRequestId } from "@/lib/security/helpers";
import { moderateTextWithBaidu } from "@/lib/safety/client";
import { evaluateModerationDecision } from "@/lib/safety/decision/evaluator";
import { buildSafetyRuntimeContextFromPackets } from "@/lib/safety/policy/runtimeContext";
import type { ProviderSignal, SafetyRuntimeContext } from "@/lib/safety/policy/model";
import type { InputScene } from "@/lib/safety/input/scenes";
import { resolveInputScenePolicy } from "@/lib/safety/input/scenes";
import { precheckUserInput } from "@/lib/safety/input/precheck";
import { buildUserFacingMessage } from "@/lib/safety/input/userMessages";
import { fingerprintText, hashIdentifier, writeInputAuditEvent } from "@/lib/safety/input/audit";

export type InputModerationVerdict =
  | {
      decision: "allow";
      text: string;
      traceId: string;
      userMessage: string;
      debug?: Record<string, unknown>;
    }
  | {
      decision: "rewrite";
      text: string;
      traceId: string;
      userMessage: string;
      narrativeFallback?: string;
      debug?: Record<string, unknown>;
    }
  | {
      decision: "fallback";
      text: string;
      traceId: string;
      userMessage: string;
      narrativeFallback?: string;
      debug?: Record<string, unknown>;
    }
  | {
      decision: "reject";
      traceId: string;
      userMessage: string;
      narrativeFallback?: string;
      debug?: Record<string, unknown>;
    };

function toProviderSignal(baidu: Awaited<ReturnType<typeof moderateTextWithBaidu>>): ProviderSignal {
  return {
    provider: baidu.evidence.provider,
    decision: baidu.decision,
    riskLevel: baidu.riskLevel,
    categories: baidu.categories ?? [],
    score: baidu.score,
    reasonCode: baidu.reasonCode,
    evidence: baidu.evidence.vendor ?? {},
    errorKind: baidu.evidence.errorKind,
  };
}

function safetyRewriteForInput(text: string): string {
  // Deterministic, non-generative rewrite:
  // - Remove obvious contact patterns/URLs/emails
  // - Remove step-by-step markers
  // - Keep a short safe summary
  let s = text;
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[已移除邮箱]");
  s = s.replace(/https?:\/\/\S+/gi, "[已移除链接]");
  s = s.replace(/\b\d{7,}\b/g, "[已移除号码]");
  // Also remove common contact channel terms for privacy.
  s = s.replace(/(微信|V信|vx|QQ|电话|手机号)/gi, "[已移除联系方式]");
  s = s.replace(/(如何|怎么|教程|步骤|配方|材料|比例|第[一二三四五六七八九十]步)/g, "（细节省略）");
  s = s.trim();
  if (s.length > 400) s = s.slice(0, 400);
  if (!s) return "（为安全合规已省略细节）";
  // Ensure it's not too "form-like" for game action.
  return s;
}

export async function moderateInputOnServer(args: {
  scene: InputScene;
  text: string;
  /** Raw IDs (preferred). Will be hashed inside. */
  userId?: string;
  sessionId?: string;
  ip?: string;
  /** Already-hashed IDs (legacy). Prefer raw IDs above. */
  userIdHash?: string;
  sessionIdHash?: string;
  ipHash?: string;
  traceId?: string;
  runtimePacketsJson?: string | null; // optional: JSON.stringify(packets) from runtimeContextPackets builder
}): Promise<InputModerationVerdict> {
  const policy = resolveInputScenePolicy(args.scene);
  const traceId = args.traceId ?? createRequestId(`in_${args.scene}`);

  const userIdHash = args.userIdHash ?? (args.userId ? hashIdentifier("user", args.userId) : undefined);
  const sessionIdHash = args.sessionIdHash ?? (args.sessionId ? hashIdentifier("session", args.sessionId) : undefined);
  const ipHash = args.ipHash ?? (args.ip ? hashIdentifier("ip", args.ip) : undefined);

  const actorKey = userIdHash ?? sessionIdHash ?? ipHash ?? "unknown_actor";
  const pre = precheckUserInput({ scene: args.scene, text: args.text, actorKey });
  if (!pre.ok) {
    writeInputAuditEvent({
      traceId,
      scene: args.scene,
      stage: "input",
      actor: { userIdHash, sessionIdHash, ipHash },
      decision: "reject",
      riskLevel: "soft_block",
      providerSummary: { providers: [], categories: pre.flags },
      whitelist: { worldviewTerms: [], gameplayActions: [], styleToneHints: [], contextConsistent: false },
      fallbackUsed: false,
      reasonCode: pre.reasonCode,
      contentFingerprint: fingerprintText(pre.ok ? pre.sanitizedText : ""),
      rawTextSnippet: pre.ok ? pre.sanitizedText.slice(0, 180) : null,
    });
    return { decision: "reject", traceId, userMessage: pre.userMessage, debug: { precheckFlags: pre.flags } };
  }

  const sanitizedText = pre.sanitizedText;
  let runtimeContext: SafetyRuntimeContext | undefined = undefined;
  if (args.runtimePacketsJson) {
    try {
      const j = JSON.parse(args.runtimePacketsJson) as Record<string, unknown>;
      runtimeContext = buildSafetyRuntimeContextFromPackets(j);
    } catch {
      // ignore
    }
  }
  if (policy.isPublic) {
    runtimeContext = { ...(runtimeContext ?? {}), isPublic: true };
  }

  // Provider signals (Baidu) — treated as signals only.
  const providerSignals: ProviderSignal[] = [];
  const baiduResult = await moderateTextWithBaidu({
    text: sanitizedText,
    scene: policy.policyScene,
    stage: "input",
    traceId,
    userIdHash,
    routeContext: { inputScene: args.scene },
  });
  providerSignals.push(toProviderSignal(baiduResult));

  const verdict = evaluateModerationDecision({
    text: sanitizedText,
    scene: policy.policyScene,
    stage: "input",
    runtimeContext,
    providerSignals,
    failMode: policy.failMode,
  });

  const um = buildUserFacingMessage({ scene: args.scene, verdict });

  // Convert policy decision to input verdict with scene constraints.
  let decision: InputModerationVerdict["decision"] = verdict.decision;
  if (decision === "rewrite" && !policy.allowRewrite) {
    decision = "reject";
  }

  const rewrittenText =
    decision === "rewrite" || decision === "fallback"
      ? verdict.rewrittenText ?? safetyRewriteForInput(sanitizedText)
      : sanitizedText;

  writeInputAuditEvent({
    traceId,
    scene: args.scene,
    stage: "input",
    actor: { userIdHash, sessionIdHash, ipHash },
    decision,
    riskLevel: verdict.riskLevel,
    providerSummary: {
      providers: providerSignals.map((p) => p.provider),
      maxRisk: providerSignals.some((p) => p.riskLevel === "black")
        ? "black"
        : providerSignals.some((p) => p.riskLevel === "gray")
          ? "gray"
          : "normal",
      categories: providerSignals.flatMap((p) => p.categories ?? []).slice(0, 8),
      score: Math.max(0, ...providerSignals.map((p) => Number(p.score ?? 0))),
      errorKinds: providerSignals.map((p) => p.errorKind).filter(Boolean) as string[],
    },
    whitelist: verdict.whitelist ?? undefined,
    fallbackUsed: decision === "fallback",
    errorKind: providerSignals.map((p) => p.errorKind).find(Boolean),
    reasonCode: verdict.reasonCode,
    contentFingerprint: fingerprintText(sanitizedText),
    rawTextSnippet: sanitizedText.slice(0, 180),
  });

  if (decision === "reject") {
    return { decision: "reject", traceId, userMessage: um.message, narrativeFallback: um.narrativeFallback, debug: { precheckFlags: pre.flags, verdict } };
  }
  if (decision === "fallback") {
    return { decision: "fallback", traceId, text: rewrittenText, userMessage: um.message, narrativeFallback: um.narrativeFallback, debug: { precheckFlags: pre.flags, verdict } };
  }
  if (decision === "rewrite") {
    return { decision: "rewrite", traceId, text: rewrittenText, userMessage: um.message, narrativeFallback: um.narrativeFallback, debug: { precheckFlags: pre.flags, verdict } };
  }
  return { decision: "allow", traceId, text: sanitizedText, userMessage: um.message, debug: { precheckFlags: pre.flags, verdict } };
}

