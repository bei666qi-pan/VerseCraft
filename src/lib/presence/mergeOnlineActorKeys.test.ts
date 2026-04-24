// src/lib/presence/mergeOnlineActorKeys.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { mergeOnlineActorKeys } from "@/lib/presence/mergeOnlineActorKeys";

test("merge: Redis down => merged = DB, redisDown true, dbOnly not counted (no flaky signal)", () => {
  const r = mergeOnlineActorKeys(null, ["u1"], ["g:a"]);
  assert.equal(r.redisDown, true);
  assert.deepEqual(new Set(r.merged), new Set(["u1", "g:a"]));
  assert.equal(r.dbOnly, 0);
  assert.equal(r.both, 0);
});

test("merge: Redis miss but DB hit => dbOnly, flaky", () => {
  const r = mergeOnlineActorKeys([], ["u1"], []);
  assert.equal(r.redisDown, false);
  assert.equal(r.dbOnly, 1);
  assert.equal(r.both, 0);
  assert.equal(r.merged.includes("u1"), true);
});

test("merge: both paths agree", () => {
  const r = mergeOnlineActorKeys(["u1", "g:x"], ["u1"], ["g:x"]);
  assert.equal(r.both, 2);
  assert.equal(r.dbOnly, 0);
  assert.equal(r.redisOnly, 0);
});
