import assert from "node:assert/strict";
import test from "node:test";
import { emptyStateDelta } from "@/lib/turnEngine/computeStateDelta";
import { commitTurn as commitTurnCore } from "@/lib/turnEngine/commitTurn";
import { commitNarrativeEvents, commitTurn } from "./committer";
import type { NarrativeCheckResult } from "./checker";
import type { ModelOutputSchema } from "./schema";
import type { DialogueContext } from "./types";
import type { NpcMemoryWriteInput } from "./npcMemoryRepository";
import type { StoryEventWriteInput } from "./storyEventRepository";

test("narrative committer delegates commitTurn without changing summary", () => {
  const args = {
    requestId: "req_commit_1",
    sessionId: "session_1",
    turnIndex: 2,
    candidateDmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "The room remains still.",
      is_death: false,
      options: ["Listen", "Move"],
    },
    delta: emptyStateDelta(),
    validatorReport: {
      ok: true,
      issues: [],
      optionsOverride: null,
      narrativeOverride: null,
      telemetry: {
        totalIssues: 0,
        byCode: {},
        optionsOverrideApplied: false,
        safeNarrativeFallbackApplied: false,
      },
    },
  };

  assert.deepEqual(commitTurn(args), commitTurnCore(args));
});

const context: DialogueContext = {
  requestId: "req_events_1",
  sessionId: "sess_events_1",
  userId: "user_events_1",
  player: {
    locationId: "B1_SafeZone",
    time: { day: 1, hour: 8 },
    stats: { sanity: 80 },
    inventoryIds: ["I-C03"],
    currentProfession: null,
    knownFactIds: ["fact:known"],
    discoveredClueIds: ["clue:first"],
  },
  chapter: {
    chapterId: "chapter-1",
    status: "active",
    sceneId: "B1_SafeZone",
    objective: "Check the corridor.",
    completedBeatIds: ["wake"],
    allowedEventIds: ["observe"],
    blockedEventIds: [],
  },
  activeNpc: {
    npcId: "N-010",
    displayName: "Xinlan",
    coreDrive: "Keep the player away from false exits.",
    forbiddenFactIds: ["fact:secret"],
  },
  npcMemories: [],
  world: {
    worldId: "base_apartment",
    loreFacts: [],
    hardRules: [],
    allowedEntityIds: ["B1_SafeZone", "N-010", "I-C03", "task:route"],
    forbiddenFactIds: ["fact:secret"],
    revealTier: 1,
  },
  recentEvents: [{ id: 8, turnIndex: 4, actorType: "player", eventType: "player_action", summary: "Player waited." }],
  rawCompatibility: { playerContext: "", clientState: null },
};

function checked(output: ModelOutputSchema, overrides: Partial<NarrativeCheckResult> = {}): NarrativeCheckResult {
  return {
    ok: true,
    parsed: output,
    issues: [],
    safeOutput: output,
    ...overrides,
  };
}

test("commitNarrativeEvents writes minimum story events and scoped NPC memories", async () => {
  const storyEvents: StoryEventWriteInput[] = [];
  const memories: NpcMemoryWriteInput[] = [];
  let nextStoryId = 100;
  let nextMemoryId = 200;
  const output: ModelOutputSchema = {
    narrative: "Xinlan answers quietly while the corridor light flickers.",
    turnMode: "decision_required",
    decisionOptions: ["Ask Xinlan", "Step back"],
    stateChanges: {
      sanityDelta: -1,
      relationshipUpdates: [{ npcId: "N-010", trust: 3, summary: "Xinlan trusts the player more." }],
      clueUpdates: [{ clueId: "clue:first", summary: "A clue was confirmed." }],
      taskUpdates: [{ taskId: "task:route", status: "started", summary: "Route task started.", npcId: "N-010" }],
    },
    eventCandidates: [
      {
        type: "player_action",
        actorType: "player",
        actorId: "player",
        summary: "Player asks Xinlan about the corridor.",
        payload: {},
      },
      {
        type: "npc_reply",
        actorType: "npc",
        actorId: "N-010",
        summary: "Xinlan replies cautiously.",
        payload: { npcId: "N-010" },
      },
    ],
    revealAttempts: [],
    consistencyNotes: [],
  };

  const result = await commitNarrativeEvents({
    context,
    checked: checked(output),
    legacyCommitSummary: {
      requestId: context.requestId,
      sessionId: context.sessionId,
      turnIndex: 5,
      isActionLegal: true,
      degraded: false,
      optionsRewriteApplied: false,
      safeNarrativeFallbackApplied: false,
      playerLocation: "B1_SafeZone",
      deltaSummary: {
        consumesTime: true,
        timeCost: "standard",
        sanityDamage: 1,
        hpDelta: null,
        originiumDelta: null,
        isDeath: false,
        npcLocationUpdates: 0,
        npcAttitudeUpdates: 0,
        taskUpdates: 1,
        newTasks: 0,
      },
      validatorIssueCounts: {},
      commitFlags: ["post_validator_ok"],
    },
    deps: {
      writeStoryEvent: async (input) => {
        storyEvents.push(input);
        return { ok: true, id: nextStoryId++ };
      },
      writeNpcMemory: async (input) => {
        memories.push(input);
        return { ok: true, id: nextMemoryId++ };
      },
    },
  });

  assert.equal(result.committed, true);
  assert.ok(result.storyEventIds.length >= 6);
  assert.ok(result.npcMemoryEntryIds.length >= 2);
  assert.ok(result.commitFlags.includes("story_events_written"));
  assert.ok(result.commitFlags.includes("npc_memory_entries_written"));
  assert.deepEqual(storyEvents.map((event) => event.eventType), [
    "player_action",
    "npc_reply",
    "state_change",
    "relationship_changed",
    "clue_found",
    "task_started",
  ]);
  assert.equal(storyEvents[0]?.turnIndex, 5);
  assert.equal(memories.every((memory) => memory.npcId === "N-010"), true);
  assert.ok(memories.every((memory) => memory.summary.length <= 120));
  assert.ok(memories.some((memory) => memory.scope === "long_term" && (memory.salience ?? 0) >= 70));
});

test("commitNarrativeEvents turns high-salience NPC events into long-term memory", async () => {
  const memories: NpcMemoryWriteInput[] = [];
  const output: ModelOutputSchema = {
    narrative: "Xinlan hears the player make a promise to return with the key item.",
    turnMode: "decision_required",
    decisionOptions: ["Keep the promise"],
    stateChanges: {},
    eventCandidates: [
      {
        type: "npc_reply",
        actorType: "npc",
        actorId: "N-010",
        summary: "Xinlan records the player's promise about a key item.",
        payload: { npcId: "N-010" },
      },
    ],
    revealAttempts: [],
    consistencyNotes: [],
  };

  const result = await commitNarrativeEvents({
    context,
    checked: checked(output),
    deps: {
      writeStoryEvent: async (input) => ({ ok: true, id: `${input.eventType}_1` }),
      writeNpcMemory: async (input) => {
        memories.push(input);
        return { ok: true, id: `mem_${memories.length}` };
      },
    },
  });

  assert.equal(result.committed, true);
  assert.equal(result.npcMemoryEntryIds.length, 1);
  assert.equal(memories[0]?.npcId, "N-010");
  assert.equal(memories[0]?.scope, "long_term");
  assert.ok((memories[0]?.salience ?? 0) >= 80);
  assert.equal(memories[0]?.confidence, 90);
});

test("commitNarrativeEvents records checker degrade without throwing on write failure", async () => {
  const storyEvents: StoryEventWriteInput[] = [];
  const output: ModelOutputSchema = {
    narrative: "Fallback.",
    turnMode: "narrative_only",
    decisionOptions: [],
    stateChanges: {},
    eventCandidates: [],
    revealAttempts: [],
    consistencyNotes: [],
  };

  const result = await commitNarrativeEvents({
    context,
    checked: checked(output, {
      ok: false,
      issues: [{ code: "forbidden_fact_leak", severity: "block", message: "blocked" }],
      degradeReason: "forbidden_fact_leak",
    }),
    deps: {
      writeStoryEvent: async (input) => {
        storyEvents.push(input);
        if (input.eventType === "consistency_degrade") throw new Error("db down");
        return { ok: true, id: `evt_${storyEvents.length}` };
      },
      writeNpcMemory: async () => ({ ok: true, id: "mem_1" }),
    },
  });

  assert.equal(result.committed, true);
  assert.ok(storyEvents.some((event) => event.eventType === "consistency_degrade"));
  assert.ok(result.commitFlags.includes("story_event_write_failed"));
  assert.ok(result.commitFlags.includes("best_effort_partial_failure"));
  assert.ok(result.commitFlags.includes("checker_degrade:forbidden_fact_leak"));
});
