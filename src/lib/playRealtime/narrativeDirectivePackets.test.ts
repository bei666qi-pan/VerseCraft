import test from "node:test";
import assert from "node:assert/strict";
import { buildNarrativeDirectiveBlock } from "./narrativeDirectivePackets";

test("directive: empty when no params", () => {
  const result = buildNarrativeDirectiveBlock({ lane: "FAST", beatState: null });
  assert.equal(result, "");
});

test("directive: beat directive included", () => {
  const result = buildNarrativeDirectiveBlock({ lane: "FAST", beatState: "peak" });
  assert.ok(result.includes("节奏指令"));
  assert.ok(result.includes("危机高潮"));
});

test("directive: register directive for repeated levity", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: null,
    recentRegisters: ["levity", "levity"],
  });
  assert.ok(result.includes("切换到悬疑推进"));
});

test("directive: talkable NPC with names", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: null,
    talkableNpcCount: 2,
    talkableNpcNames: ["老刘", "红姨"],
  });
  assert.ok(result.includes("老刘、红姨在场"));
  assert.ok(result.includes("安排一句对白"));
  assert.ok(result.includes("落地到具体动作"));
});

test("directive: talkable NPC without names", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: null,
    talkableNpcCount: 3,
  });
  assert.ok(result.includes("3 名可对话 NPC 在场"));
  assert.ok(result.includes("安排一句对白"));
});

test("directive: no dialogue directive when count is 0", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: null,
    talkableNpcCount: 0,
  });
  assert.equal(result, "");
});

test("directive: combined beat + dialogue", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: "setup",
    talkableNpcCount: 1,
    talkableNpcNames: ["欣蓝"],
  });
  assert.ok(result.includes("铺垫阶段"));
  assert.ok(result.includes("欣蓝在场"));
  assert.ok(result.includes("；")); // separated by semicolon
});

test("directive: talkableNpcNames capped at 2", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: null,
    talkableNpcCount: 5,
    talkableNpcNames: ["A", "B", "C"],
  });
  assert.ok(result.includes("A、B在场"));
  assert.ok(!result.includes("C"));
});

test("directive: due foreshadow included", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: null,
    dueForeshadow: [
      { id: 1, seedText: "走廊尽头有声响", source: "dm", plantedTurn: 10, status: "planted", deadlineTurn: 18, importance: 2, payoffTurn: null },
    ],
  });
  assert.ok(result.includes("如剧情自然"));
  assert.ok(result.includes("走廊尽头有声响"));
});

test("directive: no foreshadow when empty", () => {
  const result = buildNarrativeDirectiveBlock({
    lane: "FAST",
    beatState: null,
    dueForeshadow: [],
  });
  assert.equal(result, "");
});
