import assert from "node:assert/strict";
import test from "node:test";
import { formatMobileCharacterProfession, formatMobileCharacterTime } from "./characterFormat";

test("formats mobile character time with padded hour", () => {
  assert.equal(formatMobileCharacterTime({ day: 0, hour: 0 }), "第 0 日 · 00:00");
});

test("formats current profession labels", () => {
  assert.equal(formatMobileCharacterProfession(null), "无");
  assert.equal(formatMobileCharacterProfession("齐日角"), "齐日角");
});
