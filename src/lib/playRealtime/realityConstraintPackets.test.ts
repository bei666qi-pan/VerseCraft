import assert from "node:assert/strict";
import test from "node:test";
import { buildRealityConstraintPacketBlock } from "./realityConstraintPackets";

const args = {
  playerContext: "游戏时间[第1日 9时]。当前位置：1F_Lobby。",
  latestUserInput: "观察欣蓝",
  playerLocationFallback: "1F_Lobby",
  clientState: {
    presentNpcIds: ["N-010"],
    deadNpcIds: [],
    activeThreatIds: [],
    currentProfession: null,
    weaponBag: [],
    journalClueIds: [],
  },
};

test("deduped reality packet preserves turn facts while removing repeated prose", () => {
  const full = buildRealityConstraintPacketBlock({ ...args, maxChars: 2600 });
  const compact = buildRealityConstraintPacketBlock({ ...args, maxChars: 2600, dedupeStableRules: true });
  assert.ok(compact.length < full.length * 0.55, `${compact.length} !< ${full.length} * 0.55`);
  assert.match(compact, /reality_constraint_v3_compact/);
  assert.match(compact, /1F_Lobby/);
  assert.match(compact, /N-010/);
  assert.doesNotMatch(compact, /latest_user_input_hint|relationship_pressure|epistemic_reaction|digest|journal_clue/);
  const json = compact.slice(compact.indexOf("\n") + 1);
  assert.doesNotThrow(() => JSON.parse(json));
});

test("dedup rollout off preserves the legacy reality packet", () => {
  const legacy = buildRealityConstraintPacketBlock({ ...args, maxChars: 2600, dedupeStableRules: false });
  assert.match(legacy, /reality_constraint_v1/);
  assert.match(legacy, /latest_user_input_hint/);
});
