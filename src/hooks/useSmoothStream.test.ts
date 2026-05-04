import test from "node:test";
import assert from "node:assert/strict";
import {
  SMOOTH_STREAM_DEFAULT_OPTIONS,
  computePauseMs,
  takeSemanticChunk,
} from "@/hooks/useSmoothStream";

test("smooth stream defaults keep long-narrative backlog catch-up bounded", () => {
  assert.equal(SMOOTH_STREAM_DEFAULT_OPTIONS.backlogThreshold, 140);
  assert.equal(SMOOTH_STREAM_DEFAULT_OPTIONS.backlogMaxLen, 56);
  assert.ok(SMOOTH_STREAM_DEFAULT_OPTIONS.backlogMaxLen > SMOOTH_STREAM_DEFAULT_OPTIONS.steadyMaxLen);
  assert.ok(SMOOTH_STREAM_DEFAULT_OPTIONS.backlogMaxLen < 64);
});

test("backlog punctuation pause is capped for long narrative queues", () => {
  const pause = computePauseMs({
    chunk: "This sentence ends!",
    backlog: 520,
    stage: "backlog",
    options: SMOOTH_STREAM_DEFAULT_OPTIONS,
  });

  assert.equal(pause, 18);
});

test("initial burst stays snappy while semantic chunking avoids full flush", () => {
  const pause = computePauseMs({
    chunk: "Opening!",
    backlog: 20,
    stage: "initial",
    options: SMOOTH_STREAM_DEFAULT_OPTIONS,
  });
  const chunk = takeSemanticChunk("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 42);

  assert.ok(pause <= 22);
  assert.ok(chunk.length > SMOOTH_STREAM_DEFAULT_OPTIONS.steadyMaxLen);
  assert.ok(chunk.length <= SMOOTH_STREAM_DEFAULT_OPTIONS.backlogMaxLen);
});

test("steady Chinese punctuation pauses stay compact", () => {
  const pause = computePauseMs({
    chunk: "门缝里传来一声轻响。",
    backlog: 24,
    stage: "steady",
    options: SMOOTH_STREAM_DEFAULT_OPTIONS,
  });

  assert.ok(pause <= 72);
});
