import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { build7FConspiracyNarrativeBlock, ensure7FConspiracyTask, shouldTrigger7FAnchorConspiracy } from "./conspiracy";

describe("7f conspiracy trigger", () => {
  it("triggers with revive + anchor7 + early day", () => {
    const ctx =
      "游戏时间[第2日 8时]。用户位置[7F_Bench]。世界标记：reviveFastForward12h。锚点解锁：B1[1]，1F[1]，7F[1]。最近复活：死亡地点[6F_Stairwell]，死因[x]。";
    assert.equal(shouldTrigger7FAnchorConspiracy({ playerContext: ctx, latestUserInput: "我询问老人真相" }), true);
    assert.ok(build7FConspiracyNarrativeBlock({ playerContext: ctx, latestUserInput: "我询问老人真相" }).includes("夜读老人"));
  });

  it("injects conspiracy task when missing", () => {
    const ctx =
      "游戏时间[第2日 8时]。用户位置[7F_Bench]。世界标记：reviveFastForward12h。锚点解锁：B1[1]，1F[1]，7F[1]。最近复活：死亡地点[6F_Stairwell]。";
    const out = ensure7FConspiracyTask({}, { playerContext: ctx, latestUserInput: "我看向老人" });
    const arr = Array.isArray(out.new_tasks) ? out.new_tasks : [];
    assert.equal(arr.length, 1);
    const id = (arr[0] as { id?: string }).id;
    assert.equal(id, "cons_7f_cleanse_all_trap");
  });

  it("supports keyword trigger even when location not near 7f", () => {
    const ctx =
      "游戏时间[第2日 8时]。用户位置[1F_Lobby]。世界标记：reviveFastForward12h。锚点解锁：B1[1]，1F[1]，7F[1]。最近复活：死亡地点[6F_Stairwell]。";
    assert.equal(shouldTrigger7FAnchorConspiracy({ playerContext: ctx, latestUserInput: "我想谈谈七楼老人的阴谋" }), true);
  });

  it("does not trigger when world flag already opened", () => {
    const ctx =
      "游戏时间[第2日 8时]。用户位置[7F_Bench]。世界标记：reviveFastForward12h，conspiracy_7f_elder_trap_opened。锚点解锁：B1[1]，1F[1]，7F[1]。最近复活：死亡地点[6F_Stairwell]。";
    assert.equal(shouldTrigger7FAnchorConspiracy({ playerContext: ctx, latestUserInput: "我问老人" }), false);
  });
});
