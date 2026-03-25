import test from "node:test";
import assert from "node:assert/strict";
import { ENDGAME_ONLY_OPTION, ensureMinChars, isEndgameMoment, isNightHour } from "./endgame";

test("isNightHour treats 18-23 as night", () => {
  for (let h = 0; h <= 23; h++) {
    const expected = h >= 18;
    assert.equal(isNightHour(h), expected, `hour=${h}`);
  }
});

test("isEndgameMoment matches day10 hour0 only", () => {
  assert.equal(isEndgameMoment({ day: 10, hour: 0 }), true);
  assert.equal(isEndgameMoment({ day: 10, hour: 1 }), false);
  assert.equal(isEndgameMoment({ day: 9, hour: 0 }), false);
});

test("ensureMinChars pads to minimum length", () => {
  const base = "终局。";
  const out = ensureMinChars(base, 600);
  assert.ok(out.length >= 600);
  assert.ok(out.startsWith(base));
  assert.equal(ENDGAME_ONLY_OPTION, "迎接终焉");
});

