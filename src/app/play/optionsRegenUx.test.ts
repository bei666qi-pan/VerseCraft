import test from "node:test";
import assert from "node:assert/strict";
import { getOptionsRegenSuccessHint } from "@/app/play/optionsRegenUx";

test("options regen UX: decision_required auto_missing_main success shows hint", () => {
  const hint = getOptionsRegenSuccessHint({ trigger: "auto_missing_main", turnMode: "decision_required" });
  assert.equal(typeof hint, "string");
  assert.equal((hint ?? "").includes("补全"), true);
});

test("options regen UX: narrative_only/system_transition should not show regen success hints", () => {
  assert.equal(getOptionsRegenSuccessHint({ trigger: "auto_missing_main", turnMode: "narrative_only" }), null);
  assert.equal(getOptionsRegenSuccessHint({ trigger: "manual_button", turnMode: "system_transition" }), null);
});

