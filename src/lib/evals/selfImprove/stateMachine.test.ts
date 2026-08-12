/**
 * Evaluation & Regression Campaign — State Machine Unit Tests
 *
 * Tests phase transitions, state persistence, resume capability,
 * and state integrity for the self-improvement state machine.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  initState,
  transitionTo,
  setStatus,
  incrementRound,
  getState,
  saveState,
  loadState,
  resumeFrom,
  canTransition,
  nextPhase,
  saveManifest,
} from "./stateMachine";
import type { SelfImprovePhase } from "./types";

// ── Helpers ───────────────────────────────────────────

const TEST_RUN_ID = "test-si-20260730-000000";

function cleanupTestState(): void {
  const dir = resolve(process.cwd(), `.runtime-data/self-improve/${TEST_RUN_ID}`);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

// ── Phase Transition Tests ────────────────────────────

describe("Phase Transitions", () => {
  beforeEach(() => {
    initState(TEST_RUN_ID);
  });

  afterEach(cleanupTestState);

  it("validates legal transitions", () => {
    assert.ok(canTransition("discovery", "baseline"));
    assert.ok(canTransition("baseline", "scenario_building"));
    assert.ok(canTransition("scenario_building", "game_execution"));
    assert.ok(canTransition("game_execution", "judging"));
    assert.ok(canTransition("judging", "triage"));
    assert.ok(canTransition("triage", "repair"));
    assert.ok(canTransition("triage", "game_execution"));
    assert.ok(canTransition("repair", "quality_gate"));
    assert.ok(canTransition("quality_gate", "live_eval"));
    assert.ok(canTransition("quality_gate", "game_execution"));
    assert.ok(canTransition("live_eval", "reporting"));
    assert.ok(canTransition("live_eval", "game_execution"));
    assert.ok(canTransition("reporting", "stopped"));
  });

  it("validates illegal transitions", () => {
    assert.ok(!canTransition("discovery", "game_execution"));
    assert.ok(!canTransition("baseline", "stopped"));
    assert.ok(!canTransition("stopped", "discovery"));
    assert.ok(!canTransition("game_execution", "discovery"));
    assert.ok(!canTransition("triage", "quality_gate"));
  });

  it("completes full linear pipeline (discovery → stopped)", () => {
    transitionTo("baseline");
    transitionTo("scenario_building");
    transitionTo("game_execution");
    transitionTo("judging");
    transitionTo("triage");
    transitionTo("repair");
    transitionTo("quality_gate");
    transitionTo("live_eval");
    transitionTo("reporting");
    transitionTo("stopped");
    assert.equal(getState()!.phase, "stopped");
  });

  it("supports multi-round loop (quality_gate → game_execution)", () => {
    transitionTo("baseline");
    transitionTo("scenario_building");
    transitionTo("game_execution");
    transitionTo("judging");
    transitionTo("triage");
    transitionTo("repair");
    transitionTo("quality_gate");

    // Loop: quality_gate → game_execution (round 2)
    transitionTo("game_execution");
    assert.equal(getState()!.phase, "game_execution");

    transitionTo("judging");
    transitionTo("triage");
    // Skip repair, go direct to game_execution for round 3
    transitionTo("game_execution");
    assert.equal(getState()!.phase, "game_execution");
  });

  it("supports triage-to-game_execution shortcut (no defects)", () => {
    transitionTo("baseline");
    transitionTo("scenario_building");
    transitionTo("game_execution");
    transitionTo("judging");
    transitionTo("triage");
    // No defects → skip repair → directly loop
    transitionTo("game_execution");
    assert.equal(getState()!.phase, "game_execution");
  });

  it("throws on invalid transition", () => {
    assert.throws(() => {
      transitionTo("game_execution");
    }, /Invalid phase transition/);
  });
});

// ── State Management Tests ────────────────────────────

describe("State Management", () => {
  beforeEach(() => {
    initState(TEST_RUN_ID);
  });

  afterEach(cleanupTestState);

  it("initializes with correct defaults", () => {
    const state = getState();
    assert.ok(state);
    assert.equal(state!.phase, "discovery");
    assert.equal(state!.status, "running");
    assert.equal(state!.currentRound, 0);
    assert.equal(state!.resumed, false);
    assert.ok(state!.budget);
    assert.equal(state!.budget.maxRounds, 3);
  });

  it("increments round counter", () => {
    assert.equal(incrementRound(), 1);
    assert.equal(incrementRound(), 2);
    assert.equal(incrementRound(), 3);
    assert.equal(getState()!.currentRound, 3);
  });

  it("updates status", () => {
    setStatus("paused");
    assert.equal(getState()!.status, "paused");
    setStatus("running");
    assert.equal(getState()!.status, "running");
    setStatus("completed");
    assert.equal(getState()!.status, "completed");
  });

  it("tracks updatedAt on state changes", () => {
    const before = getState()!.updatedAt;
    const start = Date.now();
    while (Date.now() - start < 15) { /* wait */ }
    transitionTo("baseline");
    assert.ok(getState()!.updatedAt > before);
  });
});

// ── Persistence Tests ─────────────────────────────────

describe("Persistence", () => {
  beforeEach(() => {
    initState(TEST_RUN_ID);
  });

  afterEach(cleanupTestState);

  it("saves and loads state correctly", () => {
    transitionTo("baseline");
    transitionTo("scenario_building");
    incrementRound();
    saveState();

    const loaded = loadState(TEST_RUN_ID);
    assert.ok(loaded);
    assert.equal(loaded!.phase, "scenario_building");
    assert.equal(loaded!.currentRound, 1);
    assert.equal(loaded!.runId.id, TEST_RUN_ID);
  });

  it("saves manifest file to disk", () => {
    transitionTo("baseline");
    transitionTo("scenario_building");
    saveManifest();

    const manifestPath = resolve(
      process.cwd(),
      `.runtime-data/self-improve/${TEST_RUN_ID}/manifest.json`,
    );
    assert.ok(existsSync(manifestPath), `manifest.json should exist at ${manifestPath}`);

    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(raw.runId, TEST_RUN_ID);
    assert.equal(raw.profile, "smoke");
    assert.equal(raw.rounds, 0);
  });

  it("returns null for non-existent run", () => {
    assert.equal(loadState("nonexistent-zzz"), null);
  });

  it("resume restores state and marks as resumed", () => {
    transitionTo("baseline");
    transitionTo("scenario_building");
    transitionTo("game_execution");
    incrementRound();
    saveState();

    const resumed = resumeFrom(TEST_RUN_ID);
    assert.ok(resumed);
    assert.equal(resumed!.resumed, true);
    assert.equal(resumed!.resumedFromRunId, TEST_RUN_ID);
    assert.equal(resumed!.phase, "game_execution");
    assert.equal(resumed!.currentRound, 1);
  });

  it("throws when trying to resume non-existent run", () => {
    assert.throws(() => resumeFrom("nonexistent-zzz"), /Cannot resume/);
  });

  it("throws when trying to resume completed run", () => {
    transitionTo("baseline");
    transitionTo("scenario_building");
    transitionTo("game_execution");
    transitionTo("judging");
    transitionTo("triage");
    transitionTo("repair");
    transitionTo("quality_gate");
    transitionTo("live_eval");
    transitionTo("reporting");
    transitionTo("stopped");
    setStatus("completed");
    saveState();

    assert.throws(() => resumeFrom(TEST_RUN_ID), /Cannot resume/);
  });
});

// ── nextPhase Tests ───────────────────────────────────

describe("nextPhase", () => {
  beforeEach(() => initState(TEST_RUN_ID));
  afterEach(cleanupTestState);

  it("returns correct next phase for core pipeline", () => {
    assert.equal(nextPhase("discovery"), "baseline");
    assert.equal(nextPhase("baseline"), "scenario_building");
    assert.equal(nextPhase("scenario_building"), "game_execution");
    assert.equal(nextPhase("game_execution"), "judging");
    assert.equal(nextPhase("judging"), "triage");
    assert.equal(nextPhase("triage"), "repair");
    assert.equal(nextPhase("repair"), "quality_gate");
  });

  it("returns null for terminal phase", () => {
    assert.equal(nextPhase("stopped"), null);
  });
});

// ── Integration Tests ─────────────────────────────────

describe("Integration: Round Lifecycle", () => {
  afterEach(cleanupTestState);

  it("completes 3 full rounds with save/resume persistence", () => {
    initState(TEST_RUN_ID);
    transitionTo("baseline");
    transitionTo("scenario_building");

    // Round 1
    transitionTo("game_execution");
    transitionTo("judging");
    transitionTo("triage");
    transitionTo("repair");
    transitionTo("quality_gate");
    incrementRound();
    saveState();

    // Round 2: loop back
    transitionTo("game_execution");
    transitionTo("judging");
    transitionTo("triage");
    transitionTo("repair");
    transitionTo("quality_gate");
    incrementRound();
    saveState();

    // Round 3: final round
    transitionTo("game_execution");
    transitionTo("judging");
    transitionTo("triage");
    transitionTo("repair");
    transitionTo("quality_gate");
    incrementRound();

    // Finalize
    transitionTo("live_eval");
    transitionTo("reporting");
    transitionTo("stopped");
    setStatus("completed");
    saveState();

    const state = getState();
    assert.equal(state!.currentRound, 3);
    assert.equal(state!.phase, "stopped");
    assert.equal(state!.status, "completed");

    // Verify persistence
    const loaded = loadState(TEST_RUN_ID);
    assert.ok(loaded);
    assert.equal(loaded!.currentRound, 3);
    assert.equal(loaded!.phase, "stopped");
  });
});
