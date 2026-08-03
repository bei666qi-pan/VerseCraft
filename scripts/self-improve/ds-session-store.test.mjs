import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TEST_HOME = join(homedir(), ".versecraft-ds-test");

// Import once, reuse across tests
let store;

// Before all tests
async function setup() {
  // Clean and set test home
  if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true, force: true });
  mkdirSync(TEST_HOME, { recursive: true });
  process.env.VERSECRAFT_DS_HOME = TEST_HOME;

  store = await import("./ds-session-store.mjs");
}

function cleanup() {
  delete process.env.VERSECRAFT_DS_HOME;
  try { if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}
}

test("createSession creates session with valid fields", async () => {
  await setup();
  const session = store.createSession();
  assert.ok(session.sessionId.startsWith("session-"));
  assert.equal(session.state, "STARTING");
  assert.ok(session.startedAt);
  assert.equal(session.cycle, 0);
  assert.equal(session.recoveryAttempts, 0);
  const statePath = join(store.SESSIONS_DIR, session.sessionId, "state.json");
  assert.ok(existsSync(statePath));
  cleanup();
});

test("getActiveSession returns session after createSession", async () => {
  await setup();
  store.createSession();
  const active = store.getActiveSession();
  assert.ok(active);
  assert.equal(active.state, "STARTING");
  cleanup();
});

test("getSession retrieves saved session", async () => {
  await setup();
  const created = store.createSession();
  const retrieved = store.getSession(created.sessionId);
  assert.equal(retrieved.sessionId, created.sessionId);
  cleanup();
});

test("updateSession modifies fields", async () => {
  await setup();
  const s = store.createSession();
  const updated = store.updateSession(s.sessionId, {
    state: "RUNNING",
    phase: "EVAL_RUNNING",
    supervisorPid: 12345,
  });
  assert.equal(updated.state, "RUNNING");
  assert.equal(updated.phase, "EVAL_RUNNING");
  assert.equal(updated.supervisorPid, 12345);
  const reloaded = store.getSession(s.sessionId);
  assert.equal(reloaded.state, "RUNNING");
  cleanup();
});

test("listSessions returns all sorted by time", async () => {
  await setup();
  store.createSession();
  await new Promise(r => setTimeout(r, 10));
  store.createSession();
  const list = store.listSessions();
  assert.ok(list.length >= 2);
  cleanup();
});

test("acquireLock prevents duplicate locks", async () => {
  await setup();
  assert.ok(store.acquireLock());
  assert.equal(store.acquireLock(), false);
  store.releaseLock();
  cleanup();
});

test("releaseLock allows re-acquire", async () => {
  await setup();
  store.acquireLock();
  store.releaseLock();
  assert.ok(store.acquireLock());
  store.releaseLock();
  cleanup();
});

test("deactivateSession clears active marker", async () => {
  await setup();
  const s = store.createSession();
  store.deactivateSession(s.sessionId);
  assert.equal(store.getActiveSession(), null);
  cleanup();
});

test("collectDiagnostics returns system info", async () => {
  await setup();
  const diag = store.collectDiagnostics();
  assert.ok(diag.timestamp);
  assert.ok(diag.nodeVersion);
  assert.ok(typeof diag.sessionsCount === "number");
  cleanup();
});

test("getLatestStoppableSession finds RUNNING", async () => {
  await setup();
  const s = store.createSession();
  store.updateSession(s.sessionId, { state: "RUNNING" });
  const stoppable = store.getLatestStoppableSession();
  assert.ok(stoppable);
  assert.equal(stoppable.sessionId, s.sessionId);
  cleanup();
});

test("getLatestResumableSession finds STOPPED", async () => {
  await setup();
  const s = store.createSession();
  store.updateSession(s.sessionId, { state: "STOPPED" });
  const resumable = store.getLatestResumableSession();
  assert.ok(resumable);
  assert.equal(resumable.sessionId, s.sessionId);
  cleanup();
});

test("secret values are never in session store", async () => {
  await setup();
  const s = store.createSession();
  const str = JSON.stringify(s);
  assert.ok(!str.includes("sk-"));
  assert.ok(!str.includes("Bearer"));
  assert.ok(!str.includes("Authorization"));
  cleanup();
});
