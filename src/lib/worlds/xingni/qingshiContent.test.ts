import test from "node:test";
import assert from "node:assert/strict";
import { canTraverseQingshi, getQingshiNeighbors, QINGSHI_NPCS, validateQingshiContent } from "./qingshiContent";

test("Qingshi content has a valid fixed graph and one Golden Core NPC", () => {
  assert.deepEqual(validateQingshiContent(), []);
  assert.equal(QINGSHI_NPCS.filter((npc) => npc.realm.startsWith("金丹")).length, 1);
  assert.equal(canTraverseQingshi("QS_GUOYAN_INN", "QS_CULTIVATOR_MARKET"), true);
  assert.equal(canTraverseQingshi("QS_GUOYAN_INN", "QS_SPIRIT_SPRING_CAVE"), false);
  assert.deepEqual(getQingshiNeighbors("QS_GUOYAN_INN").toSorted(), ["QS_CULTIVATOR_MARKET", "QS_SOUTH_GATE"]);
});
