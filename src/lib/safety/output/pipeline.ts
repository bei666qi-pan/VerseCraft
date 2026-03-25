import { envRaw } from "@/lib/config/envRaw";
import { moderateTextWithBaidu } from "@/lib/safety/client";
import { evaluateModerationDecision } from "@/lib/safety/decision/evaluator";
import type {
  ModerationDecision,
  ModerationStage,
  ProviderSignal,
  PolicyEvaluationResult,
  SafetyRuntimeContext,
} from "@/lib/safety/policy/model";
import { resolveOutputSceneAndStage, type OutputSceneKind } from "@/lib/safety/output/scenes";
import { sanitizeNarrativeForOutput } from "@/lib/safety/output/sanitizer";
import { buildOutputFallback } from "@/lib/safety/output/fallbackNarratives";
import { writeOutputAuditEvent, buildOutputActorHashes } from "@/lib/safety/output/audit";
import { fingerprintText } from "@/lib/safety/input/audit";

function resolveOutputFailMode(stage: ModerationStage): "fail_soft" | "fail_closed" {
  const privateMode = (envRaw("VC_OUTPUT_FAIL_MODE_PRIVATE") ?? "fail_soft").trim();
  const publicMode = (envRaw("VC_OUTPUT_FAIL_MODE_PUBLIC") ?? "fail_closed").trim();
  if (stage === "public_display") return publicMode === "fail_soft" ? "fail_soft" : "fail_closed";
  return privateMode === "fail_closed" ? "fail_closed" : "fail_soft";
}

function computeRuntimeContextForOutput(args: {
  locationId?: string | null;
  stage: ModerationStage;
}): SafetyRuntimeContext {
  const isB1SafeZone = args.locationId === "B1_SafeZone" || args.locationId === "B1_SAFEZONE";
  const floorId =
    typeof args.locationId === "string" && args.locationId.includes("_") ? (args.locationId.split("_")[0] ?? null) : null;
  return {
    locationId: args.locationId ?? null,
    floorId,
    isB1SafeZone,
    // Keep it minimal: whitelist consistency needs at least a locationId.
  };
}

function candidateTextFromDmRecord(dmRecord: Record<string, unknown>): string {
  const n = dmRecord.narrative;
  if (typeof n === "string") return n;
  return String(n ?? "");
}

function computeProviderErrorType(providerSignals: ProviderSignal[] | undefined): string | undefined {
  const kind = providerSignals?.map((p) => p.errorKind).find(Boolean);
  return kind ? String(kind) : undefined;
}

export type OutputModerationVerdictResult = {
  updatedDmRecord: Record<string, unknown>;
  verdict: "allow" | "rewrite" | "fallback" | "reject";
  decision: ModerationDecision;
  riskLevel: "allow" | "review" | "soft_block" | "hard_block";
  fallbackUsed: boolean;
  rewriteUsed: boolean;
  failMode: "fail_soft" | "fail_closed";
  latencyMs: number;
  providerErrorType?: string;
  providerRiskSummary?: {
    providers: string[];
    maxRisk?: "normal" | "gray" | "black";
    categories?: string[];
    score?: number;
    errorKinds?: string[];
  };
  reasonCode: string;
};

export async function auditDmOutputCandidateOnServer(args: {
  dmRecord: Record<string, unknown>;
  sceneKind: OutputSceneKind;
  traceId: string;
  routeContext?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  ip?: string;
  providerSignalsOverride?: ProviderSignal[];
  providerTextToModerate?: string;
}): Promise<OutputModerationVerdictResult> {
  const startedAt = Date.now();
  const { scene, stage } = resolveOutputSceneAndStage(args.sceneKind);
  const failMode = resolveOutputFailMode(stage);

  let providerSignals: ProviderSignal[] | undefined = args.providerSignalsOverride;
  let providerRiskSummary: OutputModerationVerdictResult["providerRiskSummary"];

  const dmLocationId = typeof args.dmRecord.player_location === "string" ? (args.dmRecord.player_location as string) : null;
  const runtimeContext = computeRuntimeContextForOutput({ locationId: dmLocationId, stage });

  const providerStage: "output" | "public" = stage === "public_display" ? "public" : "output";
  const candidateText = args.providerTextToModerate ?? candidateTextFromDmRecord(args.dmRecord);

  if (!providerSignals) {
    try {
      const actorHashes = buildOutputActorHashes({ userId: args.userId, sessionId: args.sessionId, ip: args.ip });
      const baiduModeration = await moderateTextWithBaidu({
        text: candidateText,
        scene,
        stage: providerStage,
        traceId: args.traceId,
        userIdHash: actorHashes.userIdHash,
        routeContext: args.routeContext,
      });
      providerSignals = [
        {
          provider: "baidu_text_censor",
          decision: baiduModeration.decision,
          riskLevel: baiduModeration.riskLevel,
          categories: baiduModeration.categories,
          score: baiduModeration.score,
          reasonCode: baiduModeration.reasonCode,
          evidence: baiduModeration.evidence as Record<string, unknown>,
          errorKind: baiduModeration.evidence?.errorKind ? String(baiduModeration.evidence.errorKind) : undefined,
        },
      ];
    } catch {
      providerSignals = [];
    }
  }

  const providerErrorType = computeProviderErrorType(providerSignals);

  if (providerSignals) {
    const providers = providerSignals.map((p) => p.provider);
    const errorKinds = providerSignals.map((p) => p.errorKind).filter(Boolean) as string[];
    const maxRisk = providerSignals.some((p) => p.riskLevel === "black")
      ? ("black" as const)
      : providerSignals.some((p) => p.riskLevel === "gray")
        ? ("gray" as const)
        : ("normal" as const);
    const allCats = providerSignals.flatMap((p) => p.categories ?? []);
    providerRiskSummary = { providers, errorKinds, maxRisk, categories: allCats.slice(0, 20) };
  }

  // Evaluate with VerseCraft policy engine.
  const evalResult: PolicyEvaluationResult = evaluateModerationDecision({
    text: candidateText,
    scene,
    stage,
    runtimeContext,
    providerSignals,
    failMode,
  });

  const providerFailed = Boolean(providerErrorType);

  // Apply rewrite/fallback narrative layer (deterministic, no streaming calls).
  const updatedDmRecord: Record<string, unknown> = { ...args.dmRecord };
  let fallbackUsed = false;
  let rewriteUsed = false;

  let verdict: OutputModerationVerdictResult["verdict"] = "allow";
  let decision: ModerationDecision = evalResult.decision;
  let riskLevel = evalResult.riskLevel;
  let reasonCode = evalResult.reasonCode;

  // System-failure override:
  // - private output: apply a stricter fallback unless local policy already hard-rejects.
  // - public display: fail-closed requires hard reject (even if local policy would allow).
  if (providerFailed) {
    if (stage === "public_display" && evalResult.decision !== "reject") {
      verdict = "reject";
      decision = "reject";
      riskLevel = "hard_block";
      reasonCode = "output_provider_failed_fail_closed_public";

      updatedDmRecord.is_action_legal = false;
      updatedDmRecord.sanity_damage = 1;
      updatedDmRecord.consumes_time = true;
      updatedDmRecord.consumed_items = [];
      updatedDmRecord.awarded_items = [];
      updatedDmRecord.awarded_warehouse_items = [];
      updatedDmRecord.codex_updates = [];
      updatedDmRecord.relationship_updates = [];
      updatedDmRecord.new_tasks = [];
      updatedDmRecord.task_updates = [];
      updatedDmRecord.npc_location_updates = [];
      updatedDmRecord.main_threat_updates = [];
      updatedDmRecord.weapon_updates = [];

      const fb = buildOutputFallback({
        scene,
        stage,
        decision: "reject",
        riskLevel: "hard_block",
        reasonCode,
        isProviderFailureFallback: true,
      });
      updatedDmRecord.narrative = fb.narrative;
      if (fb.options) updatedDmRecord.options = fb.options;
      fallbackUsed = false;
    } else if (stage === "output" && evalResult.decision !== "reject") {
      fallbackUsed = true;
      verdict = "fallback";
      decision = "fallback";
      reasonCode = "output_provider_failed_fail_soft";
      const fb = buildOutputFallback({
        scene,
        stage,
        decision: "fallback",
        riskLevel: "soft_block",
        reasonCode,
        isProviderFailureFallback: true,
      });
      updatedDmRecord.narrative = fb.narrative;
      if (fb.options) updatedDmRecord.options = fb.options;
    }
  }

  // Normal policy application when not overridden.
  if (!providerFailed || (providerFailed && verdict === "allow")) {
    if (evalResult.decision === "allow") {
      verdict = "allow";
    } else if (evalResult.decision === "rewrite") {
      verdict = "rewrite";
      rewriteUsed = true;
      const sanitized = sanitizeNarrativeForOutput({ scene, narrative: String(updatedDmRecord.narrative ?? "") });
      updatedDmRecord.narrative = sanitized.narrative;
      if (sanitized.usedRewrite) rewriteUsed = true;
    } else if (evalResult.decision === "fallback") {
      verdict = "fallback";
      fallbackUsed = true;
      const fb = buildOutputFallback({
        scene,
        stage,
        decision: evalResult.decision,
        riskLevel: evalResult.riskLevel,
        reasonCode: evalResult.reasonCode,
        isProviderFailureFallback: false,
      });
      updatedDmRecord.narrative = fb.narrative;
      if (fb.options) updatedDmRecord.options = fb.options;
    } else if (evalResult.decision === "reject") {
      verdict = "reject";
      reasonCode = evalResult.reasonCode;
      updatedDmRecord.is_action_legal = false;
      updatedDmRecord.sanity_damage = 1;
      updatedDmRecord.consumes_time = true;
      updatedDmRecord.consumed_items = [];
      updatedDmRecord.awarded_items = [];
      updatedDmRecord.awarded_warehouse_items = [];
      updatedDmRecord.codex_updates = [];
      updatedDmRecord.relationship_updates = [];
      updatedDmRecord.new_tasks = [];
      updatedDmRecord.task_updates = [];
      updatedDmRecord.npc_location_updates = [];
      updatedDmRecord.main_threat_updates = [];
      updatedDmRecord.weapon_updates = [];

      const fb = buildOutputFallback({
        scene,
        stage,
        decision: evalResult.decision,
        riskLevel: evalResult.riskLevel,
        reasonCode: evalResult.reasonCode,
        isProviderFailureFallback: stage === "public_display" ? true : false,
      });
      updatedDmRecord.narrative = fb.narrative;
      if (fb.options) updatedDmRecord.options = fb.options;
    }
  }

  const latencyMs = Date.now() - startedAt;
  const actorHashes = buildOutputActorHashes({ userId: args.userId, sessionId: args.sessionId, ip: args.ip });
  const contentFingerprint = candidateText ? fingerprintText(candidateText) : "";

  await writeOutputAuditEvent({
    traceId: args.traceId,
    scene,
    stage,
    decision,
    riskLevel,
    reasonCode,
    providerSummary: providerRiskSummary,
    whitelist: evalResult.whitelist,
    fallbackUsed,
    rewriteUsed,
    failMode,
    latencyMs,
    providerErrorType,
    actor: actorHashes,
    contentFingerprint,
    rawTextSnippet: null,
  });

  return {
    updatedDmRecord,
    verdict,
    decision,
    riskLevel,
    fallbackUsed,
    rewriteUsed,
    failMode,
    latencyMs,
    providerErrorType,
    providerRiskSummary,
    reasonCode,
  };
}

