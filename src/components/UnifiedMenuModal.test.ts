import assert from "node:assert/strict";
import test from "node:test";
import { VISIBLE_MENU_TABS } from "./UnifiedMenuModal";

test("UnifiedMenuModal only exposes non-pruned visible tabs", () => {
  assert.deepEqual([...VISIBLE_MENU_TABS], []);
  assert.equal(VISIBLE_MENU_TABS.includes("settings" as (typeof VISIBLE_MENU_TABS)[number]), false);
  assert.equal(VISIBLE_MENU_TABS.includes("character" as (typeof VISIBLE_MENU_TABS)[number]), false);
  assert.equal(VISIBLE_MENU_TABS.includes("codex" as (typeof VISIBLE_MENU_TABS)[number]), false);
  for (const removed of ["backpack", "warehouse", "achievements", "task", "guide", "journal", "weapon"]) {
    assert.equal(VISIBLE_MENU_TABS.includes(removed as (typeof VISIBLE_MENU_TABS)[number]), false);
  }
});
