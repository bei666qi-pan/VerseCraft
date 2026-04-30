import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldGraph, canTraverseWorldEdge, shortestPathDistance } from "./graph";

test("B1 to B2 is not a normal traversable edge", () => {
  const graph = buildWorldGraph();
  assert.equal(graph.get("B1_SafeZone")?.has("B2_Passage"), false);
  assert.equal(shortestPathDistance(graph, "B1_SafeZone", "B2_Passage"), Number.POSITIVE_INFINITY);
});

test("B1 to B2 locked edge requires explicit access flag", () => {
  const graph = buildWorldGraph({ includeLockedEdges: true });
  assert.equal(graph.get("B1_SafeZone")?.has("B2_Passage"), true);
  assert.equal(canTraverseWorldEdge("B1_SafeZone", "B2_Passage", []), false);
  assert.equal(canTraverseWorldEdge("B1_SafeZone", "B2_Passage", ["b2_access_granted"]), true);
  assert.equal(canTraverseWorldEdge("B1_SafeZone", "B2_Passage", ["escape:b2_access_granted"]), true);
});
