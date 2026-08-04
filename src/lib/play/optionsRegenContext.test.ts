import test from "node:test";
import assert from "node:assert/strict";
import { buildClientOptionsRegenContext, buildOptionsRegenContextPacket } from "@/lib/play/optionsRegenContext";

test("options regen context should include latest anchors and option snapshots", () => {
  const ctx = buildClientOptionsRegenContext({
    latestPlayerAction: "我贴近门缝听动静",
    latestNarrativeExcerpt: "门缝后传来急促喘息，楼道尽头灯光忽明忽暗。",
    currentOptions: ["观察门缝", "前往楼道尽头"],
    recentOptions: ["检查门缝", "贴近门缝听动静"],
    tasks: [{ title: "确认楼道异响来源", status: "active" }],
  });
  assert.equal(ctx.latestPlayerAction.includes("贴近门缝"), true);
  assert.equal(ctx.latestNarrativeExcerpt.includes("楼道尽头"), true);
  assert.deepEqual(ctx.currentOptions, ["观察门缝", "前往楼道尽头"]);
  assert.deepEqual(ctx.recentOptions, ["检查门缝", "贴近门缝听动静"]);
  assert.equal(ctx.activeTaskSummaries.length, 1);
});

test("options regen packet should include location time and anti-reuse sections", () => {
  const packet = buildOptionsRegenContextPacket({
    reason: "用户手动点击刷新选项按钮",
    context: {
      latestPlayerAction: "我贴近门缝听动静",
      latestNarrativeExcerpt: "门缝后传来急促喘息。",
      currentOptions: ["观察门缝"],
      recentOptions: ["检查门缝"],
      activeTaskSummaries: ["确认楼道异响来源（active）"],
    },
    playerContextSnapshot: "体力稳定，理智轻度下降。",
    clientState: {
      v: 1,
      turnIndex: 5,
      playerLocation: "B1走廊",
      time: { day: 2, hour: 23 },
      originium: 10,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
    },
  });
  assert.equal(packet.includes("【最近玩家动作】我贴近门缝听动静"), true);
  assert.equal(packet.includes("【最近叙事片段】门缝后传来急促喘息"), true);
  assert.equal(packet.includes("【当前位置】B1走廊"), true);
  assert.equal(packet.includes("【时间】第2日 23时"), true);
  assert.equal(packet.includes("【当前屏幕选项（禁止复用）】观察门缝"), true);
  assert.equal(packet.includes("【最近出现选项（禁止复用）】检查门缝"), true);
});


// ── boundary / edge-case tests ──────────────────────────────────

test("options regen context: empty arrays produce empty payload fields", () => {
  const ctx = buildClientOptionsRegenContext({
    latestPlayerAction: "",
    latestNarrativeExcerpt: "",
    currentOptions: [],
    recentOptions: [],
    tasks: [],
  });
  assert.deepEqual(ctx.currentOptions, []);
  assert.deepEqual(ctx.recentOptions, []);
  assert.deepEqual(ctx.activeTaskSummaries, []);
  assert.equal(ctx.latestPlayerAction, "");
  assert.equal(ctx.latestNarrativeExcerpt, "");
});

test("options regen context: clips long strings", () => {
  const ctx = buildClientOptionsRegenContext({
    latestPlayerAction: "A".repeat(500),
    latestNarrativeExcerpt: "B".repeat(2000),
    currentOptions: ["C".repeat(100)],
    recentOptions: [],
    tasks: [],
  });
  assert.equal(ctx.latestPlayerAction.length <= 280, true);
  assert.equal(ctx.latestNarrativeExcerpt.length <= 1200, true);
  assert.equal(ctx.currentOptions[0]!.length <= 40, true);
});

test("options regen context: non-array inputs are coerced to empty arrays", () => {
  const ctx = buildClientOptionsRegenContext({
    latestPlayerAction: "action",
    latestNarrativeExcerpt: "narrative",
    currentOptions: null as unknown as string[],
    recentOptions: undefined as unknown as string[],
    tasks: "not-an-array" as unknown as Array<{ title?: string }>,
  });
  assert.deepEqual(ctx.currentOptions, []);
  assert.deepEqual(ctx.recentOptions, []);
  assert.deepEqual(ctx.activeTaskSummaries, []);
});

test("options regen context: repair fields default to safe values", () => {
  const ctx = buildClientOptionsRegenContext({
    latestPlayerAction: "action",
    latestNarrativeExcerpt: "narrative",
    currentOptions: [],
    recentOptions: [],
    tasks: [],
    repairNeedCount: -5, // clamped to 0
    repairLockedOptions: ["A".repeat(100)], // clipped
  });
  assert.equal(ctx.repairNeedCount, 0);
  assert.equal(ctx.repairLockedOptions!.length, 1);
  assert.equal(ctx.repairLockedOptions![0]!.length <= 40, true);
});

test("options regen context: repairNeedCount clamped to [0, 4]", () => {
  const base = { latestPlayerAction: "a", latestNarrativeExcerpt: "b", currentOptions: [], recentOptions: [], tasks: [] };
  assert.equal(buildClientOptionsRegenContext({ ...base, repairNeedCount: -1 }).repairNeedCount, 0);
  assert.equal(buildClientOptionsRegenContext({ ...base, repairNeedCount: 0 }).repairNeedCount, 0);
  assert.equal(buildClientOptionsRegenContext({ ...base, repairNeedCount: 2 }).repairNeedCount, 2);
  assert.equal(buildClientOptionsRegenContext({ ...base, repairNeedCount: 4 }).repairNeedCount, 4);
  assert.equal(buildClientOptionsRegenContext({ ...base, repairNeedCount: 10 }).repairNeedCount, 4);
});

test("options regen context: inventoryHints coercion and clipping", () => {
  const ctx = buildClientOptionsRegenContext({
    latestPlayerAction: "action",
    latestNarrativeExcerpt: "narrative",
    currentOptions: [],
    recentOptions: [],
    tasks: [],
    inventoryHints: ["手电筒", "", "  ", "A".repeat(100), "钥匙", "绷带", "地图", "指南针"],
  });
  // empty/whitespace filtered, long clipped, max 6
  assert.equal(ctx.inventoryHints!.length <= 6, true);
  assert.ok(ctx.inventoryHints!.includes("手电筒"));
});

test("options regen packet: null context and clientState produce minimal output", () => {
  const packet = buildOptionsRegenContextPacket({
    reason: "测试",
    context: null,
    playerContextSnapshot: "",
    clientState: null,
  });
  // should not crash — produces at minimum the reason line
  assert.equal(packet.includes("测试"), true);
});

test("options regen packet: missing time fields do not crash", () => {
  const packet = buildOptionsRegenContextPacket({
    reason: "测试",
    context: {
      latestPlayerAction: "action",
      latestNarrativeExcerpt: "narrative",
      currentOptions: ["opt1"],
      recentOptions: [],
      activeTaskSummaries: [],
    },
    playerContextSnapshot: "状态摘要",
    clientState: {
      v: 1,
      turnIndex: 1,
      playerLocation: "大厅",
      time: { day: NaN, hour: NaN },
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
    },
  });
  assert.equal(packet.includes("第"), false); // NaN day/hour → no time line
  assert.equal(packet.includes("当前位置】大厅"), true);
});

test("options regen packet: repair fields appear when set", () => {
  const packet = buildOptionsRegenContextPacket({
    reason: "修复选项",
    context: {
      latestPlayerAction: "action",
      latestNarrativeExcerpt: "narrative",
      currentOptions: ["opt1"],
      recentOptions: [],
      activeTaskSummaries: [],
      repairNeedCount: 2,
      repairLockedOptions: ["locked1"],
    },
    playerContextSnapshot: "状态",
    clientState: {
      v: 1,
      turnIndex: 1,
      playerLocation: "大厅",
      time: { day: 1, hour: 12 },
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
    },
  });
  assert.equal(packet.includes("修复目标"), true);
  assert.equal(packet.includes("已通过选项"), true);
  assert.equal(packet.includes("locked1"), true);
});
