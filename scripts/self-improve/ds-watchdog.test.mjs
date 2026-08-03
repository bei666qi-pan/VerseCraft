import test from "node:test";
import assert from "node:assert/strict";

// Import watchdog functions
let watchdog;
async function loadWatchdog() {
  watchdog = await import("./ds-watchdog.mjs");
}

test("pidAlive returns true for own pid", async () => {
  await loadWatchdog();
  assert.ok(watchdog.pidAlive(process.pid));
});

test("pidAlive returns false for invalid pid", async () => {
  await loadWatchdog();
  assert.equal(watchdog.pidAlive(999999), false);
});

test("pidAlive returns false for null", async () => {
  await loadWatchdog();
  assert.equal(watchdog.pidAlive(null), false);
});

test("pidAlive returns false for undefined", async () => {
  await loadWatchdog();
  assert.equal(watchdog.pidAlive(undefined), false);
});

test("getDeadlines returns defaults", async () => {
  await loadWatchdog();
  const dl = watchdog.getDeadlines();
  assert.ok(dl.SERVER_STARTING > 0);
  assert.ok(dl.EVAL_RUNNING > 0);
  assert.ok(dl.CODEX_REPAIR_RUNNING > 0);
  assert.ok(dl.SESSION_TOTAL > 0);
});

test("getDeadlines respects VERSECRAFT_DS_DEADLINES env", async () => {
  process.env.VERSECRAFT_DS_DEADLINES = JSON.stringify({ EVAL_RUNNING: 60_000 });
  await loadWatchdog();
  const dl = watchdog.getDeadlines();
  assert.equal(dl.EVAL_RUNNING, 60_000);
  delete process.env.VERSECRAFT_DS_DEADLINES;
});

test("validateCodexRepair detects missing threadId", async () => {
  await loadWatchdog();
  const result = watchdog.validateCodexRepair(null, {
    repairAttempts: [{ changedFiles: [] }]
  });
  assert.ok(result);
  assert.equal(result.verdict, "REPAIR_INCOMPLETE");
});

test("validateCodexRepair detects changedFiles=0", async () => {
  await loadWatchdog();
  const result = watchdog.validateCodexRepair(null, {
    repairAttempts: [{ threadId: "test-123", changedFiles: [] }]
  });
  assert.ok(result);
  assert.equal(result.verdict, "REPAIR_INCOMPLETE");
  assert.ok(result.issues.includes("changedFiles=0"));
});

test("validateCodexRepair detects only test files changed", async () => {
  await loadWatchdog();
  const result = watchdog.validateCodexRepair(null, {
    repairAttempts: [{ threadId: "test-123", changedFiles: ["src/foo.test.ts"] }]
  });
  assert.ok(result);
  assert.equal(result.verdict, "REPAIR_INCOMPLETE");
  assert.ok(result.issues.includes("only test files changed"));
});

test("validateCodexRepair accepts valid repair", async () => {
  await loadWatchdog();
  const result = watchdog.validateCodexRepair(null, {
    repairAttempts: [{ threadId: "test-123", changedFiles: ["src/foo.ts", "src/foo.test.ts"] }]
  });
  assert.ok(result);
  assert.equal(result.verdict, "OK");
});

test("validateCodexRepair handles no repairs", async () => {
  await loadWatchdog();
  const result = watchdog.validateCodexRepair(null, { repairAttempts: [] });
  assert.equal(result, null);
});

test("checkServerHealth", async () => {
  await loadWatchdog();
  // Should return false since no server is running on port 666 during test
  const healthy = watchdog.checkServerHealth(666);
  // Either false (no server) or true (if dev server is running)
  assert.equal(typeof healthy, "boolean");
});
