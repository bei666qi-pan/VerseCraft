import test from "node:test";
import assert from "node:assert/strict";
import {
  hasStrongAcquireSemantics,
  normalizeRegeneratedOptions,
  shouldAutoRegenerateOptionsOnModeSwitch,
  shouldWarnAcquireMismatch,
} from "@/features/play/turnCommit/phaseRegressionGuards";

test("phase4: narrative acquire semantics should be detectable", () => {
  assert.equal(hasStrongAcquireSemantics("你在暗格中获得了旧钥匙。"), true);
  assert.equal(hasStrongAcquireSemantics("你环顾四周，没有发现异常。"), false);
});

test("phase4: acquire mismatch warning should trigger instead of silent pass", () => {
  assert.equal(
    shouldWarnAcquireMismatch({
      narrative: "我拿到了一个诡异的盒子。",
      awardedItemWriteCount: 0,
      awardedWarehouseWriteCount: 0,
    }),
    true
  );
  assert.equal(
    shouldWarnAcquireMismatch({
      narrative: "我拿到了一个诡异的盒子。",
      awardedItemWriteCount: 1,
      awardedWarehouseWriteCount: 0,
    }),
    false
  );
});

test("phase4: options regeneration should auto-trigger on user switch text->options with empty options", () => {
  assert.equal(
    shouldAutoRegenerateOptionsOnModeSwitch({
      prevMode: "text",
      nextMode: "options",
      switchedByUser: true,
      currentOptionsLength: 0,
      blocksOptionsRegen: false,
      optionsRegenBusy: false,
      endgameActive: false,
      showEmbeddedOpening: false,
      isGuestDialogueExhausted: false,
    }),
    true
  );
  assert.equal(
    shouldAutoRegenerateOptionsOnModeSwitch({
      prevMode: "text",
      nextMode: "options",
      switchedByUser: true,
      currentOptionsLength: 0,
      blocksOptionsRegen: false,
      optionsRegenBusy: false,
      endgameActive: false,
      showEmbeddedOpening: true,
      isGuestDialogueExhausted: false,
    }),
    true
  );
  assert.equal(
    shouldAutoRegenerateOptionsOnModeSwitch({
      prevMode: "text",
      nextMode: "options",
      switchedByUser: false,
      currentOptionsLength: 0,
      blocksOptionsRegen: false,
      optionsRegenBusy: false,
      endgameActive: false,
      showEmbeddedOpening: false,
      isGuestDialogueExhausted: false,
    }),
    false
  );
});

test("phase4: regenerated options should be deduped and capped", () => {
  const out = normalizeRegeneratedOptions(
    ["观察门缝", "观察门缝", "查看走廊", "检查背包", "测试超长选项测试超长选项测试超长选项测试超长选项"],
    ["查看走廊"]
  );
  assert.equal(out.length <= 4, true);
  assert.equal(out[0], "观察门缝");
  assert.equal(out.includes("查看走廊"), true);
});
