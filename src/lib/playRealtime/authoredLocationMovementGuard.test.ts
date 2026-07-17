import assert from "node:assert/strict";
import test from "node:test";
import { applyAuthoredLocationMovementGuard } from "./authoredLocationMovementGuard";

test("authored adjacent movement wins over an invented lock", () => {
  const out = applyAuthoredLocationMovementGuard({ dmRecord: { narrative: "门锁着，无法进入。" }, latestUserInput: "前往1F_PropertyOffice", clientState: { playerLocation: "1F_Lobby", worldFlags: [] } });
  assert.equal(out.player_location, "1F_PropertyOffice");
  assert.doesNotMatch(String(out.narrative), /无法进入/);
});

test("non-adjacent teleport is not synthesized", () => {
  const out = applyAuthoredLocationMovementGuard({ dmRecord: {}, latestUserInput: "前往7F_Bench", clientState: { playerLocation: "1F_Lobby" } });
  assert.equal(out.player_location, undefined);
});

test("model-proposed non-adjacent or unknown location delta is blocked", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { narrative: "我已经到了地下。", player_location: "B1_Lobby" },
    latestUserInput: "我要直接下到B2层",
    clientState: { playerLocation: "1F_Lobby", worldFlags: [] },
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.is_action_legal, false);
  assert.ok((out._commit_flags as string[]).includes("invalid_location_delta_blocked_v1"));
  assert.match(String(out.narrative), /仍留在原地/);
});

test("legacy Chinese save locations are canonicalized before validating deltas", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { narrative: "我穿过传送门。", player_location: "暗月大厅" },
    latestUserInput: "穿过暗月大厅",
    clientState: { playerLocation: "旧公寓三楼走廊", worldFlags: [] },
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.is_action_legal, false);
  assert.ok((out._commit_flags as string[]).includes("invalid_location_delta_blocked_v1"));
});
