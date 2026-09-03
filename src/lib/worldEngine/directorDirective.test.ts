import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDirectorDirectiveReceipt,
  projectDirectorDirective,
  stripDirectorDirectiveReceipt,
} from "./directorDirective";

const scope = {
  worldId: "dark_moon_prologue" as const,
  mapId: "dark_moon_apartment" as const,
  sessionId: "session-1",
};

const agenda = {
  items: [
    {
      id: 17,
      sessionId: scope.sessionId,
      userId: "user-1",
      eventCode: "doorbell_once",
      title: "门铃短响",
      status: "due" as const,
      dueTurnIndex: 5,
      expiresTurnIndex: 8,
      salience: 0.8,
      priority: "medium" as const,
      revealPolicy: "hint_only" as const,
      injectionHint: "门铃只响一次，玩家可以忽略。",
      agencyConstraints: ["player_can_ignore"],
      forbiddenOutcomes: ["不得替玩家开门"],
      payload: { npc_action_ids: ["npc:neighbor:wait"] },
    },
  ],
  directorIntent: "用可观察异响推动调查，不替玩家选择。",
  currentPhase: "build_up",
  pacingSummary: { tension: 0.4, mystery: 0.6, fatigue: 0.1 },
  enforcerRejectedCount: 0,
  enforcerRejectionReasons: [],
};

test("projects one bounded directive from current state and due agenda", () => {
  const projected = projectDirectorDirective({ scope, turnIndex: 5, agenda });
  assert.ok(projected);
  assert.deepEqual(projected.directive.dueEventIds, ["doorbell_once"]);
  assert.deepEqual(projected.directive.npcActionIds, ["npc:neighbor:wait"]);
  assert.equal(projected.directive.chapterPhase, "rising");
  assert.match(projected.block, /门铃只响一次/);
  assert.match(projected.block, /不得替玩家开门/);
  assert.ok(projected.block.length <= 4_000);
});

test("projection is deterministic and scope-separated", () => {
  const first = projectDirectorDirective({ scope, turnIndex: 5, agenda });
  const again = projectDirectorDirective({ scope, turnIndex: 5, agenda });
  const otherWorld = projectDirectorDirective({
    scope: {
      worldId: "xingni_taichu",
      mapId: "xingni_qingshi_county",
      sessionId: scope.sessionId,
    },
    turnIndex: 5,
    agenda,
  });
  assert.equal(first?.directive.directiveId, again?.directive.directiveId);
  assert.notEqual(first?.directive.directiveId, otherWorld?.directive.directiveId);
});

test("does not invent a directive when neither state nor agenda exists", () => {
  assert.equal(projectDirectorDirective({
    scope,
    turnIndex: 5,
    agenda: {
      items: [],
      enforcerRejectedCount: 0,
      enforcerRejectionReasons: [],
    },
  }), null);
});

test("accepts only known directive receipts and strips internal receipt fields", () => {
  const known = new Set(["directive_ok"]);
  assert.deepEqual(
    normalizeDirectorDirectiveReceipt({ directiveId: "directive_ok", status: "applied" }, known),
    { directiveId: "directive_ok", status: "applied" },
  );
  assert.equal(normalizeDirectorDirectiveReceipt({ directiveId: "directive_fake", status: "applied" }, known), null);
  assert.deepEqual(
    stripDirectorDirectiveReceipt({ narrative: "x", director_directive_receipt: { directiveId: "directive_ok" } }),
    { narrative: "x" },
  );
});
