import test from "node:test";
import assert from "node:assert/strict";
import { mobileReadingTheme } from "@/features/play/mobileReading/theme";

test("mobile option labels wrap instead of truncating on narrow screens", () => {
  assert.ok(!/\btruncate\b/.test(mobileReadingTheme.optionLabel));
  assert.ok(mobileReadingTheme.optionLabel.includes("whitespace-normal"));
  assert.ok(mobileReadingTheme.optionLabel.includes("break-words"));
  assert.ok(!mobileReadingTheme.optionLabel.includes("leading-none"));
  assert.ok(mobileReadingTheme.optionRow.includes("py-1.5"));
});
