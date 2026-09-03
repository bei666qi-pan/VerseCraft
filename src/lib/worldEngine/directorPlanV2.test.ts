import assert from "node:assert/strict";
import test from "node:test";
import type { WorldEngineStructuredDelta } from "./contracts";
import { projectDirectorPlanV2 } from "./directorPlanV2";

test("DirectorPlanV2 projects only bounded IDs, counts and enum chapter direction", () => {
  const legacy = {
    target_phase: "pressure",
    npc_next_actions: [{ npc_code: "N-001", action: "守住门口" }],
    world_events_to_schedule: [{ event_code: "door-knock", due_in_turns: 2 }],
    consistency_warnings: [{ code: "private_fact", message: "不要泄露秘密" }],
  } as WorldEngineStructuredDelta;

  const plan = projectDirectorPlanV2({
    plan: legacy,
    turnIndex: 10,
    chapterId: "chapter-2",
  });

  assert.deepEqual(plan, {
    schemaVersion: "director_plan_v2",
    npcActions: [{ npcId: "N-001", action: "守住门口", sourceIds: ["npc:N-001"] }],
    agenda: [{ eventId: "door-knock", dueTurn: 12, sourceIds: ["event:door-knock"] }],
    chapterDirection: {
      phase: "turning",
      sourceIds: ["chapter:chapter-2", "turn:10"],
    },
    constraints: ["warning:private_fact"],
  });
});
