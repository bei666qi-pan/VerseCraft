// src/lib/turnEngine/epistemic/index.ts
/**
 * Phase-3: public barrel for the turn engine's epistemic filter layer.
 *
 * Re-exports deliberately kept narrow — consumers should pull the filter
 * orchestrator (`buildEpistemicInput`) + result types. Low-level pure
 * helpers (`filterEpistemicFacts`) are exported for unit testing.
 */
export type {
  WorldTruthFact,
  ScenePublicFact,
  PlayerKnownFact,
  ActorScopedFact,
  EmotionalResidueFact,
  EpistemicFilterResult,
  EpistemicFilterTelemetry,
  EpistemicFilterReason,
} from "./types";

export {
  filterEpistemicFacts,
  filterEpistemicFactsForPlayer,
} from "./filterFacts";

export {
  buildEpistemicInput,
  buildDmOnlyEpistemicInput,
  buildPlayerEpistemicInput,
} from "./buildEpistemicInput";

export type {
  BuildEpistemicInputArgs,
  LorePacketInput,
} from "./buildEpistemicInput";
