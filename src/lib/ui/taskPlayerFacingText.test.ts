import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePlayerFacingInline, buildTaskAtAGlanceLine, inferTaskCardCopyKind } from "./taskPlayerFacingText";

test("sanitizePlayerFacingInline 不暴露 registry id", () => {
  const s = sanitizePlayerFacingInline("去找 N-008 以及 A-003。", {});
  assert.ok(!/\bN-\d{3}\b/i.test(s));
  assert.ok(!/\bA-\d{3}\b/i.test(s));
});

test("三层文案前缀差异明显：formal/promise/clue", () => {
  const formal = { id: "t1", title: "x", desc: "d", nextHint: "去问清楚门槛", taskNarrativeLayer: "formal_task" } as any;
  const promise = { id: "t2", title: "x", desc: "d", nextHint: "别让对方等太久", taskNarrativeLayer: "conversation_promise" } as any;
  const clue = { id: "t3", title: "x", desc: "d", nextHint: "墙角有字", taskNarrativeLayer: "soft_lead" } as any;
  assert.equal(inferTaskCardCopyKind(formal), "formal");
  assert.equal(inferTaskCardCopyKind(promise), "promise");
  assert.equal(inferTaskCardCopyKind(clue), "clue");
  assert.ok(buildTaskAtAGlanceLine(formal, {}).startsWith("推进要点："));
  assert.ok(buildTaskAtAGlanceLine(promise, {}).startsWith("承诺："));
  assert.ok(buildTaskAtAGlanceLine(clue, {}).startsWith("线索："));
});

