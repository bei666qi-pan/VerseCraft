import test from "node:test";
import assert from "node:assert/strict";
import { applyLocationNarrativeConsistencyGuard } from "./locationNarrativeConsistencyGuard";

test("never infers player_location from multi-floor prose", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我下到2F，继续下到1F，然后穿过铁门到B1。" },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.is_action_legal, false);
  assert.ok((out._commit_flags as string[]).includes("prose_only_cross_floor_travel_blocked_v2"));
});

test("blocks a prose-only arrival on a different floor without writing location", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我推开防火门，站在五楼入口前，走廊灯冷得发蓝。" },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.is_action_legal, false);
});

test("blocks a prose-only completed transition into another same-floor area", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我穿过走廊，走进一扇门，来到另一个房间。" },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.player_location, undefined);
  assert.ok((out._commit_flags as string[]).includes("prose_only_area_transition_blocked_v1"));
  assert.doesNotMatch(String(out.narrative), /世界图|校验|提交|结构化/);
  assert.match(String(out.narrative), /仍留在3F走廊/);
});

test("keeps complete safe sentences before an unauthorized transition", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我检查门框上的刮痕，又侧耳听了片刻。随后我跨过门槛，进入门后的房间。" },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.match(String(out.narrative), /我检查门框上的刮痕，又侧耳听了片刻。/);
  assert.doesNotMatch(String(out.narrative), /跨过门槛|进入门后的房间|世界图|校验|提交|结构化/);
  assert.match(String(out.narrative), /仍留在3F走廊/);
});

test("keeps movement within the current corridor when no new area is claimed", () => {
  for (const narrative of [
    "我贴着墙根往走廊深处摸过去，注意听周围的动静。",
    "我穿过这段走廊，在当前楼层继续检查门牌和墙面。",
    "我走进走廊更深处，但仍在原来的三楼区域观察。",
  ]) {
    const input = { narrative, player_location: "3F_Hallway" };
    assert.equal(
      applyLocationNarrativeConsistencyGuard({
        dmRecord: input,
        clientState: { playerLocation: "3F_Hallway" },
      }),
      input,
    );
  }
});

test("blocks an explicit transition into a distinct new corridor", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我推开铁门，进入另一条陌生的走廊。" },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.player_location, undefined);
});

test("blocks the live threshold-crossing phrasing without a movement delta", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: {
      narrative: "我跨过门槛，门在身后咔地合拢。绿色指示灯成排亮起。",
      player_location: "3F_Hallway",
    },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.player_location, "3F_Hallway");
  assert.doesNotMatch(String(out.narrative), /跨过门槛|门在身后/);
});

test("removes the r19 threshold claim before an audited failed-door ending", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: {
      narrative: "我不再让两腿在原地打转，直直朝走廊尽头那道半掩的防火门走去，一步不停。脚踏进门槛的瞬间，身后那盏日光灯彻底熄灭。\n\n我停在走廊的门前，门锁纹丝不动，脚下也没有越过门槛。",
    },
    clientState: { playerLocation: "2F_Corridor" },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.player_location, undefined);
  assert.match(String(out.narrative), /仍留在2F走廊/);
  assert.doesNotMatch(String(out.narrative), /脚踏进门槛|身后那盏日光灯彻底熄灭/);
});

test("blocks multi-floor traversal and keeps authoritative location absent", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我下到2F，继续下到1F，然后穿过铁门到B1。" },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.is_action_legal, false);
});

test("keeps atmosphere mentioning one floor", () => {
  const input = { narrative: "3F的灯闪了一下，我停在原地。" };
  assert.equal(applyLocationNarrativeConsistencyGuard({ dmRecord: input, clientState: { playerLocation: "3F_Hallway" } }), input);
});

test("blocks completed cross-floor prose without an explicit floor number", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我几步冲下楼梯，数着楼层，摸到了楼下消防通道的门把。" },
    clientState: { playerLocation: "3F_Stairwell" },
  });
  assert.equal(out.player_location, undefined);
  assert.equal(out.is_action_legal, false);
  assert.ok((out._commit_flags as string[]).includes("prose_only_cross_floor_travel_blocked_v2"));
});

test("same-location candidate cannot authorize completed cross-floor prose", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: {
      narrative: "我跑下楼梯，已经来到楼下的防火门前。",
      player_location: "3F_Stairwell",
    },
    clientState: { playerLocation: "3F_Stairwell" },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.player_location, "3F_Stairwell");
});

test("does not block an attempted descent that explicitly fails", () => {
  const input = { narrative: "我正要下楼，却被锁死的铁闸拦住，仍留在3F楼梯间。" };
  assert.equal(
    applyLocationNarrativeConsistencyGuard({ dmRecord: input, clientState: { playerLocation: "3F_Stairwell" } }),
    input,
  );
});

test("does not treat an environmental mention of upstairs or downstairs as completed travel", () => {
  for (const narrative of [
    "楼上的灯忽然闪了一下，我仍站在3F走廊观察。",
    "楼下传来一声闷响，我停在楼梯口，没有继续移动。",
  ]) {
    const input = { narrative };
    assert.equal(
      applyLocationNarrativeConsistencyGuard({ dmRecord: input, clientState: { playerLocation: "3F_Hallway" } }),
      input,
    );
  }
});

test("preserves a structured movement to a different authoritative node", () => {
  const input = {
    narrative: "我沿楼梯下到二楼平台。",
    player_location: "2F_Stairwell",
  };
  assert.equal(
    applyLocationNarrativeConsistencyGuard({ dmRecord: input, clientState: { playerLocation: "3F_Stairwell" } }),
    input,
  );
});

test("blocks a Chinese 层 floor contradiction when authoritative location did not move", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "墙上钉着一块写有『三层·西翼』的金属牌。" },
    clientState: { playerLocation: "2F_Corridor" },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.player_location, undefined);
  assert.doesNotMatch(String(out.narrative), /三层/);
});

test("repairs prose that contradicts a valid structured transition without changing the destination", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: {
      is_action_legal: true,
      narrative: "我抵达三层西翼的封墙。",
      player_location: "2F_Corridor",
    },
    clientState: { playerLocation: "3F_Stairwell" },
  });
  assert.equal(out.player_location, "2F_Corridor");
  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /2F走廊/);
  assert.doesNotMatch(String(out.narrative), /已登记|提交|结构化|校验/);
  assert.ok((out._commit_flags as string[]).includes("narrative_location_conflict_repaired_v1"));
});
