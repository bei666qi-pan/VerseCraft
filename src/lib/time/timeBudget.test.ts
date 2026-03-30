import test from "node:test";
import assert from "node:assert/strict";
import { resolveHourProgressDelta, splitProgress } from "./timeBudget";

test("resolveHourProgressDelta: legacy consumes_time true => 1", () => {
  assert.equal(resolveHourProgressDelta(true, undefined), 1);
});

test("resolveHourProgressDelta: consumes_time false => 0 regardless of cost", () => {
  assert.equal(resolveHourProgressDelta(false, "heavy"), 0);
});

test("resolveHourProgressDelta: light < standard", () => {
  assert.ok(resolveHourProgressDelta(true, "light") < resolveHourProgressDelta(true, "standard"));
});

test("resolveHourProgressDelta: free with consumes true => 0", () => {
  assert.equal(resolveHourProgressDelta(true, "free"), 0);
});

test("splitProgress: multiple lights accumulate to whole hour", () => {
  let p = 0;
  let whole = 0;
  for (let i = 0; i < 5; i++) {
    const d = resolveHourProgressDelta(true, "light");
    const s = splitProgress(p, d);
    p = s.newPending;
    whole += s.wholeHours;
  }
  assert.ok(whole >= 1);
});

test("splitProgress: legacy one step crosses one hour", () => {
  const s = splitProgress(0, 1);
  assert.equal(s.wholeHours, 1);
  assert.equal(s.newPending, 0);
});
