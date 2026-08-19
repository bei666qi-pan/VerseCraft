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
  assert.ok((out._commit_flags as string[]).includes("invalid_location_delta_blocked_v2"));
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
  assert.ok((out._commit_flags as string[]).includes("invalid_location_delta_blocked_v2"));
});

test("legacy third-floor hallway enters the registered stairwell on downstairs intent", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { narrative: "我一路下到一楼登记口。", player_location: "一楼登记口" },
    latestUserInput: "下楼探索",
    clientState: { playerLocation: "旧公寓三楼走廊", worldFlags: [] },
  });
  assert.equal(out.player_location, "3F_Stairwell");
  assert.match(String(out.narrative), /三楼楼梯间/);
  assert.doesNotMatch(String(out.narrative), /已登记|逐段确认|位置变化|3F_/);
  assert.ok((out._commit_flags as string[]).includes("canonical_location_transition_v1"));
});

test("explicit Chinese stairwell alias resolves the adjacent registered edge", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { is_action_legal: true, narrative: "通往楼梯间的门锁着，无法进入。" },
    latestUserInput: "沿三楼走廊前往楼梯间；如果道路受阻，明确说明阻碍来自哪里。",
    clientState: { playerLocation: "3F_Hallway", worldFlags: [] },
  });
  assert.equal(out.player_location, "3F_Stairwell");
  assert.doesNotMatch(String(out.narrative), /锁着|无法进入/);
  assert.match(String(out.narrative), /三楼走廊.*三楼楼梯间/);
  assert.doesNotMatch(String(out.narrative), /已登记|逐段确认|位置变化|3F_|陌生人/);
  assert.ok((out._commit_flags as string[]).includes("canonical_location_transition_v1"));
});

test("downstairs intent continues one confirmed edge at a time", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { narrative: "我在楼梯口犹豫了一下。", player_location: "3F_Stairwell" },
    latestUserInput: "继续下楼",
    clientState: { playerLocation: "3F_Stairwell", worldFlags: [] },
  });
  assert.equal(out.player_location, "2F_Corridor");
  assert.match(String(out.narrative), /三楼楼梯间.*二楼走廊/);
  assert.doesNotMatch(String(out.narrative), /已登记|逐段确认|位置变化|(?:2F|3F)_|陌生人/);
});

test("unique adjacent bare room number resolves to one canonical edge", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { is_action_legal: true, narrative: "我停在楼梯间等路线确认。" },
    latestUserInput: "进入302",
    clientState: { playerLocation: "3F_Stairwell", worldFlags: [] },
  });
  assert.equal(out.player_location, "3F_Room302");
  assert.match(String(out.narrative), /三楼 302 室/);
  assert.doesNotMatch(String(out.narrative), /已登记|逐段确认|位置变化|3F_|陌生人/);
  assert.ok((out._commit_flags as string[]).includes("canonical_location_transition_v1"));
});

test("unknown bare room number is not synthesized", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { is_action_legal: true, narrative: "我还在楼梯间。" },
    latestUserInput: "进入399",
    clientState: { playerLocation: "3F_Stairwell", worldFlags: [] },
  });
  assert.equal(out.player_location, undefined);
});

test("unknown location candidate is stripped without rejecting an observation turn", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { is_action_legal: true, narrative: "门缝下有一条新的泥痕。", player_location: "旧公寓三楼走廊·304门口" },
    latestUserInput: "看看有没有隐藏的通道",
    clientState: { playerLocation: "旧公寓三楼走廊", worldFlags: [] },
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, "门缝下有一条新的泥痕。");
  assert.ok((out._commit_flags as string[]).includes("invalid_location_delta_stripped_v1"));
});

test("canonical movement synthesis can be disabled without bypassing candidate validation", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: { narrative: "我正要下楼。" },
    latestUserInput: "下楼探索",
    clientState: { playerLocation: "旧公寓三楼走廊", worldFlags: [] },
    enableCanonicalLocationMovement: false,
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.narrative, "我正要下楼。");
});

test("approaching an NPC to talk is dialogue, not unresolved location traversal", () => {
  const out = applyAuthoredLocationMovementGuard({
    dmRecord: {
      is_action_legal: true,
      consumes_time: true,
      narrative: "我在陈婆婆面前停下，问起最近楼里的怪事。",
      player_location: "陈婆婆",
    },
    latestUserInput: "我走向陈婆婆，想和他聊聊最近发生的事。（再试一次）",
    clientState: { playerLocation: "公寓一楼走廊", worldFlags: [] },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, "我在陈婆婆面前停下，问起最近楼里的怪事。");
  assert.equal(out.player_location, undefined);
  assert.equal(Boolean((out._commit_flags as string[] | undefined)?.includes("invalid_location_delta_blocked_v2")), false);
});
