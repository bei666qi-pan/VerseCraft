import assert from "node:assert/strict";
import test from "node:test";
import { emptyStateDelta } from "@/lib/turnEngine/computeStateDelta";
import { validateNarrative as validateNarrativeCore } from "@/lib/turnEngine/validateNarrative";
import { checkModelOutput, validateNarrative } from "./checker";
import type { ModelOutputSchema } from "./schema";
import type { DialogueContext } from "./types";

test("narrative checker delegates validateNarrative without changing report shape", () => {
  const args = {
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "A quiet corridor waits.",
      is_death: false,
      options: ["Check the door", "Step back"],
    },
    delta: emptyStateDelta(),
  };

  assert.deepEqual(validateNarrative(args), validateNarrativeCore(args));
});

const context: DialogueContext = {
  requestId: "req_check_1",
  sessionId: "sess_check_1",
  userId: "user_check_1",
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
    forbiddenFactIds: ["fact:secret"],
  },
  npcMemories: [],
  world: {
    worldId: "base_apartment",
    loreFacts: [
      {
        factKey: "world:rule:safe-zone",
        canonicalText: "Safe zones are not exits.",
        layer: "core",
        tags: ["B1_SafeZone"],
      },
    ],
    hardRules: ["Safe zones are not exits."],
    allowedEntityIds: ["B1_SafeZone", "N-010", "I-C03", "task:route", "world:rule:safe-zone"],
    forbiddenFactIds: ["fact:secret"],
    revealTier: 1,
  },
  recentEvents: [
    {
      id: 7,
      turnIndex: 3,
      actorType: "player",
      actorId: "player",
      eventType: "player_action",
      summary: "Player inspected the corridor.",
    },
  ],
  rawCompatibility: {
    playerContext: "",
    clientState: null,
  },
};

function validOutput(overrides: Partial<ModelOutputSchema> = {}): ModelOutputSchema {
  return {
    narrative: "走廊尽头的灯闪了一下，你确认自己仍在 B1_SafeZone。",
    turnMode: "decision_required",
    decisionOptions: ["继续观察", "退回原位"],
    stateChanges: {},
    eventCandidates: [
      {
        type: "player_action",
        actorType: "player",
        actorId: "player",
        summary: "Player observed the corridor near B1_SafeZone.",
        payload: {},
      },
    ],
    revealAttempts: ["fact:known"],
    consistencyNotes: [],
    ...overrides,
  };
}

test("checkModelOutput accepts a schema-valid, context-aligned candidate", () => {
  const result = checkModelOutput({
    output: validOutput(),
    context,
    logFailures: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.parsed?.turnMode, "decision_required");
  assert.equal(result.safeOutput?.narrative.includes("B1_SafeZone"), true);
  assert.deepEqual(result.issues, []);
});

test("checkModelOutput fails empty narrative with a safe fallback", () => {
  const result = checkModelOutput({
    output: validOutput({ narrative: "" }),
    context,
    logFailures: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.parsed, null);
  assert.ok(result.issues.some((issue) => issue.code === "schema_invalid" && issue.path === "narrative"));
  assert.equal(result.safeOutput?.turnMode, "narrative_only");
  assert.doesNotThrow(() => JSON.stringify(result.safeOutput));
});

test("checkModelOutput blocks schema and dangerous snapshot fields", async () => {
  const logged: string[] = [];
  const result = checkModelOutput({
    output: {
      ...validOutput(),
      decisionOptions: ["1", "2", "3", "4", "5"],
      snapshot: { replace: true },
    },
    context,
    logger: ({ result: loggedResult }) => {
      logged.push(loggedResult.degradeReason ?? "none");
    },
  });

  await Promise.resolve();
  assert.equal(result.ok, false);
  assert.equal(result.parsed, null);
  assert.ok(result.issues.some((issue) => issue.code === "dangerous_field_present"));
  assert.ok(result.issues.some((issue) => issue.code === "schema_invalid"));
  assert.equal(result.safeOutput?.turnMode, "narrative_only");
  assert.deepEqual(logged, ["dangerous_field_present"]);
});

test("checkModelOutput blocks forbidden facts and scrubs unsafe narrative", () => {
  const result = checkModelOutput({
    output: validOutput({
      narrative: "你看见了 fact:secret。走廊的风声仍然真实。",
      revealAttempts: ["fact:secret"],
    }),
    context,
    logFailures: false,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "forbidden_fact_leak"));
  assert.ok(result.issues.some((issue) => issue.code === "reveal_attempt_locked_fact"));
  assert.equal(result.safeOutput?.narrative, "走廊的风声仍然真实。");
});

test("checkModelOutput blocks NPC inner monologue without active NPC", () => {
  const result = checkModelOutput({
    output: validOutput({
      narrative: "她心里想，玩家还不知道真正的出口。",
      eventCandidates: [
        {
          type: "npc_reply",
          actorType: "npc",
          actorId: "N-010",
          summary: "Xinlan hides a thought.",
          payload: {},
        },
      ],
    }),
    context: { ...context, activeNpc: null },
    logFailures: false,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "npc_inner_monologue_without_active_npc"));
  assert.ok(result.issues.some((issue) => issue.code === "npc_event_without_active_npc"));
});

test("checkModelOutput blocks unregistered NPC actor ids", () => {
  const result = checkModelOutput({
    output: validOutput({
      narrative: "A stranger marked as N-999 steps into the corridor.",
      eventCandidates: [
        {
          type: "npc_reply",
          actorType: "npc",
          actorId: "N-999",
          summary: "N-999 answers from nowhere.",
          payload: {},
        },
      ],
    }),
    context,
    logFailures: false,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "unauthorized_entity_reference"));
  assert.ok(result.issues.some((issue) => issue.code === "unauthorized_actor_reference"));
});

test("checkModelOutput warns when narrative claims acquisition without a structured record", () => {
  const result = checkModelOutput({
    output: validOutput({
      narrative: "你捡起一枚钥匙，把它收进背包。",
    }),
    context,
    logFailures: false,
  });

  assert.equal(result.ok, true);
  assert.ok(result.issues.some((issue) => issue.code === "narrative_acquisition_without_state_record"));
});

test("checkModelOutput blocks location changes to unknown locations", () => {
  const result = checkModelOutput({
    output: validOutput({
      narrative: "You walk through the hallway and arrive at B9_UnknownZone.",
      stateChanges: { playerLocation: "B9_UnknownZone" },
    }),
    context,
    logFailures: false,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "unknown_location_change"));
});

test("checkModelOutput blocks unknown relationship and task updates", () => {
  const result = checkModelOutput({
    output: validOutput({
      stateChanges: {
        relationshipUpdates: [{ npcId: "N-999", trust: 10 }],
        taskUpdates: [{ taskId: "task:unknown", status: "done" }],
      },
    }),
    context,
    logFailures: false,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "relationship_update_unknown_npc"));
  assert.ok(result.issues.some((issue) => issue.code === "task_update_unknown_task"));
});

test("checkModelOutput fallback path never throws on malformed output", () => {
  assert.doesNotThrow(() => {
    const result = checkModelOutput({
      output: "not a model output",
      context,
      logFailures: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.safeOutput?.turnMode, "narrative_only");
  });
});
