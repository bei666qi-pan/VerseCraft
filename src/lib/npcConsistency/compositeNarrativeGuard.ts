import { applyNarrativeContinuityPostGeneration } from "./narrativeContinuityValidator";
import { applyPovPostGeneration } from "./povValidator";
import { applyGenderPronounPostGeneration } from "./genderPronounValidator";
import {
  enableContinuityGuard,
  enableFirstPersonGuard,
  enableGenderPronounGuard,
  enableNarrativeGuardDebug,
} from "./narrativeGuardFlags";

export type CompositeNarrativeGuardTelemetry = {
  continuityValidatorTriggered: boolean;
  povValidatorTriggered: boolean;
  genderValidatorTriggered: boolean;
  rewriteTriggered: boolean;
  rewriteReason: string | null;
  finalNarrativeSafe: boolean;
  logs: string[];
};

const IDLE: CompositeNarrativeGuardTelemetry = {
  continuityValidatorTriggered: false,
  povValidatorTriggered: false,
  genderValidatorTriggered: false,
  rewriteTriggered: false,
  rewriteReason: null,
  finalNarrativeSafe: true,
  logs: [],
};

export function applyCompositeNarrativeGuard(input: {
  narrative: string;
  latestUserInput: string;
  previousTailSummary?: string | null;
  focusNpcId: string | null;
  presentNpcIds: string[];
}): { narrative: string; telemetry: CompositeNarrativeGuardTelemetry } {
  let narrativeWork = String(input.narrative ?? "");
  const logs: string[] = [];
  let rewriteTriggered = false;
  let rewriteReason: string | null = null;
  let cont = false;
  let pov = false;
  let gender = false;

  if (enableContinuityGuard()) {
    const r = applyNarrativeContinuityPostGeneration({
      narrative: narrativeWork,
      latestUserInput: input.latestUserInput,
      previousTailSummary: input.previousTailSummary ?? null,
    });
    if (r.triggered && r.narrative !== narrativeWork) {
      narrativeWork = r.narrative;
      rewriteTriggered = true;
      cont = true;
      rewriteReason = rewriteReason ?? `continuity:${r.reason ?? r.severity}`;
      logs.push(`continuity:${r.severity}:${r.debug.similarity}`);
    }
  }

  if (enableFirstPersonGuard()) {
    const r = applyPovPostGeneration(narrativeWork);
    if (r.triggered && r.narrative !== narrativeWork) {
      narrativeWork = r.narrative;
      rewriteTriggered = true;
      pov = true;
      rewriteReason = rewriteReason ?? `pov:${r.severity}`;
      logs.push(`pov:${r.severity}:${r.debug.secondPersonHits}`);
    }
  }

  if (enableGenderPronounGuard()) {
    const r = applyGenderPronounPostGeneration({
      narrative: narrativeWork,
      focusNpcId: input.focusNpcId,
      presentNpcIds: input.presentNpcIds,
    });
    if (r.triggered && r.narrative !== narrativeWork) {
      narrativeWork = r.narrative;
      rewriteTriggered = true;
      gender = true;
      rewriteReason = rewriteReason ?? `gender:${r.severity}`;
      logs.push(`gender:${r.severity}:${r.logs.slice(0, 2).join("|")}`);
    }
  }

  const telemetry: CompositeNarrativeGuardTelemetry = {
    ...IDLE,
    continuityValidatorTriggered: cont,
    povValidatorTriggered: pov,
    genderValidatorTriggered: gender,
    rewriteTriggered,
    rewriteReason,
    finalNarrativeSafe: true,
    logs,
  };

  if (enableNarrativeGuardDebug() && (telemetry.rewriteTriggered || telemetry.logs.length > 0)) {
    // debug-only：避免污染线上日志
    console.info("[narrative_guard]", telemetry);
  }

  return { narrative: narrativeWork, telemetry };
}

