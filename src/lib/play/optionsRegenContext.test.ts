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

