import assert from "node:assert/strict";
import test from "node:test";
import { mergeServerDirectorState, type ServerDirectorSnapshot } from "./mergeServerDirector";
import { createEmptyDirectorState } from "./types";
import type { StoryDirectorState } from "./types";

// --- helpers ---

function makeLocal(overrides: Partial<StoryDirectorState> = {}): StoryDirectorState {
  return { ...createEmptyDirectorState(1), ...overrides };
}

function makeServer(overrides: Partial<ServerDirectorSnapshot> = {}): ServerDirectorSnapshot {
  return {
    directorIntent: null,
    currentPhase: "quiet",
    pacingSummary: {
      tension: 0.3,
      mystery: 0.5,
      fatigue: 0.2,
      progress: 0.4,
      agency_health: 0.6,
      reveal_pressure: 0.1,
    },
    turnIndex: 5,
    ...overrides,
  };
}

// --- Tests ---

test("(1) no server state → returns local unchanged", () => {
  const local = makeLocal({ tension: 42, stallCount: 3 });
  const result = mergeServerDirectorState(local, null);
  assert.deepStrictEqual(result.director, local);
  assert.deepStrictEqual(result.diagnostics, {
    hadDrift: false,
    summary: "no server director state available; keeping local state unchanged",
    tensionDelta: 0,
    serverBeatModeHint: null,
    serverFatigue: 0,
    serverMystery: 0,
  });
});

test("(1b) undefined server state → returns local unchanged", () => {
  const local = makeLocal({ tension: 42, stallCount: 3 });
  const result = mergeServerDirectorState(local, undefined);
  assert.deepStrictEqual(result.director, local);
  assert.deepStrictEqual(result.diagnostics.summary, "no server director state available; keeping local state unchanged");
});

test("(2) high fatigue → mixed tension (40% server, 60% local)", () => {
  // server fatigue >= 0.75 → tension = round(local * 0.6 + server * 0.4)
  const local = makeLocal({ tension: 20 });
  const server = makeServer({
    pacingSummary: { tension: 0.9, mystery: 0.5, fatigue: 0.8, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // 20 * 0.6 + 90 * 0.4 = 12 + 36 = 48
  assert.equal(result.director.tension, 48);
  assert.equal(result.diagnostics.tensionDelta, 28);
  assert.ok(result.diagnostics.summary.includes("server fatigue high"));
  assert.ok(result.diagnostics.summary.includes("80%"));
});

test("(2b) high fatigue at exact threshold 0.75", () => {
  const local = makeLocal({ tension: 50 });
  const server = makeServer({
    pacingSummary: { tension: 0.2, mystery: 0.5, fatigue: 0.75, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // 50 * 0.6 + 20 * 0.4 = 30 + 8 = 38
  assert.equal(result.director.tension, 38);
  assert.equal(result.diagnostics.tensionDelta, -12);
});

test("(3) normal no-drift → 30/70 mix", () => {
  // gap < 25 → blendWeight = 0.3 server, 0.7 local
  const local = makeLocal({ tension: 30 });
  const server = makeServer({
    pacingSummary: { tension: 0.4, mystery: 0.5, fatigue: 0.1, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // 30 * 0.7 + 40 * 0.3 = 21 + 12 = 33
  assert.equal(result.director.tension, 33);
  assert.equal(result.diagnostics.tensionDelta, 3);
  assert.equal(result.diagnostics.hadDrift, false);
});

test("(3b) normal no-drift with gap just below 25", () => {
  const local = makeLocal({ tension: 50 });
  const server = makeServer({
    pacingSummary: { tension: 0.74, mystery: 0.5, fatigue: 0.1, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // gap = |74 - 50| = 24 (< 25) → still no drift
  // 50 * 0.7 + 74 * 0.3 = 35 + 22.2 = 57.2 → 57
  assert.equal(result.director.tension, 57);
  assert.equal(result.diagnostics.hadDrift, false);
});

test("(4) tension drift ≥25 → 50/50 mix", () => {
  // gap >= 25 → hadDrift = true, blendWeight = 0.5
  const local = makeLocal({ tension: 20 });
  const server = makeServer({
    pacingSummary: { tension: 0.7, mystery: 0.5, fatigue: 0.1, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // gap = |70 - 20| = 50 (>= 25) → drift
  // 20 * 0.5 + 70 * 0.5 = 10 + 35 = 45
  assert.equal(result.director.tension, 45);
  assert.equal(result.diagnostics.tensionDelta, 25);
  assert.equal(result.diagnostics.hadDrift, true);
  assert.ok(result.diagnostics.summary.includes("drift detected"));
});

test("(4b) tension drift exactly 25 → 50/50 mix", () => {
  const local = makeLocal({ tension: 45 });
  const server = makeServer({
    pacingSummary: { tension: 0.7, mystery: 0.5, fatigue: 0.1, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // gap = |70 - 45| = 25 → drift
  // 45 * 0.5 + 70 * 0.5 = 22.5 + 35 = 57.5 → 58
  assert.equal(result.director.tension, 58);
  assert.equal(result.diagnostics.hadDrift, true);
});

test("(5) high progress + stall → stallCount reduced", () => {
  // progress >= 0.6 && stallCount >= 2 → stallCount--
  const local = makeLocal({ tension: 30, stallCount: 3 });
  const server = makeServer({
    pacingSummary: { tension: 0.4, mystery: 0.5, fatigue: 0.1, progress: 0.7, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  assert.equal(result.director.stallCount, 2);
  assert.ok(result.diagnostics.summary.includes("stallCount"));
  assert.ok(result.diagnostics.summary.includes("3→2"));
});

test("(5b) high progress but stallCount < 2 → no change", () => {
  const local = makeLocal({ tension: 30, stallCount: 1 });
  const server = makeServer({
    pacingSummary: { tension: 0.4, mystery: 0.5, fatigue: 0.1, progress: 0.8, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  assert.equal(result.director.stallCount, 1);
});

test("(5c) high progress with stallCount at exact threshold 2", () => {
  const local = makeLocal({ tension: 30, stallCount: 2 });
  const server = makeServer({
    pacingSummary: { tension: 0.4, mystery: 0.5, fatigue: 0.1, progress: 0.6, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // progress = 0.6 is >= 0.6, stallCount = 2 is >= 2 → reduce
  assert.equal(result.director.stallCount, 1);
});

test("(6) low agency_health + stall → stallCount increased", () => {
  // agency_health <= 0.3 && stallCount < 3 → stallCount++
  const local = makeLocal({ tension: 30, stallCount: 1 });
  const server = makeServer({
    pacingSummary: { tension: 0.4, mystery: 0.5, fatigue: 0.1, progress: 0.3, agency_health: 0.2, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  assert.equal(result.director.stallCount, 2);
});

test("(6b) low agency_health but stallCount >= 3 → no increase", () => {
  const local = makeLocal({ tension: 30, stallCount: 3 });
  const server = makeServer({
    pacingSummary: { tension: 0.4, mystery: 0.5, fatigue: 0.1, progress: 0.3, agency_health: 0.1, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  assert.equal(result.director.stallCount, 3);
});

test("(6c) both progress high and agency low → stallCount unchanged", () => {
  // progress >= 0.6 → -1, agency <= 0.3 → +1, net zero when both fire
  const local = makeLocal({ tension: 30, stallCount: 2 });
  const server = makeServer({
    pacingSummary: { tension: 0.4, mystery: 0.5, fatigue: 0.1, progress: 0.7, agency_health: 0.2, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  // -1 for progress, +1 for agency → net 0
  assert.equal(result.director.stallCount, 2);
});

test("(7) server director intent maps to beatModeHint — all phases", () => {
  const phaseMap: Record<string, string | null> = {
    quiet: "quiet",
    build_up: "pressure",
    pressure: "pressure",
    release: "quiet",
    reveal: "reveal",
    recovery: "aftershock",
    unknown_phase: null,
  };

  for (const [phase, expected] of Object.entries(phaseMap)) {
    const local = makeLocal({ tension: 30 });
    const server = makeServer({ currentPhase: phase });
    const result = mergeServerDirectorState(local, server);
    assert.equal(
      result.diagnostics.serverBeatModeHint,
      expected,
      `phase "${phase}" should map to "${expected}"`
    );
  }
});

test("(7b) server diagnostics include serverFatigue and serverMystery", () => {
  const local = makeLocal();
  const server = makeServer({
    pacingSummary: { tension: 0.3, mystery: 0.65, fatigue: 0.4, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);

  assert.equal(result.diagnostics.serverFatigue, 0.4);
  assert.equal(result.diagnostics.serverMystery, 0.65);
});

test("(7c) server directorIntent field does not affect logic", () => {
  const local = makeLocal({ tension: 30 });
  const serverWithIntent = makeServer({ directorIntent: "test_intent" });
  const serverWithoutIntent = makeServer({ directorIntent: null });

  const r1 = mergeServerDirectorState(local, serverWithIntent);
  const r2 = mergeServerDirectorState(local, serverWithoutIntent);

  // both should produce identical tension/beatModeHint
  assert.equal(r1.director.tension, r2.director.tension);
  assert.equal(r1.diagnostics.serverBeatModeHint, r2.diagnostics.serverBeatModeHint);
});

test("clamped edge cases: tension never exceeds 0-100", () => {
  // server at 0, local at 100 with drift → 50/50 = 50
  const local = makeLocal({ tension: 100 });
  const server = makeServer({
    pacingSummary: { tension: 0.0, mystery: 0.5, fatigue: 0.1, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result = mergeServerDirectorState(local, server);
  assert.ok(result.director.tension >= 0 && result.director.tension <= 100);

  // server at 1.0, local at 0 with drift → 50/50 = 50
  const local2 = makeLocal({ tension: 0 });
  const server2 = makeServer({
    pacingSummary: { tension: 1.0, mystery: 0.5, fatigue: 0.1, progress: 0.4, agency_health: 0.5, reveal_pressure: 0.1 },
  });
  const result2 = mergeServerDirectorState(local2, server2);
  assert.ok(result2.director.tension >= 0 && result2.director.tension <= 100);
});

test("preserves other local fields through spread", () => {
  const local = makeLocal({ tension: 25, stallCount: 1, beatIndex: 7, arcId: "custom_arc" });
  const server = makeServer();
  const result = mergeServerDirectorState(local, server);

  assert.equal(result.director.beatIndex, 7);
  assert.equal(result.director.arcId, "custom_arc");
});
