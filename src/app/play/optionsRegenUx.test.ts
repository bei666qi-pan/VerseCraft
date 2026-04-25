import test from "node:test";
import assert from "node:assert/strict";
import {
  backfillAcceptedOptionsFromModel,
  getOptionsOnlyDeadlineMs,
  getOptionsRegenSuccessHint,
} from "@/app/play/optionsRegenUx";

test("options regen UX: decision_required auto_missing_main success shows hint", () => {
  const hint = getOptionsRegenSuccessHint({ trigger: "auto_missing_main", turnMode: "decision_required" });
  assert.equal(typeof hint, "string");
  assert.equal((hint ?? "").includes("补全"), true);
});

test("options regen UX: hint now shown for any turn mode (long-narrative auto-continue removed)", () => {
  // 修复后：已移除“长叙事自动续写”，任何 turn_mode 下玩家都通过选项推进，
  // 因此所有触发成功都应显示补全提示。
  assert.equal(typeof getOptionsRegenSuccessHint({ trigger: "auto_missing_main", turnMode: "narrative_only" }), "string");
  assert.equal(typeof getOptionsRegenSuccessHint({ trigger: "manual_button", turnMode: "system_transition" }), "string");
});

test("options regen UX: client deadline does not abort before server options AI floor", () => {
  const serverOptionsOnlyFloorMs = 15_000;
  assert.equal(getOptionsOnlyDeadlineMs("manual_button") >= serverOptionsOnlyFloorMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("auto_missing_main") >= serverOptionsOnlyFloorMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("opening_fallback") >= getOptionsOnlyDeadlineMs("manual_button"), true);
});

test("options regen UX: model options backfill semantic-gate misses", () => {
  assert.deepEqual(
    backfillAcceptedOptionsFromModel({
      accepted: ["我查看门锁"],
      candidates: ["我查看门锁", "我检查墙角", "我靠近铁门", "我询问老刘"],
    }),
    ["我查看门锁", "我检查墙角", "我靠近铁门", "我询问老刘"]
  );
});

