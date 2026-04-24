import test from "node:test";
import assert from "node:assert/strict";
import { getOptionsRegenSuccessHint } from "@/app/play/optionsRegenUx";

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

