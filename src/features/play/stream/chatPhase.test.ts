import assert from "node:assert/strict";
import test from "node:test";
import {
  doesChatPhaseLockInteraction,
  doesPhaseBlockOptionsRegen,
} from "./chatPhase";

test("doesPhaseBlockOptionsRegen: idle tail_draining and error allow options regen gate pass", () => {
  assert.equal(doesPhaseBlockOptionsRegen("idle"), false);
  assert.equal(doesPhaseBlockOptionsRegen("error"), false);
  assert.equal(doesPhaseBlockOptionsRegen("tail_draining"), false);
});

test("doesPhaseBlockOptionsRegen: upstream stream commit block regen", () => {
  assert.equal(doesPhaseBlockOptionsRegen("waiting_upstream"), true);
  assert.equal(doesPhaseBlockOptionsRegen("streaming_body"), true);
  assert.equal(doesPhaseBlockOptionsRegen("turn_committing"), true);
});

test("doesChatPhaseLockInteraction: tail_draining still locks general interaction", () => {
  assert.equal(doesChatPhaseLockInteraction("tail_draining"), true);
});
