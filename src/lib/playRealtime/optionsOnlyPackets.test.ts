import test from "node:test";
import assert from "node:assert/strict";
import { buildOptionsOnlyUserPacket } from "@/lib/playRealtime/optionsOnlyPackets";

test("options-only packet should include latest user action anchor", () => {
  const packet = buildOptionsOnlyUserPacket({
    reason: "主回合 narrative 正常但 options 缺失",
    optionsRegenContext: {
      latestPlayerAction: "我贴着墙向声音靠近",
      latestNarrativeExcerpt: "你听见走廊尽头传来金属拖拽声。",
      currentOptions: ["观察门缝"],
      recentOptions: ["贴近门缝听动静"],
      activeTaskSummaries: ["确认走廊异响来源（active）"],
    },
    playerContextSnapshot: "体力稳定，手持手电。",
    clientState: { v: 1, turnIndex: 3, playerLocation: "B1走廊", originium: 0, inventoryItemIds: [], warehouseItemIds: [], equippedWeapon: null, weaponBag: [], currentProfession: null, worldFlags: [] },
  });
  assert.equal(packet.includes("【最近玩家动作】我贴着墙向声音靠近"), true);
  assert.equal(packet.includes("【当前屏幕选项（禁止复用）】观察门缝"), true);
  assert.equal(packet.includes("【最近出现选项（禁止复用）】贴近门缝听动静"), true);
});
