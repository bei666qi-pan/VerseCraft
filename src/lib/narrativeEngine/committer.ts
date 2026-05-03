import {
  commitTurn as commitTurnCore,
  type CommitTurnArgs,
  type CommitTurnResult,
  type TurnCommitFlag,
  type TurnCommitSummary,
} from "@/lib/turnEngine/commitTurn";
import type { ModelOutputSchema } from "./schema";
import type { NarrativeCheckResult } from "./checker";
import type { DialogueContext } from "./types";
import {
  writeNpcMemoryBestEffort,
  type NpcMemoryWriteInput,
  type NpcMemoryWriteResult,
} from "./npcMemoryRepository";
import {
  writeStoryEventBestEffort,
  type StoryEventWriteInput,
  type StoryEventWriteResult,
} from "./storyEventRepository";

export type {
  CommitTurnArgs,
  CommitTurnResult,
  TurnCommitFlag,
  TurnCommitSummary,
};

export function commitTurn(args: CommitTurnArgs): CommitTurnResult {
  return commitTurnCore(args);
}

export const commitNarrativeTurn = commitTurn;

export type NarrativeEventsCommitResult = {
  storyEventIds: Array<number | string>;
  npcMemoryEntryIds: Array<number | string>;
  committed: boolean;
  commitFlags: string[];
};

export type NarrativeEventsCommitterDeps = {
  writeStoryEvent: (input: StoryEventWriteInput) => Promise<StoryEventWriteResult>;
  writeNpcMemory: (input: NpcMemoryWriteInput) => Promise<NpcMemoryWriteResult>;
};

export async function commitNarrativeEvents(args: {
  context: DialogueContext;
  checked: NarrativeCheckResult;
  legacyCommitSummary?: TurnCommitSummary;
  deps?: Partial<NarrativeEventsCommitterDeps>;
}): Promise<NarrativeEventsCommitResult> {
  const deps = {
    writeStoryEvent: writeStoryEventBestEffort,
    writeNpcMemory: writeNpcMemoryBestEffort,
    ...(args.deps ?? {}),
  };
  const commitFlags = new Set<string>(args.legacyCommitSummary?.commitFlags ?? []);
  const output = args.checked.safeOutput ?? args.checked.parsed;

  if (!output) {
    commitFlags.add("model_output_missing");
    commitFlags.add("narrative_events_noop");
    return {
      storyEventIds: [],
      npcMemoryEntryIds: [],
      committed: false,
      commitFlags: [...commitFlags],
    };
  }

  const eventInputs = buildStoryEventInputs({
    context: args.context,
    checked: args.checked,
    output,
    turnIndex: inferTurnIndex(args.context, args.legacyCommitSummary),
  });
  const storyEventIds: Array<number | string> = [];
  const npcMemoryEntryIds: Array<number | string> = [];
  const committedStoryEvents: Array<{ id?: number | string; input: StoryEventWriteInput }> = [];
  let writeFailureCount = 0;

  for (const eventInput of eventInputs) {
    const result = await writeStoryEventSafe(deps.writeStoryEvent, eventInput);
    if (result.ok) {
      if (result.id !== undefined) storyEventIds.push(result.id);
      committedStoryEvents.push({ id: result.id, input: eventInput });
    } else {
      writeFailureCount += 1;
      commitFlags.add("story_event_write_failed");
    }
  }

  const memoryInputs = buildNpcMemoryInputs({
    context: args.context,
    events: committedStoryEvents,
  });
  for (const memoryInput of memoryInputs) {
    const result = await writeNpcMemorySafe(deps.writeNpcMemory, memoryInput);
    if (result.ok) {
      if (result.id !== undefined) npcMemoryEntryIds.push(result.id);
    } else {
      writeFailureCount += 1;
      commitFlags.add("npc_memory_write_failed");
    }
  }

  if (args.checked.degradeReason) commitFlags.add(`checker_degrade:${args.checked.degradeReason}`);
  if (args.checked.issues.length > 0) commitFlags.add("checker_issues_recorded");
  if (memoryInputs.length > 0) commitFlags.add("npc_memory_entries_written");
  if (eventInputs.length > 0) commitFlags.add("story_events_written");
  if (writeFailureCount > 0) commitFlags.add("best_effort_partial_failure");

  return {
    storyEventIds,
    npcMemoryEntryIds,
    committed: committedStoryEvents.length > 0,
    commitFlags: [...commitFlags],
  };
}

async function writeStoryEventSafe(
  writer: NarrativeEventsCommitterDeps["writeStoryEvent"],
  input: StoryEventWriteInput
): Promise<StoryEventWriteResult> {
  try {
    return await writer(input);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown" };
  }
}

async function writeNpcMemorySafe(
  writer: NarrativeEventsCommitterDeps["writeNpcMemory"],
  input: NpcMemoryWriteInput
): Promise<NpcMemoryWriteResult> {
  try {
    return await writer(input);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown" };
  }
}

function buildStoryEventInputs(args: {
  context: DialogueContext;
  checked: NarrativeCheckResult;
  output: ModelOutputSchema;
  turnIndex: number;
}): StoryEventWriteInput[] {
  const base = storyEventBase(args.context, args.turnIndex);
  const events: StoryEventWriteInput[] = [];
  const push = (event: Omit<StoryEventWriteInput, "requestId">) => {
    events.push({ ...base, ...event, requestId: args.context.requestId });
  };

  const candidatePlayerAction = args.output.eventCandidates.find(
    (event) => event.type === "player_action" && event.actorType === "player"
  );
  push({
    actorType: "player",
    actorId: "player",
    eventType: "player_action",
    summary: clip(candidatePlayerAction?.summary ?? "玩家提交了本回合行动。", 180),
    payload: {
      ...(candidatePlayerAction?.payload ?? {}),
      source: candidatePlayerAction ? "model_candidate" : "narrative_engine_synthesized",
    },
    committed: args.checked.ok,
  });

  for (const candidate of args.output.eventCandidates) {
    if (candidate.type === "player_action") continue;
    push({
      actorType: candidate.actorType,
      actorId: candidate.actorId ?? null,
      eventType: candidate.type,
      summary: clip(candidate.summary, 180),
      payload: {
        ...candidate.payload,
        source: "model_candidate",
      },
      committed: args.checked.ok,
    });
  }

  const stateChanges = args.output.stateChanges;
  if (hasStateChange(stateChanges)) {
    push({
      actorType: "system",
      actorId: null,
      eventType: "state_change",
      summary: buildStateChangeSummary(stateChanges),
      payload: {
        stateChanges: compactRecord({
          playerLocation: stateChanges.playerLocation,
          sanityDelta: stateChanges.sanityDelta,
          hpDelta: stateChanges.hpDelta,
          originiumDelta: stateChanges.originiumDelta,
          timeCost: stateChanges.timeCost,
        }),
      },
      committed: args.checked.ok,
    });
  }

  for (const [index, update] of (stateChanges.relationshipUpdates ?? []).entries()) {
    push({
      actorType: "system",
      actorId: stringProp(update, "npcId") ?? stringProp(update, "actorId"),
      eventType: "relationship_changed",
      summary: clip(
        stringProp(update, "summary") ??
          `NPC relationship changed${stringProp(update, "npcId") ? `: ${stringProp(update, "npcId")}` : ""}.`,
        180
      ),
      payload: { update, index, source: "stateChanges.relationshipUpdates" },
      committed: args.checked.ok,
    });
  }

  for (const [index, update] of (stateChanges.clueUpdates ?? []).entries()) {
    push({
      actorType: "system",
      actorId: null,
      eventType: "clue_found",
      summary: clip(stringProp(update, "summary") ?? `Clue update recorded: ${stringProp(update, "clueId") ?? index}.`, 180),
      payload: { update, index, source: "stateChanges.clueUpdates" },
      committed: args.checked.ok,
    });
  }

  for (const [index, update] of (stateChanges.taskUpdates ?? []).entries()) {
    const eventType = isStartedTaskUpdate(update) ? "task_started" : "task_updated";
    push({
      actorType: "system",
      actorId: stringProp(update, "npcId") ?? stringProp(update, "issuerId"),
      eventType,
      summary: clip(stringProp(update, "summary") ?? `Task update recorded: ${stringProp(update, "taskId") ?? index}.`, 180),
      payload: { update, index, source: "stateChanges.taskUpdates" },
      committed: args.checked.ok,
    });
  }

  if (!args.checked.ok || args.checked.degradeReason || args.checked.issues.some((issue) => issue.severity === "block")) {
    push({
      actorType: "system",
      actorId: null,
      eventType: "consistency_degrade",
      summary: clip(`模型候选输出未通过叙事校验：${args.checked.degradeReason ?? "checker_issues"}`, 180),
      payload: {
        ok: args.checked.ok,
        degradeReason: args.checked.degradeReason ?? null,
        issues: args.checked.issues,
      },
      committed: false,
    });
  }

  return events;
}

function buildNpcMemoryInputs(args: {
  context: DialogueContext;
  events: Array<{ id?: number | string; input: StoryEventWriteInput }>;
}): NpcMemoryWriteInput[] {
  const out: NpcMemoryWriteInput[] = [];
  for (const event of args.events) {
    const npcId = resolveNpcIdForMemory(event.input, args.context);
    if (!npcId) continue;
    const memory = classifyNpcMemory(event.input);
    if (!memory) continue;
    out.push({
      npcId,
      sessionId: args.context.sessionId,
      userId: args.context.userId,
      scope: memory.scope,
      kind: memory.kind,
      summary: clip(event.input.summary, 120),
      factIds: collectFactIds(event.input.payload),
      relatedEventIds: event.id !== undefined ? [event.id] : [],
      salience: memory.salience,
      confidence: memory.confidence,
      emotion: memory.emotion,
    });
  }
  return out.slice(0, 6);
}

function storyEventBase(context: DialogueContext, turnIndex: number): Omit<StoryEventWriteInput, "requestId" | "actorType" | "eventType" | "summary"> {
  return {
    sessionId: context.sessionId,
    userId: context.userId,
    turnIndex,
    worldId: context.world.worldId,
    chapterId: context.chapter.chapterId,
    sceneId: context.chapter.sceneId ?? context.player.locationId,
  };
}

function inferTurnIndex(context: DialogueContext, summary?: TurnCommitSummary): number {
  if (summary) return summary.turnIndex;
  return context.recentEvents.reduce((max, event) => Math.max(max, event.turnIndex), 0) + 1;
}

function hasStateChange(stateChanges: ModelOutputSchema["stateChanges"]): boolean {
  return Boolean(
    stateChanges.playerLocation ||
      typeof stateChanges.sanityDelta === "number" ||
      typeof stateChanges.hpDelta === "number" ||
      typeof stateChanges.originiumDelta === "number" ||
      stateChanges.timeCost
  );
}

function buildStateChangeSummary(stateChanges: ModelOutputSchema["stateChanges"]): string {
  const parts: string[] = [];
  if (stateChanges.playerLocation) parts.push(`location=${stateChanges.playerLocation}`);
  if (typeof stateChanges.sanityDelta === "number") parts.push(`sanityDelta=${stateChanges.sanityDelta}`);
  if (typeof stateChanges.hpDelta === "number") parts.push(`hpDelta=${stateChanges.hpDelta}`);
  if (typeof stateChanges.originiumDelta === "number") parts.push(`originiumDelta=${stateChanges.originiumDelta}`);
  if (stateChanges.timeCost) parts.push(`timeCost=${stateChanges.timeCost}`);
  return parts.length > 0 ? `State changed: ${parts.join(", ")}.` : "State changed.";
}

function resolveNpcIdForMemory(input: StoryEventWriteInput, context: DialogueContext): string | null {
  if (input.actorType === "npc" && input.actorId) return input.actorId;
  const payloadNpcId =
    stringProp(input.payload ?? {}, "npcId") ??
    stringProp(input.payload ?? {}, "actorId") ??
    stringProp(input.payload ?? {}, "targetNpcId");
  if (payloadNpcId) return payloadNpcId;
  if (
    context.activeNpc &&
    ["npc_reply", "relationship_changed", "task_started", "task_updated"].includes(input.eventType)
  ) {
    return context.activeNpc.npcId;
  }
  return null;
}

function classifyNpcMemory(input: StoryEventWriteInput): {
  scope: "short_term" | "long_term" | "private";
  kind: string;
  salience: number;
  confidence: number;
  emotion: Record<string, unknown>;
} | null {
  if (input.eventType === "state_change" || input.eventType === "consistency_degrade") return null;
  const text = `${input.eventType} ${input.summary} ${JSON.stringify(input.payload ?? {})}`;
  if (/(承诺|promise|背叛|betray|交付|递给|key item|关键物品|透露秘密|秘密|secret)/i.test(text)) {
    return {
      scope: /(秘密|secret|误解|misunderstanding)/i.test(text) ? "private" : "long_term",
      kind: "relationship_signal",
      salience: 90,
      confidence: /(谣言|推测|rumor|guess|maybe)/i.test(text) ? 55 : 90,
      emotion: {},
    };
  }
  if (input.eventType === "relationship_changed") {
    return { scope: "long_term", kind: "relationship", salience: 75, confidence: 90, emotion: {} };
  }
  if (input.eventType === "task_started" || input.eventType === "task_updated") {
    return { scope: "short_term", kind: "task", salience: 65, confidence: 90, emotion: {} };
  }
  if (input.eventType === "npc_reply") {
    return { scope: "short_term", kind: "dialogue", salience: 45, confidence: 70, emotion: { subjective: true } };
  }
  if (input.eventType === "fact_unlock" || input.eventType === "clue_found") {
    return { scope: "short_term", kind: "observation", salience: 60, confidence: 90, emotion: {} };
  }
  return null;
}

function isStartedTaskUpdate(update: Record<string, unknown>): boolean {
  const status = stringProp(update, "status") ?? stringProp(update, "kind") ?? stringProp(update, "type");
  return /^(new|active|started|task_started)$/i.test(status ?? "");
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}

function collectFactIds(payload: Record<string, unknown> | undefined): string[] {
  if (!payload) return [];
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string" && /^(fact:|clue:|world:)/.test(value)) ids.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(payload);
  return [...ids].slice(0, 12);
}

function stringProp(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clip(value: string, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
