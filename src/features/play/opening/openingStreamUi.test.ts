import test from "node:test";
import assert from "node:assert/strict";
import { computeOpeningBusyUi, shouldRecoverStaleSendActionFlight } from "./openingStreamUi";

test("computeOpeningBusyUi：阶段已 idle 时不显示主笔推演 UI，即使 opening 标记卡住", () => {
  assert.equal(computeOpeningBusyUi(true, "idle"), false);
  assert.equal(computeOpeningBusyUi(false, "idle"), false);
});

test("computeOpeningBusyUi：等待上游或流式中且标记为 true 时显示", () => {
  assert.equal(computeOpeningBusyUi(true, "waiting_upstream"), true);
  assert.equal(computeOpeningBusyUi(true, "streaming_body"), true);
  assert.equal(computeOpeningBusyUi(true, "turn_committing"), true);
  assert.equal(computeOpeningBusyUi(true, "tail_draining"), true);
});

test("computeOpeningBusyUi：未标记开局 busy 时不显示", () => {
  assert.equal(computeOpeningBusyUi(false, "waiting_upstream"), false);
});

test("shouldRecoverStaleSendActionFlight：idle 且仍 in-flight 时需恢复", () => {
  assert.equal(shouldRecoverStaleSendActionFlight(true, "idle"), true);
  assert.equal(shouldRecoverStaleSendActionFlight(false, "idle"), false);
  assert.equal(shouldRecoverStaleSendActionFlight(true, "waiting_upstream"), false);
});
