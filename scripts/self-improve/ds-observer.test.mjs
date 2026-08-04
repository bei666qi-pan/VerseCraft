import test from "node:test";
import assert from "node:assert/strict";

let observer;
async function loadObserver() {
  observer = await import("./ds-observer.mjs");
}

test("observer decide: WAIT for short stall", async () => {
  await loadObserver();
  const result = observer.decide(
    { phase: "EVAL_RUNNING", stallMs: 60_000 },
    null, [], [], []
  );
  assert.equal(result.decision, "WAIT");
});

test("observer decide: RESTART_SERVER for SERVER_STARTING timeout", async () => {
  await loadObserver();
  const result = observer.decide(
    { phase: "SERVER_STARTING", stallMs: 5 * 60_000 },
    null, [], [], []
  );
  assert.equal(result.decision, "RESTART_SERVER");
});

test("observer decide: STOP_INFRA_BLOCKED with persistent site_fallback", async () => {
  await loadObserver();
  const lastErrors = Array(10).fill("site_fallback error server_internal_generation_failed");
  const result = observer.decide(
    { phase: "EVAL_RUNNING", stallMs: 31 * 60_000 },
    null, [], [], lastErrors
  );
  assert.equal(result.decision, "STOP_INFRA_BLOCKED");
});

test("observer decide: RESTART_SUPERVISOR for stuck eval", async () => {
  await loadObserver();
  const result = observer.decide(
    { phase: "EVAL_RUNNING", stallMs: 31 * 60_000 },
    null, [], [], ["normal log line"]
  );
  assert.equal(result.decision, "RESTART_SUPERVISOR");
});

test("observer decide: STOP_REPAIR_EXHAUSTED with 3 failed repairs", async () => {
  await loadObserver();
  const state = {
    repairAttempts: [
      { success: false, changedFiles: [] },
      { success: false, changedFiles: [] },
      { success: false, changedFiles: [] },
    ]
  };
  const result = observer.decide(
    { phase: "CODEX_REPAIR_RUNNING", stallMs: 60_000 },
    state, [], [], []
  );
  assert.equal(result.decision, "STOP_REPAIR_EXHAUSTED");
});

test("observer decide: MANUAL_REVIEW with repeated same-phase recovery", async () => {
  await loadObserver();
  const recoveryHistory = [
    { type: "RECOVERY_START", phase: "EVAL_RUNNING", level: 1 },
    { type: "RECOVERY_START", phase: "EVAL_RUNNING", level: 2 },
  ];
  const result = observer.decide(
    { phase: "EVAL_RUNNING", stallMs: 31 * 60_000 },
    null, ["node supervise.ts"], recoveryHistory, []
  );
  assert.equal(result.decision, "MANUAL_REVIEW_REQUIRED");
});

test("observer decide: RESTART_SUPERVISOR when process missing", async () => {
  await loadObserver();
  const state = { phase: "EVAL_RUNNING" };
  const result = observer.decide(
    { phase: "EVAL_RUNNING", stallMs: 60_000 },
    state, [], [], []
  );
  assert.equal(result.decision, "RESTART_SUPERVISOR");
});

test("observer getInput reads env vars", async () => {
  await loadObserver();
  process.env.OBSERVER_SESSION_ID = "test-sid";
  process.env.OBSERVER_WORKTREE = "/tmp/test";
  process.env.OBSERVER_PHASE = "EVAL_RUNNING";
  process.env.OBSERVER_STALL_MS = "300000";

  const input = observer.getInput();
  assert.equal(input.sessionId, "test-sid");
  assert.equal(input.worktree, "/tmp/test");
  assert.equal(input.phase, "EVAL_RUNNING");
  assert.equal(input.stallMs, 300000);

  delete process.env.OBSERVER_SESSION_ID;
  delete process.env.OBSERVER_WORKTREE;
  delete process.env.OBSERVER_PHASE;
  delete process.env.OBSERVER_STALL_MS;
});

test("observer output includes all required fields", async () => {
  await loadObserver();
  process.env.OBSERVER_PHASE = "EVAL_RUNNING";
  process.env.OBSERVER_STALL_MS = "10000";

  const output = observer.runObserver();
  assert.ok(output.observerVersion);
  assert.ok(output.timestamp);
  assert.ok(output.input);
  assert.ok(output.observation);
  assert.ok(output.decision);
  assert.ok(output.decision.decision);
  assert.ok(output.nextSteps);

  delete process.env.OBSERVER_PHASE;
  delete process.env.OBSERVER_STALL_MS;
});

test("observer decision has valid enum values", async () => {
  await loadObserver();
  const validDecisions = [
    "WAIT", "RESTART_SERVER", "RESTART_SUPERVISOR", "RESUME_CAMPAIGN",
    "STOP_INFRA_BLOCKED", "STOP_REPAIR_EXHAUSTED", "MANUAL_REVIEW_REQUIRED"
  ];

  // Test each phase with various inputs
  for (const phase of ["SERVER_STARTING", "EVAL_RUNNING", "CODEX_REPAIR_RUNNING"]) {
    process.env.OBSERVER_PHASE = phase;
    process.env.OBSERVER_STALL_MS = "5000";
    const output = observer.runObserver();
    assert.ok(validDecisions.includes(output.decision.decision),
      `Decision ${output.decision.decision} should be in valid enum for phase ${phase}`);
  }

  delete process.env.OBSERVER_PHASE;
  delete process.env.OBSERVER_STALL_MS;
});
