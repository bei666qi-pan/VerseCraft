import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGameTaskDraft } from "./taskV2";
import { deriveTaskConsequences } from "./taskConsequences";

test("task consequences: completed task writes relation patch + memory residue", () => {
  const base = normalizeGameTaskDraft({
    id: "t1",
    title: "交付测试",
    issuerId: "N-018",
    issuerName: "北夏",
    status: "active",
    residueOnComplete: "他记下了这次人情。",
    dramaticType: "debt_payment",
    relatedNpcIds: ["N-018"],
    relatedLocationIds: ["6F_Stairwell"],
  });
  assert.ok(base);
  const after = { ...base!, status: "completed" as const };
  const out = deriveTaskConsequences({
    beforeTasks: [base!],
    afterTasks: [after],
    taskUpdates: [{ id: "t1", status: "completed" }],
    nowHour: 24,
    playerLocation: "6F_Stairwell",
  });
  assert.ok(out.relationshipPatches.some((p) => p.npcId === "N-018"));
  assert.ok(out.memoryCandidates.length >= 1);
  assert.ok(out.memoryCandidates[0]!.mergeKey.includes("task:t1"));
});

test("task consequences: failed task increases debt/fear and creates promise memory", () => {
  const base = normalizeGameTaskDraft({
    id: "t2",
    title: "隐瞒测试",
    issuerId: "N-020",
    issuerName: "灵伤",
    status: "active",
    residueOnFail: "她会把你的犹豫记成一笔账。",
    dramaticType: "coverup",
    canBackfire: true,
    backfireConsequences: ["rel:N-010:trust:-2"],
  });
  assert.ok(base);
  const after = { ...base!, status: "failed" as const };
  const out = deriveTaskConsequences({
    beforeTasks: [base!],
    afterTasks: [after],
    taskUpdates: [{ id: "t2", status: "failed" }],
    nowHour: 30,
    playerLocation: "1F_Lobby",
  });
  assert.ok(out.relationshipPatches.some((p) => p.npcId === "N-020"));
  assert.ok(out.relationshipPatches.some((p) => p.npcId === "N-010"));
  assert.ok(out.memoryCandidates.some((m) => m.kind === "promise" || m.kind === "task_residue"));
});

