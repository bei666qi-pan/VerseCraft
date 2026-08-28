import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowMobileActionDock } from "./shouldShowMobileActionDock";

test("keeps only the option-generation card while empty options are loading", () => {
  assert.equal(
    shouldShowMobileActionDock({ optionsExpanded: true, optionsRegenBusy: true, optionCount: 0 }),
    false
  );
});

test("keeps the action dock available outside the empty-options loading state", () => {
  assert.equal(
    shouldShowMobileActionDock({ optionsExpanded: false, optionsRegenBusy: true, optionCount: 0 }),
    true
  );
  assert.equal(
    shouldShowMobileActionDock({ optionsExpanded: true, optionsRegenBusy: false, optionCount: 0 }),
    true
  );
  assert.equal(
    shouldShowMobileActionDock({ optionsExpanded: true, optionsRegenBusy: true, optionCount: 4 }),
    true
  );
});
