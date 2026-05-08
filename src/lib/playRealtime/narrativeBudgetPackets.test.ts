import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNarrativeBudgetPacketBlock,
  resolveNarrativeBudget,
  type NarrativeBudget,
  type ResolveNarrativeBudgetArgs,
} from "@/lib/playRealtime/narrativeBudgetPackets";

test("simple action resolves to short budget", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我推开门",
    riskLane: "fast",
  });

  assert.equal(budget.tier, "short");
  assert.equal(budget.minChars, 160);
  assert.equal(budget.maxChars, 260);
  assert.equal(budget.reasonCodes.includes("simple_action"), true);
});

test("regular exploration resolves to standard budget", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我沿着走廊继续探索，仔细观察墙面和门牌的变化",
    currentLocation: "B1走廊",
    riskLane: "fast",
  });

  assert.equal(budget.tier, "standard");
  assert.equal(budget.minInfoBeats, 4);
  assert.equal(budget.reasonCodes.includes("explore"), true);
});

test("important NPC dialogue resolves to reveal budget", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我低声问欣蓝，她是不是一直记得循环的真相",
    presentNpcIds: ["xinlan"],
    playerContext: { relationship: "信任正在变化" },
    riskLane: "fast",
  });

  assert.equal(budget.tier, "reveal");
  assert.equal(budget.reasonCodes.includes("important_npc"), true);
  assert.equal(budget.reasonCodes.includes("relationship_shift"), true);
});

test("high value clue resolves to reveal budget", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我翻开档案袋，寻找关于暗月和七锚的关键线索",
    clientState: { activeTask: "确认校源异常" },
    riskLane: "fast",
  });

  assert.equal(budget.tier, "reveal");
  assert.equal(budget.reasonCodes.includes("high_value_clue"), true);
});

test("danger stop and key choice resolve to micro budget", () => {
  const budget = resolveNarrativeBudget({
    plannedTurnMode: "decision_required",
    latestUserInput: "我停住脚步，门后传来倒计时，必须立刻选择救谁",
    recentNarrativeTail: "影子已经追上来了。",
    riskLane: "slow",
  });

  assert.equal(budget.tier, "micro");
  assert.equal(budget.maxChars, 160);
  assert.equal(budget.reasonCodes.includes("danger_stop"), true);
  assert.equal(budget.reasonCodes.includes("key_choice"), true);
  assert.equal(budget.reasonCodes.includes("slow_lane"), true);
});

test("chapter climax resolves to climax budget", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我冲向大厅中央，准备打断仪式",
    isChapterClimax: true,
    riskLane: "slow",
  });

  assert.equal(budget.tier, "climax");
  assert.equal(budget.minChars, 700);
  assert.equal(budget.maxChars, 1100);
  assert.equal(budget.reasonCodes.includes("chapter_climax"), true);
});

test("endgame resolves to ending budget", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我接受最后的代价，走向结局",
    isEndgame: true,
    riskLane: "fast",
  });

  assert.equal(budget.tier, "ending");
  assert.equal(budget.minChars >= 600, true);
  assert.equal(budget.maxChars <= 1400, true);
  assert.equal(budget.reasonCodes.includes("ending"), true);
});

test("chapter caps are included in budget packet and clamp remaining hard chars", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我继续推进本章线索",
    riskLane: "fast",
    chapter: {
      chapterId: "chapter-1",
      narrativeCharCount: 2140,
      targetTextChars: [900, 1800],
      hardTextChars: 2200,
    },
  });

  assert.equal(budget.chapter?.id, "chapter-1");
  assert.equal(budget.chapter?.remainingHardChars, 60);
  assert.equal(budget.chapter?.shouldClose, true);
  assert.equal(budget.maxChars <= 60, true);
  assert.equal(budget.reasonCodes.includes("chapter_close_due"), true);
});

test("ending chapter hard cap is 5000", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我走向最后的选择",
    isEndgame: true,
    chapter: {
      chapterId: "ending",
      narrativeCharCount: 3900,
      targetTextChars: [2200, 4000],
      hardTextChars: 5000,
    },
  });

  assert.equal(budget.tier, "ending");
  assert.equal(budget.chapter?.hardMaxChars, 5000);
  assert.equal(budget.chapter?.targetMaxChars, 4000);
  assert.equal(budget.chapter?.shouldClose, false);
});

test("buildNarrativeBudgetPacketBlock emits parseable compact JSON", () => {
  const budget = resolveNarrativeBudget({
    latestUserInput: "我沿着走廊继续探索，仔细观察墙面和门牌的变化",
    riskLane: "fast",
  });
  const packet = buildNarrativeBudgetPacketBlock(budget);
  const [heading, jsonLine] = packet.split("\n");
  const parsed = JSON.parse(jsonLine) as NarrativeBudget;

  assert.equal(heading, "## 【narrative_budget_packet】");
  assert.equal(parsed.schema, "narrative_budget_v1");
  assert.equal(parsed.tier, "standard");
  assert.equal(packet.split("\n").length, 2);
});

test("packet builder clamps malformed numeric budget values", () => {
  const packet = buildNarrativeBudgetPacketBlock({
    schema: "narrative_budget_v1",
    tier: "standard",
    minChars: -100,
    targetChars: 9999,
    maxChars: 9999,
    minInfoBeats: 99,
    mustInclude: [],
    stopRule: "",
    reasonCodes: ["bad code", "custom_ok"],
  });
  const parsed = JSON.parse(packet.split("\n")[1]) as NarrativeBudget;

  assert.equal(parsed.minChars >= 220, true);
  assert.equal(parsed.targetChars >= parsed.minChars, true);
  assert.equal(parsed.maxChars <= 650, true);
  assert.equal(parsed.targetChars <= parsed.maxChars, true);
  assert.equal(parsed.minInfoBeats, 8);
  assert.deepEqual(parsed.reasonCodes, ["custom_ok"]);
});

test("reasonCodes are stable short telemetry codes", () => {
  const args = {
    latestUserInput: "我翻开档案袋，寻找关于暗月和七锚的关键线索",
    clientState: { activeTask: "确认校源异常" },
    riskLane: "fast",
  };
  const first = resolveNarrativeBudget(args);
  const second = resolveNarrativeBudget(args);

  assert.deepEqual(first.reasonCodes, second.reasonCodes);
  assert.equal(first.reasonCodes.every((code) => /^[a-z][a-z0-9_]{1,40}$/.test(code)), true);
});

const goldenCases: Array<{
  name: string;
  args: ResolveNarrativeBudgetArgs;
  tier: NarrativeBudget["tier"];
}> = [
  {
    name: "simple action",
    args: { latestUserInput: "我推开门", riskLane: "fast" },
    tier: "short",
  },
  {
    name: "regular exploration",
    args: {
      latestUserInput: "我沿着走廊继续探索，仔细观察墙面和门牌的变化",
      riskLane: "fast",
    },
    tier: "standard",
  },
  {
    name: "important NPC dialogue",
    args: {
      latestUserInput: "我低声问欣蓝，她是不是一直记得循环的真相",
      presentNpcIds: ["xinlan"],
      playerContext: { relationship: "信任正在变化" },
      riskLane: "fast",
    },
    tier: "reveal",
  },
  {
    name: "high value clue",
    args: {
      latestUserInput: "我翻开档案袋，寻找关于暗月和七锚的关键线索",
      clientState: { activeTask: "确认校源异常" },
      riskLane: "fast",
    },
    tier: "reveal",
  },
  {
    name: "danger choice",
    args: {
      plannedTurnMode: "decision_required",
      latestUserInput: "我停住脚步，门后传来倒计时，必须立刻选择救谁",
      recentNarrativeTail: "影子已经追上来了。",
      riskLane: "slow",
    },
    tier: "micro",
  },
  {
    name: "chapter climax",
    args: { latestUserInput: "我冲向大厅中央，准备打断仪式", isChapterClimax: true },
    tier: "climax",
  },
  {
    name: "ending",
    args: { latestUserInput: "我接受最后的代价，走向结局", isEndgame: true },
    tier: "ending",
  },
];

for (const c of goldenCases) {
  test(`golden narrative budget case: ${c.name}`, () => {
    const budget = resolveNarrativeBudget(c.args);
    const packet = buildNarrativeBudgetPacketBlock(budget);
    const parsed = JSON.parse(packet.split("\n")[1]) as NarrativeBudget;

    assert.equal(budget.tier, c.tier);
    assert.equal(parsed.tier, c.tier);
    assert.equal(budget.minChars <= budget.targetChars, true);
    assert.equal(budget.targetChars <= budget.maxChars, true);
    assert.equal(budget.maxChars <= 1400, true);
    assert.equal(budget.reasonCodes.every((code) => /^[a-z][a-z0-9_]{1,40}$/.test(code)), true);
  });
}
