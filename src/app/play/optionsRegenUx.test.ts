import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  backfillAcceptedOptionsFromModel,
  getOptionsOnlyDeadlineMs,
} from "@/app/play/optionsRegenUx";
import { OPTIONS_REGEN_LATENCY_BUDGET } from "@/lib/perf/waitingConfig";

test("options regen UX: short-link client deadlines stay within P99 targets", () => {
  assert.equal(getOptionsOnlyDeadlineMs("manual_button") <= OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("auto_missing_main") <= OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("opening_fallback") <= OPTIONS_REGEN_LATENCY_BUDGET.openingClientDeadlineMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("manual_button") <= 9_000, true);
  assert.equal(getOptionsOnlyDeadlineMs("auto_missing_main") <= 9_000, true);
  assert.equal(getOptionsOnlyDeadlineMs("opening_fallback") <= 11_000, true);
  assert.equal(getOptionsOnlyDeadlineMs("opening_fallback") >= getOptionsOnlyDeadlineMs("manual_button"), true);
});

test("options regen UX: NEXT_PUBLIC_VC_TIGHT_TIMEOUTS=0 cannot widen options-only deadlines", async () => {
  const previous = process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS;
  process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS = "0";
  try {
    const moduleUrl = `${pathToFileURL(path.resolve("src/lib/perf/waitingConfig.ts")).href}?tight0=${Date.now()}`;
    const fresh = (await import(moduleUrl)) as typeof import("@/lib/perf/waitingConfig");
    assert.equal(fresh.VC_WAITING.playOptionsOnlyClientDeadlineMs, 9_000);
    assert.equal(fresh.VC_WAITING.playOpeningOptionsOnlyClientDeadlineMs, 11_000);
    assert.equal(fresh.VC_WAITING.optionsOnlyServerBudgetMs, 8_500);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS;
    else process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS = previous;
  }
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

test("options regen UX: options-only request has Android-safe rate-limit recovery hooks", () => {
  const src = fs.readFileSync(path.resolve("src/app/play/page.tsx"), "utf8");
  assert.match(src, /\[VERSECRAFT_CHAT_PURPOSE_HEADER\]: VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY/);
  assert.match(src, /sleepWithinOptionsDeadline\(/);
  assert.match(src, /setOptionsRegenFailureMessage\(OPTIONS_REGEN_FAILURE_HINT\)/);
});

