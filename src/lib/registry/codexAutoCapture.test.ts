import assert from "node:assert/strict";
import test from "node:test";
import { extractCodexMentionsFromNarrative } from "./codexAutoCapture";

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
