import { classifyMechanicsIntentForWorld } from "./mechanicsIntentRouter";
import type { MechanicsIntentClassification } from "./mechanicsIntentRouter";
import type { TurnLane } from "./contracts";

export type TurnLaneRoute = {
  lane: TurnLane;
  source: "deterministic" | "embedding" | "deadline_fallback" | "classifier_fallback";
  classification: MechanicsIntentClassification;
  latencyMs: number;
};

type AmbiguousClassifier = (
  input: string,
  worldId: string,
) => Promise<{ classification: MechanicsIntentClassification }>;

const DEFAULT_DEADLINE_MS = 300;

async function defaultAmbiguousClassifier(input: string, worldId: string) {
  const { classifyIntent } = await import("./mechanicsIntentClassifier");
  return classifyIntent(input, worldId);
}

/** Deterministic first; only genuinely ambiguous input crosses the embedding Seam. */
export async function routeGenerationLane(input: {
  userInput: string;
  worldId?: string | null;
  deadlineMs?: number;
  classifyAmbiguous?: AmbiguousClassifier;
}): Promise<TurnLaneRoute> {
  const startedAt = Date.now();
  const deterministic = classifyMechanicsIntentForWorld(input.userInput, input.worldId);
  if (deterministic.classification !== "ambiguous") {
    return {
      lane: deterministic.classification === "mechanics" ? "mechanics" : "narrative",
      source: "deterministic",
      classification: deterministic.classification,
      latencyMs: Date.now() - startedAt,
    };
  }

  const worldId = input.worldId ?? "unknown";
  const deadlineMs = Math.min(
    DEFAULT_DEADLINE_MS,
    Math.max(1, Math.trunc(input.deadlineMs ?? DEFAULT_DEADLINE_MS)),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), deadlineMs);
  });

  try {
    const classified = await Promise.race([
      (input.classifyAmbiguous ?? defaultAmbiguousClassifier)(input.userInput, worldId),
      deadline,
    ]);
    if (classified === "deadline") {
      return {
        lane: "narrative",
        source: "deadline_fallback",
        classification: "ambiguous",
        latencyMs: Date.now() - startedAt,
      };
    }
    return {
      lane: classified.classification === "mechanics" ? "mechanics" : "narrative",
      source: "embedding",
      classification: classified.classification,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      lane: "narrative",
      source: "classifier_fallback",
      classification: "ambiguous",
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
