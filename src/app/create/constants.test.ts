import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_STATS,
  GENDER_OPTIONS,
  STAT_DESCRIPTIONS,
  STAT_LABELS,
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

test("create page uses origin copy for background stat without changing allocation logic", () => {
  assert.equal(STAT_LABELS.background, "出身");
  assert.equal(STAT_DESCRIPTIONS.background, "出身越高，越能获得更多原石。");
  assert.equal(calculateRemainingPoints({ ...BASE_STATS, background: 5 }), 25);
});

test("create echo talent descriptions match the public copy", () => {
  const descByTitle = Object.fromEntries(TALENTS.map((talent) => [talent.title, talent.desc]));
  assert.equal(descByTitle["时间回溯"], "退回至1小时之前。");
  assert.equal(descByTitle["命运馈赠"], "得到馈赠的道具。");
  assert.equal(descByTitle["主角光环"], "短时间内成为真正的主角。");
  assert.equal(descByTitle["丧钟回响"], "清除一位恶意实体");
});
