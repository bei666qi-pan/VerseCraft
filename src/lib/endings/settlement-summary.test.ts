/**
 * settlement-summary.test.ts — Phase 7a settlement task completion score unit tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeTaskCompletionScore } from "./summary";

describe("computeTaskCompletionScore", () => {
  it("empty tasks → zero score", () => {
    const r = computeTaskCompletionScore([]);
    assert.equal(r.taskCompletionScore, 0);
    assert.equal(r.completedTasks, 0);
    assert.equal(r.totalFormalTasks, 0);
  });

  it("all completed → score 1.0", () => {
    const r = computeTaskCompletionScore([
      { id: "a", status: "completed", title: "done" },
      { id: "b", status: "completed", title: "done2" },
    ]);
    assert.equal(r.taskCompletionScore, 1.0);
    assert.equal(r.completedTasks, 2);
    assert.equal(r.totalFormalTasks, 2);
  });

  it("mixed: completed + active → 0.5", () => {
    const r = computeTaskCompletionScore([
      { id: "a", status: "completed" },
      { id: "b", status: "active" },
    ]);
    assert.equal(r.taskCompletionScore, 0.5);
    assert.equal(r.completedTasks, 1);
    assert.equal(r.totalFormalTasks, 2);
  });

  it("hidden tasks excluded from total", () => {
    const r = computeTaskCompletionScore([
      { id: "a", status: "completed" },
      { id: "b", status: "hidden" },
      { id: "c", status: "hidden" },
    ]);
    assert.equal(r.taskCompletionScore, 1.0);
    assert.equal(r.completedTasks, 1);
    assert.equal(r.totalFormalTasks, 1);
  });

  it("all hidden → zero score", () => {
    const r = computeTaskCompletionScore([
      { id: "x", status: "hidden" },
      { id: "y", status: "hidden" },
    ]);
    assert.equal(r.taskCompletionScore, 0);
    assert.equal(r.completedTasks, 0);
    assert.equal(r.totalFormalTasks, 0);
  });

  it("failed tasks count toward total", () => {
    const r = computeTaskCompletionScore([
      { id: "a", status: "completed" },
      { id: "b", status: "failed" },
      { id: "c", status: "active" },
    ]);
    assert.equal(r.taskCompletionScore, 0.33);
    assert.equal(r.completedTasks, 1);
    assert.equal(r.totalFormalTasks, 3);
  });

  it("malformed entries (no status) silently skipped", () => {
    const r = computeTaskCompletionScore([
      { id: "a", status: "completed" },
      { notask: true },
      null,
      "string entry",
    ]);
    assert.equal(r.taskCompletionScore, 1.0);
    assert.equal(r.completedTasks, 1);
    assert.equal(r.totalFormalTasks, 1);
  });

  it("large realistic mix", () => {
    const tasks = [];
    for (let i = 0; i < 12; i++) {
      tasks.push({ id: `t${i}`, status: i < 7 ? "completed" : "active" });
    }
    tasks.push({ id: "hidden_1", status: "hidden" });
    const r = computeTaskCompletionScore(tasks);
    assert.equal(r.taskCompletionScore, Math.round(7 / 12 * 100) / 100);
    assert.equal(r.completedTasks, 7);
    assert.equal(r.totalFormalTasks, 12);
  });
});
