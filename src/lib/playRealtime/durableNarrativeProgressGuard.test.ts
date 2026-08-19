import test from "node:test";
import assert from "node:assert/strict";
import { applyDurableNarrativeProgressGuard } from "./durableNarrativeProgressGuard";

test("downgrades a definitive written clue reveal with no structured evidence", () => {
  const out = applyDurableNarrativeProgressGuard({
    dmRecord: {
      is_action_legal: true,
      consumes_time: true,
      narrative: "我翻到登记簿第三页，上面写着：『配水房铁门能通往出口。』",
      clue_updates: [],
      codex_updates: [],
      foreshadow_ops: [],
    },
  });
  assert.equal(out.is_action_legal, false);
  assert.doesNotMatch(String(out.narrative), /能通往出口/);
  assert.ok((out._commit_flags as string[]).includes("unsupported_written_clue_progress_downgraded_v1"));
});

test("downgrades a door unlock success with no structured progress", () => {
  const out = applyDurableNarrativeProgressGuard({
    dmRecord: {
      narrative: "锁头自己咔嗒弹开，链条随即垂落。",
      clue_updates: [],
      foreshadow_ops: [],
    },
  });
  assert.doesNotMatch(String(out.narrative), /弹开|垂落/);
  assert.doesNotMatch(String(out.narrative), /结构化|提交|系统|校验|已登记/);
  assert.ok(String(out.narrative).length >= 260);
  assert.ok((out._commit_flags as string[]).includes("unsupported_unlock_progress_downgraded_v1"));
});

test("downgrades live door-open phrasings when codex observation is the only delta", () => {
  for (const narrative of [
    "锁芯\"咔\"一声脆响，门缝里涌出穿堂风——门开了。",
    "锁芯在指腹下\"咔\"地让开——门开了，门后只有一片惨白灯光。",
  ]) {
    const out = applyDurableNarrativeProgressGuard({
      dmRecord: {
        narrative,
        player_location: "3F_Hallway",
        codex_updates: [{ id: "anomaly_locked_door" }],
      },
      clientState: { playerLocation: "3F_Hallway" },
    });
    assert.equal(out.is_action_legal, false);
    assert.doesNotMatch(String(out.narrative), /门开了|让开/);
    assert.ok((out._commit_flags as string[]).includes("unsupported_unlock_progress_downgraded_v1"));
  }
});

test("downgrades forced door traversal phrasing from the latest live trace", () => {
  const out = applyDurableNarrativeProgressGuard({
    dmRecord: {
      narrative: "我肩膀抵住铁门，使了全力。锁芯没撑过第二下，咔一声，门缝里漏出冷风。门后不是楼梯，是另一条走廊。",
      player_location: "3F_Hallway",
      codex_updates: [],
    },
    latestUserInput: "我强行打开这扇锁着的门",
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.is_action_legal, false);
  assert.doesNotMatch(String(out.narrative), /没撑过|门后不是|另一条走廊/);
  assert.ok((out._commit_flags as string[]).includes("unsupported_unlock_progress_downgraded_v1"));
});

test("downgrades a later unsupported door opening even when another door failed first", () => {
  const out = applyDurableNarrativeProgressGuard({
    dmRecord: {
      narrative: "我用力拉消防门，门板纹丝不动，锁销咬得死紧。回头时，那扇没编号的门却自己开了一条缝，门缝里有什么东西动了一下。",
      player_location: "2F_Corridor",
      clue_updates: [],
      foreshadow_ops: [],
    },
    latestUserInput: "直奔出口",
    clientState: { playerLocation: "2F_Corridor" },
  });
  assert.equal(out.is_action_legal, false);
  assert.doesNotMatch(String(out.narrative), /自己开了|门缝里/);
  assert.ok((out._commit_flags as string[]).includes("unsupported_unlock_progress_downgraded_v1"));
});

test("downgrades the r20 cross-sentence door opening and uncommitted written reveal", () => {
  const out = applyDurableNarrativeProgressGuard({
    dmRecord: {
      narrative: "我停在门前，手掌按上去，门板冰凉，但没锁。推开的瞬间，一股陈灰扑过来。桌上摊着一本练习册，纸页写着：『三楼尽头的房间，别进去。』",
      clue_updates: [],
      codex_updates: [],
      foreshadow_ops: [],
    },
    latestUserInput: "查看房间四周",
    clientState: { playerLocation: "旧公寓三楼走廊" },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.player_location, undefined);
  assert.doesNotMatch(String(out.narrative), /推开的瞬间|三楼尽头的房间|别进去/);
  assert.ok((out._commit_flags as string[]).some((flag) => flag === "unsupported_written_clue_progress_downgraded_v1" || flag === "unsupported_unlock_progress_downgraded_v1"));
});

test("downgrades an unsupported hidden-passage discovery from the live trace", () => {
  for (const narrative of [
    "木板猛然向内凹陷，露出一个狭窄的漆黑入口。手电光只照见几级台阶。这似乎是一条隐藏的通道。",
    "我先试着用手指扣住缝隙，木板还不足以完全打开。随后用力一撬，木板终于被掀起一角，下方露出一段昏暗的阶梯。",
    "我把指节抵在门缝边的墙板上，那块墙砖明显比周围松。我用指缝一抠，墙砖应声翘起，露出一条仅容一人伸身的窄梯。",
  ]) {
    const out = applyDurableNarrativeProgressGuard({
      dmRecord: {
        narrative,
        clue_updates: [],
        codex_updates: [],
        foreshadow_ops: [],
      },
      latestUserInput: "看看有没有隐藏的通道",
      clientState: { playerLocation: "旧公寓三楼走廊" },
    });
    assert.equal(out.is_action_legal, false);
    assert.doesNotMatch(String(out.narrative), /露出一个|隐藏的通道|台阶|阶梯/);
    assert.ok((out._commit_flags as string[]).includes("unsupported_hidden_passage_progress_downgraded_v1"));
  }
});

test("downgrades push-open and slide-open door progress without a registered transition", () => {
  for (const narrative of [
    "我推开铁门，眼前是一条更狭窄的通道，两侧墙壁布满管道和线缆。",
    "指尖刚触到门板，门就无声地滑开一线，门缝里透出暖黄的光。",
  ]) {
    const out = applyDurableNarrativeProgressGuard({
      dmRecord: { narrative, player_location: "3F_Hallway" },
      clientState: { playerLocation: "3F_Hallway" },
    });
    assert.equal(out.is_action_legal, false);
    assert.doesNotMatch(String(out.narrative), /推开|滑开|狭窄的通道/);
    assert.ok((out._commit_flags as string[]).includes("unsupported_unlock_progress_downgraded_v1"));
  }
});

test("keeps ordinary environmental writing and failed lock attempts", () => {
  for (const narrative of [
    "柜台上摆着一本合拢的登记簿，封面落满灰尘。",
    "我拽了拽锁头，锁芯纹丝不动，门仍然锁着。",
  ]) {
    const input = { narrative, clue_updates: [], foreshadow_ops: [] };
    assert.equal(applyDurableNarrativeProgressGuard({ dmRecord: input }), input);
  }
});

test("keeps durable narrative when a structured clue or foreshadow operation supports it", () => {
  const clueInput = {
    narrative: "我翻到登记簿第三页，上面写着：『配水房铁门能通往出口。』",
    clue_updates: [{ id: "CLUE-REGISTER-3" }],
  };
  const doorInput = {
    narrative: "锁头自己咔嗒弹开，链条随即垂落。",
    foreshadow_ops: [{ id: "FORESHADOW-LOCK", op: "advance" }],
  };
  assert.equal(applyDurableNarrativeProgressGuard({ dmRecord: clueInput }), clueInput);
  assert.equal(applyDurableNarrativeProgressGuard({ dmRecord: doorInput }), doorInput);
});

test("keeps a door opening that accompanies a committed location transition", () => {
  const input = {
    narrative: "铁门终于打开，我沿登记路线进入二楼走廊。",
    player_location: "2F_Corridor",
  };
  assert.equal(
    applyDurableNarrativeProgressGuard({
      dmRecord: input,
      clientState: { playerLocation: "3F_Stairwell" },
    }),
    input,
  );
});
