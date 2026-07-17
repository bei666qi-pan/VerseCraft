import test from "node:test";
import assert from "node:assert/strict";
import { applyInternalIdNarrativeGuard } from "./internalIdNarrativeGuard";

test("maps known internal task id to a player-facing label", () => {
  const out = applyInternalIdNarrativeGuard({ narrative: "{prof_trial_lampkeeper}这个任务还挂在那里。" });
  assert.equal(out.narrative, "守灯人试炼这个任务还挂在那里。");
  assert.ok((out._commit_flags as string[]).includes("internal_id_prose_replaced_v1"));
});

test("maps known bare task id without braces", () => {
  assert.equal(applyInternalIdNarrativeGuard({ narrative: "那条prof_trial_lampkeeper任务仍未完成。" }).narrative, "那条守灯人试炼任务仍未完成。");
});

test("replaces unknown braced internal ids conservatively", () => {
  assert.equal(applyInternalIdNarrativeGuard({ narrative: "检查{task_unknown_alpha}。" }).narrative, "检查当前任务。");
});

test("keeps ordinary prose", () => {
  const input = { narrative: "我检查守灯人试炼。" };
  assert.deepEqual(applyInternalIdNarrativeGuard(input), input);
});
