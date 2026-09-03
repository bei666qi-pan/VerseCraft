import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  backfillAcceptedOptionsFromModel,
  getOptionsOnlyDeadlineMs,
} from "@/app/play/optionsRegenUx";
import { OPTIONS_REGEN_LATENCY_BUDGET } from "@/lib/perf/waitingConfig";

test("options regen UX: every options-maintenance path has a five-second hard ceiling", () => {
  assert.equal(getOptionsOnlyDeadlineMs("manual_button") <= OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("auto_missing_main") <= OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("opening_fallback") <= OPTIONS_REGEN_LATENCY_BUDGET.openingClientDeadlineMs, true);
  assert.equal(getOptionsOnlyDeadlineMs("manual_button"), 5_000);
  assert.equal(getOptionsOnlyDeadlineMs("auto_missing_main"), 5_000);
  assert.equal(getOptionsOnlyDeadlineMs("opening_fallback"), 5_000);
});

test("options regen UX: NEXT_PUBLIC_VC_TIGHT_TIMEOUTS=0 cannot widen options-only deadlines", async () => {
  const previous = process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS;
  process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS = "0";
  try {
    const moduleUrl = `${pathToFileURL(path.resolve("src/lib/perf/waitingConfig.ts")).href}?tight0=${Date.now()}`;
    const fresh = (await import(moduleUrl)) as typeof import("@/lib/perf/waitingConfig");
    assert.equal(fresh.VC_WAITING.playOptionsOnlyClientDeadlineMs, 5_000);
    assert.equal(fresh.VC_WAITING.playOpeningOptionsOnlyClientDeadlineMs, 5_000);
    assert.equal(fresh.VC_WAITING.optionsOnlyServerBudgetMs, 5_000);
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
