import test from "node:test";
import assert from "node:assert/strict";
import { applyDeadNpcContinuityGuard } from "./deadNpcContinuityGuard";

test("dead NPC cannot return or speak", () => {
  const out = applyDeadNpcContinuityGuard({ dmRecord: { narrative: "老刘站在我面前，说：‘我没死。’", npc_location_updates: [{ id: "N-008", to_location: "3F" }] }, latestUserInput: "呼叫死去的N-008老刘", deadNpcIds: ["N-008"] });
  assert.match(String(out.narrative), /死亡记录没有改变/);
  assert.deepEqual(out.npc_location_updates, []);
  assert.ok((out._commit_flags as string[]).includes("dead_npc_resurrection_blocked_v1"));
});

test("living NPC narrative is unchanged", () => {
  const input = { narrative: "老刘从门后走来。" };
  assert.equal(applyDeadNpcContinuityGuard({ dmRecord: input, latestUserInput: "找老刘", deadNpcIds: [] }), input);
});
