#!/usr/bin/env node
/**
 * Deterministic Session Store for verse -ds CLI.
 *
 * All mutable global state lives under ~/.versecraft/ds/
 * Never writes into the git-tracked working tree.
 *
 * Override root via VERSECRAFT_DS_HOME env for testing.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, appendFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";

// ── Paths ──────────────────────────────────────────────

const HOME = process.env.VERSECRAFT_DS_HOME || homedir();
const DS_ROOT = resolve(HOME, ".versecraft", "ds");
const ACTIVE_SESSION_FILE = join(DS_ROOT, "active-session.json");
const SESSIONS_DIR = join(DS_ROOT, "sessions");
const LOCK_FILE = join(DS_ROOT, "daemon.lock");

// ── Helpers ────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function writeJson(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── Lock ───────────────────────────────────────────────

function acquireLock() {
  ensureDir(DS_ROOT);
  if (existsSync(LOCK_FILE)) {
    try {
      const lock = readJson(LOCK_FILE);
      if (lock && lock.pid) {
        try { process.kill(lock.pid, 0); return false; } catch { /* stale */ }
      }
    } catch { /* corrupt lock */ }
  }
  writeJson(LOCK_FILE, { pid: process.pid, acquiredAt: new Date().toISOString() });
  return true;
}

function releaseLock() {
  try {
    const lock = readJson(LOCK_FILE);
    if (lock && lock.pid === process.pid) {
      try { unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function isLockHeld() {
  const lock = readJson(LOCK_FILE);
  if (!lock || !lock.pid) return false;
  try { process.kill(lock.pid, 0); return true; } catch { return false; }
}

// ── Session CRUD ───────────────────────────────────────

function createSession(overrides = {}) {
  ensureDir(SESSIONS_DIR);
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const sessionDir = join(SESSIONS_DIR, sessionId);
  ensureDir(sessionDir);

  const session = {
    sessionId,
    state: "STARTING",
    campaignId: null,
    branch: null,
    worktree: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    supervisorPid: null,
    serverPid: null,
    daemonPid: process.pid,
    cycle: 0,
    phase: null,
    recoveryAttempts: 0,
    finalStatus: null,
    exitCode: null,
    repairThreadIds: [],
    ...overrides,
  };

  writeJson(join(sessionDir, "state.json"), session);
  writeJson(join(sessionDir, "events.jsonl"), "");

  writeJson(ACTIVE_SESSION_FILE, { sessionId, updatedAt: new Date().toISOString() });

  return session;
}

function getActiveSessionId() {
  const active = readJson(ACTIVE_SESSION_FILE);
  return active ? active.sessionId : null;
}

function getActiveSession() {
  const sid = getActiveSessionId();
  if (!sid) return null;
  return getSession(sid);
}

function getSession(sessionId) {
  const path = join(SESSIONS_DIR, sessionId, "state.json");
  return readJson(path);
}

function saveSession(session) {
  const dir = join(SESSIONS_DIR, session.sessionId);
  ensureDir(dir);
  writeJson(join(dir, "state.json"), session);
  if (getActiveSessionId() === session.sessionId) {
    writeJson(ACTIVE_SESSION_FILE, { sessionId: session.sessionId, updatedAt: new Date().toISOString() });
  }
}

function appendEvent(sessionId, event) {
  const dir = join(SESSIONS_DIR, sessionId);
  ensureDir(dir);
  const line = JSON.stringify({ ...event, ts: new Date().toISOString() }) + "\n";
  try { appendFileSync(join(dir, "events.jsonl"), line, "utf-8"); } catch { /* ignore */ }
}

function listSessions() {
  ensureDir(SESSIONS_DIR);
  try {
    return readdirSync(SESSIONS_DIR)
      .filter(d => statSync(join(SESSIONS_DIR, d)).isDirectory())
      .map(d => readJson(join(SESSIONS_DIR, d, "state.json")))
      .filter(Boolean)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch { return []; }
}

function getLatestStoppableSession() {
  const sessions = listSessions();
  return sessions.find(s => s.state === "RUNNING" || s.state === "STARTING") || null;
}

function getLatestResumableSession() {
  const sessions = listSessions();
  return sessions.find(s => s.state === "STOPPED") || null;
}

function deactivateSession(sessionId) {
  const active = readJson(ACTIVE_SESSION_FILE);
  if (active && active.sessionId === sessionId) {
    try { unlinkSync(ACTIVE_SESSION_FILE); } catch { /* ignore */ }
  }
}

// ── Diagnostics ────────────────────────────────────────

function collectDiagnostics() {
  const diag = {
    timestamp: new Date().toISOString(),
    dsRoot: DS_ROOT,
    activeSession: getActiveSessionId(),
    lockHeld: isLockHeld(),
    sessionsCount: listSessions().length,
    diskSpace: null,
    nodeVersion: process.version,
    platform: platform(),
  };

  try {
    const dfOut = execSync("df -h .", { encoding: "utf-8", timeout: 3000 });
    const match = dfOut.match(/(\d+)%\s+\/$/m);
    if (match) diag.diskSpace = `${match[1]}% used on /`;
  } catch { /* ignore */ }

  return diag;
}

// ── Session helper: update field ───────────────────────

function updateSession(sessionId, updates) {
  const session = getSession(sessionId);
  if (!session) return null;
  const updated = { ...session, ...updates, updatedAt: new Date().toISOString() };
  saveSession(updated);
  if (updates.state || updates.phase) {
    appendEvent(sessionId, { type: "STATE_CHANGE", ...updates });
  }
  return updated;
}

// ── Export ─────────────────────────────────────────────

export {
  DS_ROOT,
  SESSIONS_DIR,
  ACTIVE_SESSION_FILE,
  LOCK_FILE,
  ensureDir,
  readJson,
  writeJson,
  acquireLock,
  releaseLock,
  isLockHeld,
  createSession,
  getActiveSessionId,
  getActiveSession,
  getSession,
  saveSession,
  appendEvent,
  listSessions,
  getLatestStoppableSession,
  getLatestResumableSession,
  deactivateSession,
  collectDiagnostics,
  updateSession,
};
