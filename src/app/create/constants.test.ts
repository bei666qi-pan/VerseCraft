import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_STATS,
  GENDER_OPTIONS,
  TALENTS,
  calculateRemainingPoints,
  isValidCreatePersonality,
} from "./constants";

test("create page gender options include other", () => {
  assert.deepEqual(GENDER_OPTIONS, ["男", "女", "其他"]);
});

test("create stat allocation starts with 30 remaining points", () => {
  assert.equal(calculateRemainingPoints({ ...BASE_STATS }), 30);
});

test("create stat allocation decreases remaining points after adding", () => {
  assert.equal(calculateRemainingPoints({ ...BASE_STATS, agility: 5 }), 25);
});

test("create stat allocation does not gain points below base values", () => {
  assert.ok(calculateRemainingPoints({ ...BASE_STATS, sanity: 9 }) > 30);
});

test("create personality validation accepts 2-6 Chinese characters only", () => {
  assert.equal(isValidCreatePersonality("冷静"), true);
  assert.equal(isValidCreatePersonality("沉着谨慎"), true);
  assert.equal(isValidCreatePersonality("A冷静"), false);
  assert.equal(isValidCreatePersonality("冷静1"), false);
  assert.equal(isValidCreatePersonality("过于冷静谨慎的人"), false);
});

test("create talent list contains six choices", () => {
  assert.equal(TALENTS.length, 6);
});
