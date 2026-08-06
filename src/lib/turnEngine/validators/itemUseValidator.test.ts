// src/lib/turnEngine/validators/itemUseValidator.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { validateItemUseNarrative } from "./itemUseValidator";

// ---------------------------------------------------------------------------
// Real registry item IDs used in tests (no mocking needed)
// ---------------------------------------------------------------------------
// I-D01  过期罐头     effectType: consumable
// I-D14  生锈的钥匙   effectType: key
// I-C08  耳塞         effectType: shield

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("(1) item in inventory passes — no issues when narrative uses owned item", () => {
  const report = validateItemUseNarrative(
    "你使用过期罐头恢复理智。",
    ["I-D01"],
    {},
  );
  assert.equal(report.ok, true);
  assert.deepStrictEqual(report.issues, []);
});

test("(2) item use for correct effectType passes — matching verb family", () => {
  const report = validateItemUseNarrative(
    "用钥匙打开门。",
    ["I-D14"],
    {},
  );
  assert.equal(report.ok, true);
  assert.deepStrictEqual(report.issues, []);
});

test("(3) item_not_in_inventory detected — narrative mentions item not in inventory", () => {
  const report = validateItemUseNarrative(
    "使用绷带包扎伤口。",
    ["I-D01"],
    {},
  );
  assert.equal(report.ok, false);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].code, "item_not_in_inventory");
  assert.match(report.issues[0].detail, /绷带/);
});

test("(4) item_effect_type_mismatch detected — narrative action inconsistent with effect type", () => {
  const report = validateItemUseNarrative(
    "使用耳塞。",
    ["I-C08"],
    {},
  );
  assert.equal(report.ok, false);
  const mismatch = report.issues.find(
    (i) => i.code === "item_effect_type_mismatch",
  );
  assert.ok(mismatch, "expected item_effect_type_mismatch issue");
  assert.match(
    mismatch.detail,
    /does not match effect type "shield"/,
  );
  assert.equal(mismatch.itemId, "I-C08");
});

test("(5) item consumed matches structured consumed_items — no issue raised", () => {
  const report = validateItemUseNarrative(
    "你吃下过期罐头补充体力。",
    ["I-D01"],
    { consumed_items: ["I-D01"] },
  );
  assert.equal(report.ok, true);
  assert.deepStrictEqual(report.issues, []);
});

test("(6) item consumed not in structured detected — consumption verb used but consumed_items missing", () => {
  const report = validateItemUseNarrative(
    "你吃下过期罐头补充体力。",
    ["I-D01"],
    { consumed_items: [] },
  );
  assert.equal(report.ok, false);
  const consumed = report.issues.find(
    (i) => i.code === "item_consumed_not_in_structured",
  );
  assert.ok(consumed, "expected item_consumed_not_in_structured issue");
  assert.match(consumed.detail, /consumed_items does not include/);
  assert.equal(consumed.itemId, "I-D01");
});

test("(7) empty narrative returns no issues", () => {
  const report = validateItemUseNarrative("", ["I-D01"], {});
  assert.equal(report.ok, true);
  assert.deepStrictEqual(report.issues, []);
});

test("(8) consume verb detection in Chinese text — 吞下 triggers consumption check and flags missing consumed_items", () => {
  const report = validateItemUseNarrative(
    "你吞下了过期罐头。",
    ["I-D01"],
    { consumed_items: [] },
  );
  assert.equal(report.ok, false);
  const consumed = report.issues.find(
    (i) => i.code === "item_consumed_not_in_structured",
  );
  assert.ok(consumed, "expected item_consumed_not_in_structured for 吞下");
  assert.equal(consumed.itemId, "I-D01");
  assert.match(consumed.detail, /过期罐头/);
});
