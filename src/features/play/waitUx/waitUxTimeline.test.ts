import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceWaitUxDisplay,
  initialWaitUxDisplay,
  mergeWaitUxTarget,
  timeDerivedWaitStage,
} from "./waitUxTimeline";

test("timeDerivedWaitStage: short TTFT stays near front", () => {
  assert.equal(timeDerivedWaitStage(0), "request_sent");
  assert.equal(timeDerivedWaitStage(500), "request_sent");
  assert.equal(timeDerivedWaitStage(800), "routing");
  assert.equal(timeDerivedWaitStage(2200), "context_building");
  assert.equal(timeDerivedWaitStage(5000), "generating");
});

test("mergeWaitUxTarget: backend can advance ahead of time axis", () => {
  assert.equal(mergeWaitUxTarget(100, "generating"), "generating");
});

test("mergeWaitUxTarget: no backend uses time only", () => {
  assert.equal(mergeWaitUxTarget(800, null), "routing");
});

test("derive target: no headers never claims generation", () => {
  const t0 = 10_000;
  let state = initialWaitUxDisplay(t0);
  state = advanceWaitUxDisplay({
    now: t0 + 6000,
    requestStartedAt: t0,
    backend: null,
    prev: state,
    signals: { hasResponseHeaders: false },
  });
  assert.equal(state.stage, "routing");
});

test("advanceWaitUxDisplay: respects minimum hold between steps", () => {
  const t0 = 10_000;
  let state = initialWaitUxDisplay(t0);
  assert.equal(state.stage, "request_sent");
  state = advanceWaitUxDisplay({
    now: t0 + 50,
    requestStartedAt: t0,
    backend: null,
    prev: state,
  });
  assert.equal(state.stage, "request_sent");
  state = advanceWaitUxDisplay({
    now: t0 + 2400,
    requestStartedAt: t0,
    backend: null,
    prev: state,
    signals: { hasResponseHeaders: true },
  });
  assert.equal(state.stage, "context_building");
});
