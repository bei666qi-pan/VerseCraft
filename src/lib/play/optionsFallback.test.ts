import test from "node:test";
import assert from "node:assert/strict";
import { generateDeterministicFallbackOptions } from "@/lib/play/optionsFallback";

test("fallback: door-lock-corridor scene should anchor to door/corridor objects", () => {
  const out = generateDeterministicFallbackOptions({
    latestNarrative: "你听见门锁里有轻微卡顿，走廊尽头的门缝闪过一丝影子。",
    playerLocation: "B1走廊",
    activeTaskSummaries: ["确认异响来源（active）"],
    inventoryHints: ["手电"],
    blockedOptions: ["观察门缝", "检查门锁"],
    existingOptions: ["我前往楼道尽头确认异响来源"],
    needCount: 3,
  });
  assert.equal(out.length > 0, true);
  assert.equal(out.every((x) => /门|锁|走廊|门缝/.test(x)), true);
  assert.equal(out.some((x) => x.includes("手电")), true);
});

test("fallback: npc dialogue scene should generate social and verification actions", () => {
  const out = generateDeterministicFallbackOptions({
    latestNarrative: "老刘压低声音提醒你别站在走廊正中，麟泽让你先确认撤离路线。",
    playerLocation: "旧公寓一层",
    activeTaskSummaries: ["与老刘核对撤离路径（active）"],
    inventoryHints: [],
    blockedOptions: ["我追问老刘刚才异常声源的位置"],
    existingOptions: [],
    needCount: 3,
  });
  assert.equal(out.length > 0, true);
  assert.equal(out.some((x) => /老刘|麟泽/.test(x)), true);
});

test("fallback: risk-stealth scene should avoid old option reuse and keep first-person actionable", () => {
  const blocked = ["我贴墙靠近走廊判断风险距离", "我先在楼梯口布置一条撤退路径"];
  const out = generateDeterministicFallbackOptions({
    latestNarrative: "楼梯口传来急促脚步，阴影正在向你逼近。",
    playerLocation: "楼梯口",
    activeTaskSummaries: [],
    inventoryHints: ["镜子"],
    blockedOptions: blocked,
    existingOptions: ["我停在走廊盲区观察潜在动向"],
    needCount: 3,
  });
  assert.equal(out.length >= 1, true);
  assert.equal(out.some((x) => blocked.includes(x)), false);
  assert.equal(out.every((x) => x.startsWith("我")), true);
});

