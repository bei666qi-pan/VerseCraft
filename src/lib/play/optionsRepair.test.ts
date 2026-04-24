import test from "node:test";
import assert from "node:assert/strict";
import { buildOptionsRepairReason, getRepairMissingCount, shouldTriggerOptionsRepairPass } from "@/lib/play/optionsRepair";

test("options repair: should trigger only when accepted options are insufficient", () => {
  assert.equal(shouldTriggerOptionsRepairPass({ acceptedOptions: ["我贴近门缝听动静"] }), true);
  assert.equal(shouldTriggerOptionsRepairPass({ acceptedOptions: [] }), false);
  assert.equal(shouldTriggerOptionsRepairPass({ acceptedOptions: ["a", "b", "c", "d"] }), false);
});

test("options repair: should compute missing count and build constrained reason", () => {
  const missing = getRepairMissingCount({ acceptedOptions: ["我沿着走廊边缘慢慢排查异常"] });
  assert.equal(missing, 3);
  const reason = buildOptionsRepairReason({
    baseReason: "主回合 narrative 正常但 options 缺失",
    acceptedOptions: ["我沿着走廊边缘慢慢排查异常"],
    missingCount: missing,
  });
  assert.equal(reason.includes("repair_missing_slots:3"), true);
  assert.equal(reason.includes("最终仍输出4条"), true);
  assert.equal(reason.includes("仅新增3条"), true);
});

