import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskDramaPacket } from "./drama";
import type { GameTaskV2 } from "./taskV2";

const baseTask: GameTaskV2 = {
  id: "t1",
  title: "测试委托",
  desc: "",
  type: "floor",
  issuerId: "N-008",
  issuerName: "电工老刘",
  floorTier: "B1",
  guidanceLevel: "none",
  reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
  status: "active",
  expiresAt: null,
  betrayalPossible: false,
  hiddenOutcome: "",
  hiddenTriggerConditions: [],
  claimMode: "auto",
  npcProactiveGrant: {
    enabled: false,
    npcId: "",
    minFavorability: 0,
    preferredLocations: [],
    cooldownHours: 0,
  },
  npcProactiveGrantLastIssuedHour: null,
  nextHint: "",
  worldConsequences: [],
  highRiskHighReward: false,
} as GameTaskV2;

test("buildTaskDramaPacket includes spokenDeliveryStyle as a concrete voice hint", () => {
  const t: GameTaskV2 = { ...baseTask, spokenDeliveryStyle: "嘴硬心软，骂两句再给实用提醒。" };
  const packet = buildTaskDramaPacket({ tasks: [t] });
  assert.ok(packet.includes("语气：嘴硬心软"));
});

test("buildTaskDramaPacket falls back to a translated persona hint when spokenDeliveryStyle is absent", () => {
  const t: GameTaskV2 = { ...baseTask, issuerPersonaMode: "sweet_patch" };
  const packet = buildTaskDramaPacket({ tasks: [t] });
  // 不应把内部枚举码原样传给模型
  assert.equal(packet.includes("sweet_patch"), false);
  assert.ok(packet.includes("语气："));
  assert.ok(packet.includes("藏着算计"));
});

test("buildTaskDramaPacket surfaces hiddenMotive as subtext-only guidance", () => {
  const t: GameTaskV2 = { ...baseTask, hiddenMotive: "她在筛选你是否值得进入更高层路线。" };
  const packet = buildTaskDramaPacket({ tasks: [t] });
  assert.ok(packet.includes("潜台词（角色不可自己说破）：她在筛选"));
});

test("buildTaskDramaPacket translates issuerSoftRevealMode instead of leaking the raw code", () => {
  const t: GameTaskV2 = { ...baseTask, issuerSoftRevealMode: "ledger_shadow" };
  const packet = buildTaskDramaPacket({ tasks: [t] });
  assert.equal(packet.includes("ledger_shadow"), false);
  assert.ok(packet.includes("翻旧账时无意带出"));
});

test("buildTaskDramaPacket adds a concrete guidance directive for strong/light guidanceLevel", () => {
  const strong = buildTaskDramaPacket({ tasks: [{ ...baseTask, guidanceLevel: "strong" }] });
  const light = buildTaskDramaPacket({ tasks: [{ ...baseTask, id: "t2", guidanceLevel: "light" }] });
  assert.ok(strong.includes("引导：给清晰下一步"));
  assert.ok(light.includes("引导：少直给"));
});

test("buildTaskDramaPacket no longer leaks raw numeric revealValue as writing guidance", () => {
  const t: GameTaskV2 = { ...baseTask, revealValue: 0.42 };
  const packet = buildTaskDramaPacket({ tasks: [t] });
  assert.equal(packet.includes("过程揭露权重"), false);
});

test("buildTaskDramaPacket ends with an anti-parrot / voice-differentiation reminder", () => {
  const packet = buildTaskDramaPacket({ tasks: [baseTask] });
  assert.ok(packet.includes("语气必须彼此区分"));
});

test("buildTaskDramaPacket respects the maxChars budget", () => {
  const long: GameTaskV2 = {
    ...baseTask,
    issuerIntent: "动".repeat(200),
    playerHook: "钩".repeat(200),
    urgencyReason: "急".repeat(200),
  };
  const packet = buildTaskDramaPacket({ tasks: [long], maxChars: 200 });
  assert.ok(packet.length <= 200);
});

test("buildTaskDramaPacket returns empty string when there is nothing pickable", () => {
  assert.equal(buildTaskDramaPacket({ tasks: [] }), "");
  assert.equal(buildTaskDramaPacket({ tasks: [baseTask], maxTasks: 0 }), "");
});
