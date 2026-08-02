/**
 * no_fake_item oracle polarity pins (oracle_stage_defect 修复).
 *
 * boundary-nonexistent-item 的正确产品行为是"资源守恒"（不发假物品、不错误扣费），
 * 因此 spec 必须声明 expected:"pass"——判定方向是"守恒成立"。历史上该 case 被
 * 错误标注为 expected:"fail"，导致正确行为被判 fail、只有真发假物品才"通过"。
 *
 * 同时 pin 住 fail-closed 语义：trace 缺少 parsedDmJson 时任何不变量都不得
 * 自动 pass（缺失证据 ≠ 证据符合预期）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkDeterministicInvariant } from "./orchestrator";
import type { SelfImproveTrace } from "./types";

function traceWith(dmJson: Record<string, unknown> | undefined): SelfImproveTrace {
  return { parsedDmJson: dmJson } as unknown as SelfImproveTrace;
}

// scenarioPool 的 import 链会拉进 server-only（ai/service），单测环境不可直接 import；
// 改以权威 JSON 语料 pin 住 spec 极性（scenarioPool.ts 内联副本由同一注释约束）。
function loadSmokeCase(caseId: string): { expectedInvariants: Array<{ id: string; check: string; expected: string }> } {
  const raw = JSON.parse(readFileSync("benchmarks/self-improve/smoke-cases.json", "utf8"));
  const cases: Array<{ caseId: string }> = Array.isArray(raw) ? raw : (raw.cases ?? raw.scenarios ?? []);
  const found = cases.find((c) => c.caseId === caseId);
  assert.ok(found, `smoke case ${caseId} must exist`);
  return found as never;
}

describe("no_fake_item oracle polarity", () => {
  it("boundary-nonexistent-item spec declares resource_conservation expected=pass", () => {
    const inv = loadSmokeCase("boundary-nonexistent-item").expectedInvariants.find((i) => i.id === "no_fake_item");
    assert.ok(inv, "no_fake_item invariant must exist");
    assert.equal(inv.check, "resource_conservation");
    assert.equal(inv.expected, "pass");
  });

  it("correct behavior (nothing awarded, nothing charged) satisfies the invariant", () => {
    const inv = { id: "no_fake_item", check: "resource_conservation", expected: "pass", severity: "critical" };
    const t = traceWith({
      is_action_legal: false,
      awarded_items: [],
      awarded_warehouse_items: [],
      currency_change: 0,
      narrative: "我核对了行囊：这件物品并不在行囊中，不能凭空拿出或使用。",
    });
    assert.equal(checkDeterministicInvariant(t, inv), true);
  });

  it("awarding a phantom item violates the invariant", () => {
    const inv = { id: "no_fake_item", check: "resource_conservation", expected: "pass", severity: "critical" };
    const t = traceWith({
      is_action_legal: true,
      awarded_items: [{ id: "I-X999", name: "幻影钥匙" }],
      narrative: "你拿出了那把钥匙。",
    });
    assert.equal(checkDeterministicInvariant(t, inv), false);
  });

  it("phantom item via warehouse award also violates the invariant", () => {
    const inv = { id: "no_fake_item", check: "resource_conservation", expected: "pass", severity: "critical" };
    const t = traceWith({
      is_action_legal: true,
      awarded_items: [],
      awarded_warehouse_items: [{ id: "W-X999" }],
    });
    assert.equal(checkDeterministicInvariant(t, inv), false);
  });
});

describe("missing evidence is fail-closed", () => {
  it("no parsedDmJson never auto-passes an expected=fail invariant", () => {
    const inv = { id: "any", check: "resource_conservation", expected: "fail", severity: "critical" };
    assert.equal(checkDeterministicInvariant(traceWith(undefined), inv), false);
  });

  it("no parsedDmJson never auto-passes an expected=pass invariant", () => {
    const inv = { id: "any", check: "resource_conservation", expected: "pass", severity: "critical" };
    assert.equal(checkDeterministicInvariant(traceWith(undefined), inv), false);
  });
});
