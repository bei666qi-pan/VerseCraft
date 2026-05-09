import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCodexMentionsFromDmRecord,
  extractCodexMentionsFromNarrative,
  mergeAutoCapturedCodexUpdates,
} from "./codexAutoCapture";

test("codex auto capture recognizes registered NPC and anomaly mentions", () => {
  const mentions = extractCodexMentionsFromNarrative(
    "电工老刘在配电间压低声音，提醒你无头猎犬已经经过走廊。",
    { maxMatches: 10 }
  );

  assert.ok(mentions.some((entry) => entry.id === "N-008" && entry.type === "npc"));
  assert.ok(mentions.some((entry) => entry.id === "A-002" && entry.type === "anomaly"));
});

test("codex auto capture recognizes direct registry ids", () => {
  const mentions = extractCodexMentionsFromNarrative("你在墙角看到了 A-008 的残影，以及 N-010 留下的纸条。");

  assert.ok(mentions.some((entry) => entry.id === "A-008" && entry.type === "anomaly"));
  assert.ok(mentions.some((entry) => entry.id === "N-010" && entry.type === "npc"));
});

test("codex auto capture recognizes safe NPC aliases", () => {
  const mentions = extractCodexMentionsFromNarrative("老刘在配电间骂了一句，阿花的毽子声却从楼梯间传来。");

  assert.ok(mentions.some((entry) => entry.id === "N-008" && entry.name === "电工老刘"));
  assert.ok(mentions.some((entry) => entry.id === "N-004" && entry.name === "小女孩阿花"));
});

test("codex auto capture ignores unregistered invented names", () => {
  const mentions = extractCodexMentionsFromNarrative("赵无名站在门口，自称是这层楼的新住户。");

  assert.deepEqual(mentions, []);
});

test("codex auto capture promotes registered NPC location updates when codex updates are missing", () => {
  const mentions = extractCodexMentionsFromDmRecord({
    narrative: "走廊的灯短了一下。",
    codex_updates: [],
    npc_location_updates: [{ id: "N-008", to_location: "B1_Storage" }],
  });

  assert.deepEqual(mentions, [{ id: "N-008", name: "电工老刘", type: "npc" }]);
});

test("mergeAutoCapturedCodexUpdates appends only missing registered entries", () => {
  const merged = mergeAutoCapturedCodexUpdates({
    narrative: "张先生把报纸折好，老刘没有接话。",
    codex_updates: [{ id: "N-006", name: "退休教师张先生", type: "npc" }],
    npc_location_updates: [{ id: "N-008", to_location: "B1_Storage" }],
  });

  assert.equal(Array.isArray(merged.codex_updates), true);
  assert.equal((merged.codex_updates as unknown[]).length, 2);
  assert.ok((merged.codex_updates as Array<{ id?: string }>).some((entry) => entry.id === "N-008"));
});
