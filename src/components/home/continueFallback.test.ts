import test from "node:test";
import assert from "node:assert/strict";
import { resolveHomeEntryState, shouldUseResumeShadowFallback } from "@/components/home/continueFallback";

test("phase4: home should show continue when saveSlots missing but shadow playable", () => {
  const state = resolveHomeEntryState({
    authed: false,
    localHasAny: false,
    hasCloudAnySave: false,
    hasPlayableResumeShadow: true,
  });
  assert.equal(state, "guest_has_progress");
});

test("phase4: authed user with cloud save still has continue", () => {
  const state = resolveHomeEntryState({
    authed: true,
    localHasAny: false,
    hasCloudAnySave: true,
    hasPlayableResumeShadow: false,
  });
  assert.equal(state, "authed_has_progress");
});

test("phase4: should fallback to shadow when row missing", () => {
  assert.equal(
    shouldUseResumeShadowFallback({
      slotId: "",
      rowExists: false,
      hasPlayableResumeShadow: true,
    }),
    true
  );
  assert.equal(
    shouldUseResumeShadowFallback({
      slotId: "main_slot",
      rowExists: true,
      hasPlayableResumeShadow: true,
    }),
    false
  );
});
