import test from "node:test";
import assert from "node:assert/strict";
import { getCommitFailureRecovery } from "@/app/play/commitFailureRecovery";

test("commit failure recovery: when narrative already committed, should rescue narrative and not blank it", () => {
  const out = getCommitFailureRecovery({ committedNarrativeForRescue: "已写入日志的正文" });
  assert.equal(out.kind, "narrative_rescued");
  if (out.kind === "narrative_rescued") {
    assert.equal(out.narrative, "已写入日志的正文");
    assert.equal(out.hint.includes("正文已保存"), true);
  }
});

test("commit failure recovery: without committed narrative, should fall back to fatal message", () => {
  const out = getCommitFailureRecovery({ committedNarrativeForRescue: null });
  assert.equal(out.kind, "fatal");
  if (out.kind === "fatal") {
    assert.equal(out.liveNarrative.includes("发生错误"), true);
  }
});

