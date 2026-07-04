import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultEscapeMainlineTemplate } from "./template";
import { getEscapeStageLabel } from "./selectors";
import type { EscapeStage } from "./types";

test("getEscapeStageLabel: 每个 stage 都返回非空、不等于内部字面量的中文标签", () => {
  const stages: EscapeStage[] = [
    "trapped",
    "aware_exit_exists",
    "route_fragmented",
    "conditions_known",
    "conditions_partially_met",
    "final_window_open",
    "escaped_true",
    "escaped_false",
    "escaped_costly",
    "doomed",
  ];
  for (const stage of stages) {
    const label = getEscapeStageLabel(stage);
    assert.ok(label.length > 0, `${stage} 应有非空标签`);
    assert.notEqual(label, stage, `${stage} 的标签不应直接等于内部字面量`);
  }
});

test("getEscapeStageLabel: 默认状态（trapped）标签与 createDefaultEscapeMainlineTemplate 一致可用", () => {
  const state = createDefaultEscapeMainlineTemplate(0);
  const label = getEscapeStageLabel(state.stage);
  assert.equal(label, "仍被困住");
});
