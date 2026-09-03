import assert from "node:assert/strict";
import test from "node:test";
import { projectLocalPlayableOptions } from "./localOptionsProjection";

test("projects four playable options locally when a turn has none", () => {
  const options = projectLocalPlayableOptions({
    narrative: "黑暗里传来急促的脚步声，危险正在靠近。",
    seedOptions: [],
  });
  assert.equal(options.length, 4);
  assert.match(options[0], /警惕|后退|安全/);
});

test("keeps useful model seeds and deterministically fills an insufficient set", () => {
  const seed = "我检查门锁是否完好。";
  const options = projectLocalPlayableOptions({
    narrative: "门后没有声音。",
    seedOptions: [seed],
  });
  assert.equal(options.length, 4);
  assert.equal(options[0], seed);
  assert.equal(new Set(options).size, 4);
});

test("projects English choices without leaking Chinese fallback copy", () => {
  const options = projectLocalPlayableOptions({
    narrative: "Footsteps close in from the dark corridor. Danger is near.",
    seedOptions: [],
    language: "en-US",
  });

  assert.equal(options.length, 4);
  assert.ok(options.every((option) => !/[一-鿿]/u.test(option)));
});
