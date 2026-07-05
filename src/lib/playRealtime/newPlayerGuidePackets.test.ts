import test from "node:test";
import assert from "node:assert/strict";
import { buildNewPlayerGuidePacket } from "./newPlayerGuidePackets";

function ctx(day: number, hour: number, location: string): string {
  return `用户位置[${location}]。游戏时间[第${day}日 ${hour}时]。`;
}

function ctxWithGuideFlag(day: number, hour: number, location: string, graduated: boolean): string {
  return `${ctx(day, hour, location)}新手引导[${graduated ? "已毕业" : "进行中"}]。`;
}

test("buildNewPlayerGuidePacket: day1 早期时间窗内启用双核引导", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctx(1, 3, "B1_SafeZone"),
    playerLocation: "B1_SafeZone",
    clientState: null,
  });
  assert.equal(p?.enabled, true);
  assert.equal(p?.phase, "early");
  assert.equal(p?.axes.length, 2);
  assert.ok(p?.axes.some((a) => a.npcId === "N-008"));
  assert.ok(p?.axes.some((a) => a.npcId === "N-015"));
});

test("buildNewPlayerGuidePacket: 超过 12 小时且无起手任务残留时按时间关闭", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctx(2, 10, "B1_SafeZone"),
    playerLocation: "B1_SafeZone",
    clientState: null,
    activeTaskTitles: [],
  });
  assert.equal(p?.phase, "off");
  assert.equal(p?.enabled, false);
});

test("buildNewPlayerGuidePacket: 超过 12 小时但起手任务仍未完成时按进度延长引导窗口", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctx(2, 10, "B1_SafeZone"),
    playerLocation: "B1_SafeZone",
    clientState: null,
    activeTaskTitles: ["拼出出口路线碎片[进行中|正式|电工老刘|B1]"],
  });
  assert.equal(p?.phase, "mid");
  assert.equal(p?.enabled, true);
});

test("buildNewPlayerGuidePacket: 按进度延长时仍受地点门控约束", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctx(2, 10, "3F_Corridor"),
    playerLocation: "3F_Corridor",
    clientState: null,
    activeTaskTitles: ["拼出出口路线碎片[进行中|正式|电工老刘|B1]"],
  });
  // 时间/进度窗口仍打开（phase !== off），但不在 B1/1F 时不强启用。
  assert.notEqual(p?.phase, "off");
  assert.equal(p?.enabled, false);
});

test("buildNewPlayerGuidePacket: 未传 activeTaskTitles 时行为与旧版一致（不报错、按时间关闭）", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctx(3, 5, "B1_SafeZone"),
    playerLocation: "B1_SafeZone",
    clientState: null,
  });
  assert.equal(p?.phase, "off");
});

test("buildNewPlayerGuidePacket: 已辨识为老玩家时，即便是 day1 早期窗口也不强制引导", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctxWithGuideFlag(1, 2, "B1_SafeZone", true),
    playerLocation: "B1_SafeZone",
    clientState: null,
    activeTaskTitles: ["在B1建立生存节奏[进行中|正式|电工老刘|B1]"],
  });
  assert.equal(p?.phase, "off");
  assert.equal(p?.enabled, false);
});

test("buildNewPlayerGuidePacket: 未标记为老玩家时 day1 早期窗口不受影响", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctxWithGuideFlag(1, 2, "B1_SafeZone", false),
    playerLocation: "B1_SafeZone",
    clientState: null,
  });
  assert.equal(p?.phase, "early");
  assert.equal(p?.enabled, true);
});

test("buildNewPlayerGuidePacket: 每位教官按对应起手任务是否在追踪中标注 currentlyRelevant", () => {
  const p = buildNewPlayerGuidePacket({
    playerContext: ctx(1, 3, "B1_SafeZone"),
    playerLocation: "B1_SafeZone",
    clientState: null,
    activeTaskTitles: ["在B1建立生存节奏[进行中|正式|电工老刘|B1]"],
  });
  const liu = p?.axes.find((a) => a.npcId === "N-008");
  const linze = p?.axes.find((a) => a.npcId === "N-015");
  assert.equal(liu?.currentlyRelevant, true);
  assert.equal(linze?.currentlyRelevant, false);
});
