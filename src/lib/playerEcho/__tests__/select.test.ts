import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { selectPlayerEchoFragments } from "@/lib/playerEcho/select";
import type { EchoFragment, PlayerEchoCanon } from "@/lib/playerEcho/types";

function fragment(overrides: Partial<EchoFragment>): EchoFragment {
  return {
    id: "f",
    type: "relationship_shift",
    targetType: "npc",
    targetId: "N-010",
    summary: "她曾在名单前短暂停顿",
    safetyLevel: 2,
    emotionalWeight: 0.7,
    salience: 0.8,
    confidence: 0.85,
    status: "active",
    anchors: { npcIds: ["N-010"] },
    ...overrides,
  };
}

function canon(fragments: EchoFragment[]): PlayerEchoCanon {
  return {
    schema: "player_echo_canon_v1",
    version: 1,
    playerKey: null,
    worldId: "dark_moon_prologue",
    loopCount: 2,
    fragments,
    npcBonds: [],
    strongestChoices: [],
    unresolvedRegrets: [],
    repeatedDeathCauses: [],
    stableEchoSummary: null,
    lastRunSummary: null,
    updatedAt: null,
  };
}

test("playerEcho select does not return unrelated NPC echoes when focus is explicit", () => {
  const selected = selectPlayerEchoFragments(
    canon([
      fragment({ id: "xinlan", targetId: "N-010", anchors: { npcIds: ["N-010"] } }),
      fragment({ id: "linze", targetId: "N-015", anchors: { npcIds: ["N-015"] }, summary: "麟泽残响不应进入" }),
    ]),
    {
      activeNpcId: "N-010",
      presentNpcIds: ["N-010", "N-015"],
      locationId: "B1_SafeZone",
      revealTier: REVEAL_TIER_RANK.deep,
    }
  );

  assert.deepEqual(selected.map((item) => item.id), ["xinlan"]);
});

test("playerEcho select hides safety level 4 below reveal gate", () => {
  const low = selectPlayerEchoFragments(
    canon([
      fragment({
        id: "secret",
        safetyLevel: 4,
        revealTierMin: REVEAL_TIER_RANK.deep,
        summary: "深层残响不得在低揭示层出现",
      }),
    ]),
    { activeNpcId: "N-010", revealTier: REVEAL_TIER_RANK.deep }
  );
  const high = selectPlayerEchoFragments(
    canon([
      fragment({
        id: "secret",
        safetyLevel: 4,
        revealTierMin: REVEAL_TIER_RANK.deep,
        summary: "深层残响可在足够揭示层出现",
      }),
    ]),
    { activeNpcId: "N-010", revealTier: REVEAL_TIER_RANK.abyss }
  );

  assert.equal(low.length, 0);
  assert.equal(high.length, 1);
});
