import { summarizeNarrativeTurnContext } from "./contextBuilder";
import type { NarrativeTurnInput, NarrativeTurnResult } from "./types";

export {
  buildFallbackModelOutput,
  MODEL_OUTPUT_FALLBACK_NARRATIVE,
  ModelActorTypeSchema,
  ModelEventCandidateSchema,
  ModelEventCandidateTypeSchema,
  ModelOutputZodSchema,
  ModelStateChangesSchema,
  ModelTurnModeSchema,
  type ModelOutputSchema,
} from "./schema";
export {
  applyNpcConsistencyPostGeneration,
  checkModelOutput,
  validateNarrative,
  type ApplyNpcConsistencyPostGenerationInput,
  type ApplyNpcConsistencyPostGenerationResult,
  type NarrativeCheckIssue,
  type NarrativeCheckLogger,
  type NarrativeCheckResult,
} from "./checker";

export type {
  NarrativeRunSummary,
  NarrativeTurnContext,
  NarrativeTurnInput,
  NarrativeTurnMessage,
  NarrativeTurnResult,
  DialogueContext,
} from "./types";

export {
  buildDialogueContext,
  buildNarrativeTurnContext,
  summarizeNarrativeTurnContext,
  type BuildDialogueContextInput,
  type DialogueContextBuilderDeps,
} from "./contextBuilder";
export {
  assemblePlayerChatPrompt,
  buildNarrativePrompt,
  buildNarrativePromptPacket,
  type AssembleNarrativePromptArgs,
  type AssembleNarrativePromptResult,
  type NarrativePromptPacket,
} from "./promptBuilder";
export {
  commitNarrativeEvents,
  commitNarrativeTurn,
  commitTurn,
  type CommitTurnArgs,
  type CommitTurnResult,
  type NarrativeEventsCommitResult,
  type NarrativeEventsCommitterDeps,
  type TurnCommitFlag,
  type TurnCommitSummary,
} from "./committer";
export {
  buildNarrativeRunMeta,
  buildNarrativeRunSummaryPayload,
  logNarrativeRun,
  type NarrativeRunLogArgs,
} from "./runLogger";
export {
  buildRouteModelOutputFromResolvedTurn,
  buildRouteNarrativeCheckResult,
} from "./routeAdapter";
export {
  buildNarrativeRunInsertRow,
  writeNarrativeRunBestEffort,
  type NarrativeRunInsertRow,
  type NarrativeRunRepositoryDeps,
  type NarrativeRunWriteInput,
  type NarrativeRunWriteResult,
} from "./narrativeRunRepository";
export {
  buildNpcMemoryInsertRow,
  readRecentNpcMemoriesBestEffort,
  writeNpcMemoryBestEffort,
  type NpcMemoryInsertRow,
  type NpcMemoryContextRecord,
  type NpcMemoryReadInput,
  type NpcMemoryReadResult,
  type NpcMemoryRepositoryDeps,
  type NpcMemoryWriteInput,
  type NpcMemoryWriteResult,
} from "./npcMemoryRepository";
export {
  buildStoryEventInsertRow,
  readRecentStoryEventsBestEffort,
  writeStoryEventBestEffort,
  type RecentStoryEventRecord,
  type StoryEventInsertRow,
  type StoryEventReadInput,
  type StoryEventReadResult,
  type StoryEventRepositoryDeps,
  type StoryEventWriteInput,
  type StoryEventWriteResult,
} from "./storyEventRepository";

export async function runNarrativeTurn(
  input: NarrativeTurnInput
): Promise<NarrativeTurnResult> {
  const narrativeRunSummary = summarizeNarrativeTurnContext(input);

  return {
    status: 501,
    narrativeRunSummary,
  };
}
