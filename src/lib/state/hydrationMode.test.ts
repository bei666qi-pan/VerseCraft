import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HYDRATION_HARD_DEADLINE_MS,
  HYDRATION_SOFT_DEADLINE_MS,
  hasLiveGameplayState,
  mergePersistedStateAfterHydrationDeadline,
} from "@/lib/state/hydrationMode";

test("hydration deadlines match degraded mode spec", () => {
  assert.equal(HYDRATION_SOFT_DEADLINE_MS, 3000);
  assert.equal(HYDRATION_HARD_DEADLINE_MS, 6000);
});

test("late rehydrate preserves live gameplay state in degraded mode", () => {
  const merged = mergePersistedStateAfterHydrationDeadline(
    { playerName: "旧档", logs: [{ role: "assistant", content: "旧" }], saveSlots: { old: {} } },
    { storageMode: "degraded", isHydrated: true, isGameStarted: true, playerName: "新档", logs: [{ role: "user", content: "新" }], saveSlots: { live: {} } }
  );
  assert.equal(merged.playerName, "新档");
  assert.deepEqual(Object.keys(merged.saveSlots as Record<string, unknown>), ["live"]);
});

test("late rehydrate can restore persisted state before gameplay starts", () => {
  const merged = mergePersistedStateAfterHydrationDeadline(
    { playerName: "旧档", logs: [{ role: "assistant", content: "旧" }] },
    { storageMode: "degraded", isHydrated: true, isGameStarted: false, playerName: "", logs: [] }
  );
  assert.equal(merged.playerName, "旧档");
  assert.equal(hasLiveGameplayState(merged), true);
});
