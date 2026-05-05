import test from "node:test";
import assert from "node:assert/strict";
import {
  getHomeAutoSlotId,
  planGuestLocalSaveCloudSync,
  resolveHomeContinueTimestamps,
  resolveHomeEntryState,
  shouldUseResumeShadowFallback,
} from "@/components/home/continueFallback";

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

test("home continue rows resolve cloud and local timestamps without undefined bindings", () => {
  const localUpdatedAtIso = "2026-04-28T08:59:00.000Z";
  const cloudUpdatedAt = "2026-04-29T08:59:00.000Z";
  assert.deepEqual(
    resolveHomeContinueTimestamps({
      localUpdatedAtIso,
      cloudUpdatedAt,
      cloudUpdatedAtIso: "2026-04-27T08:59:00.000Z",
    }),
    {
      localTs: Date.parse(localUpdatedAtIso),
      cloudTs: Date.parse(cloudUpdatedAt),
    }
  );

  const cloudOnlyUpdatedAtIso = "2026-04-30T08:59:00.000Z";
  assert.deepEqual(
    resolveHomeContinueTimestamps({
      localUpdatedAtIso: null,
      cloudUpdatedAt: "not-a-date",
      cloudUpdatedAtIso: cloudOnlyUpdatedAtIso,
    }),
    {
      localTs: 0,
      cloudTs: Date.parse(cloudOnlyUpdatedAtIso),
    }
  );
});

test("guest local save cloud migration syncs missing and newer local slots only", () => {
  const plans = planGuestLocalSaveCloudSync({
    localSaves: [
      { slotId: "main_slot", updatedAtIso: "2026-05-01T10:00:00.000Z" },
      { slotId: "branch_slot", updatedAtIso: "2026-05-01T12:00:00.000Z" },
      { slotId: "cloud_newer", updatedAtIso: "2026-05-01T08:00:00.000Z" },
      { slotId: "auto_main", updatedAtIso: "2026-05-01T14:00:00.000Z" },
    ],
    cloudSaves: [
      { slotId: "main_slot", updatedAt: "2026-05-01T09:00:00.000Z" },
      { slotId: "cloud_newer", updatedAt: "2026-05-01T09:30:00.000Z" },
    ],
  });

  assert.deepEqual(plans, [
    { slotId: "main_slot", reason: "local_newer" },
    { slotId: "branch_slot", reason: "missing_cloud" },
  ]);
  assert.equal(getHomeAutoSlotId("main_slot"), "auto_main");
  assert.equal(getHomeAutoSlotId("branch_slot"), "auto_branch_slot");
});
