import test from "node:test";
import assert from "node:assert/strict";

import { extractPlayerEchoCandidatesFromTurn } from "@/lib/playerEcho/extract";

test("playerEcho extract: death turn extracts one death fragment", () => {
  const fragments = extractPlayerEchoCandidatesFromTurn({
    userId: "u1",
    runId: "run-1",
    dmRecord: {
      is_death: true,
      player_location: "B1_SafeZone",
      narrative: "this full narrative must not be copied",
      options: ["do not copy"],
    },
    nowIso: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(fragments.length, 1);
  assert.equal(fragments[0]?.type, "death");
  assert.equal(fragments[0]?.targetType, "location");
  assert.equal(fragments[0]?.targetId, "B1_SafeZone");
  assert.equal(fragments[0]!.summary.length <= 56, true);
  assert.equal(fragments[0]!.summary.includes("full narrative"), false);
  assert.equal(fragments[0]!.summary.includes("do not copy"), false);
});

test("playerEcho extract: relationship update extracts npc_bond", () => {
  const fragments = extractPlayerEchoCandidatesFromTurn({
    userId: "u1",
    dmRecord: {
      is_death: false,
      relationship_updates: [{ npcId: "N-010", trust: 6 }],
    },
  });

  assert.equal(fragments.length, 1);
  assert.equal(fragments[0]?.type, "npc_bond");
  assert.equal(fragments[0]?.targetType, "npc");
  assert.equal(fragments[0]?.targetId, "N-010");
  assert.equal(fragments[0]?.summary.includes("N-010"), false);
});

test("playerEcho extract: candidate cap is at most 8", () => {
  const fragments = extractPlayerEchoCandidatesFromTurn({
    userId: "u1",
    dmRecord: {
      relationship_updates: Array.from({ length: 12 }, (_, i) => ({
        npcId: `N-${String(i).padStart(3, "0")}`,
        trust: i + 1,
      })),
    },
  });

  assert.equal(fragments.length, 8);
  assert.equal(fragments.every((fragment) => fragment.summary.length <= 56), true);
});

test("playerEcho extract: clue updates become truth_glimpse only for truth-like signals", () => {
  const fragments = extractPlayerEchoCandidatesFromTurn({
    userId: "u1",
    dmRecord: {
      clue_updates: [
        { id: "clue-normal", title: "wet footprint", kind: "trace" },
        { id: "truth:root-edge", title: "root edge", kind: "secret" },
      ],
    },
  });

  assert.equal(fragments.length, 1);
  assert.equal(fragments[0]?.type, "truth_glimpse");
  assert.equal(fragments[0]?.safetyLevel, 4);
  assert.equal(fragments[0]?.summary.includes("truth:root-edge"), false);
});
