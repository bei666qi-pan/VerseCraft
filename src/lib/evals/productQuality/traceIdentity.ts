import { createHash } from "node:crypto";

type TraceLike = {
  scenarioId?: unknown;
  persona?: unknown;
  initialState?: unknown;
  steps?: unknown;
};

/** Content identity excludes judge/report metadata so a rejudge copy is not a new play sample. */
export function traceContentFingerprint(trace: TraceLike): string {
  return createHash("sha256").update(JSON.stringify({
    scenarioId: trace.scenarioId ?? null,
    persona: trace.persona ?? null,
    initialState: trace.initialState ?? null,
    steps: trace.steps ?? null,
  })).digest("hex");
}
