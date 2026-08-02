/**
 * Forge / resource state-invariant tests (第九节审计).
 *
 * The invariants must verify final STATE, not the model's self-reported
 * is_action_legal claim: an "attempt" may be legal while the forge itself
 * must fail (no item created, no materials/currency consumed, narrative
 * must not claim success).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkDeterministicInvariant } from "./orchestrator";
import type { SelfImproveTrace } from "./types";

function traceWith(dmJson: Record<string, unknown>): SelfImproveTrace {
  return { parsedDmJson: dmJson } as unknown as SelfImproveTrace;
}

const forgePassInv = { id: "no_forge_without_mats", check: "forge_transaction", expected: "pass", severity: "critical" };
const conservePassInv = { id: "materials_not_consumed", check: "resource_conservation", expected: "pass", severity: "critical" };

describe("forge_transaction state invariant", () => {
  it("passes when attempt is legal but no item is forged and narrative admits failure", () => {
    const t = traceWith({
      is_action_legal: true, // 尝试动作合法，但状态结果必须失败
      awarded_items: [],
      narrative: "你试着捶打矿石，但材料不足，锻造失败。",
    });
    assert.equal(checkDeterministicInvariant(t, forgePassInv), true);
  });

  it("passes for the canonical mock failure narrative", () => {
    const t = traceWith({
      is_action_legal: false,
      awarded_items: [],
      currency_change: 0,
      narrative: "[Mock] 材料不足，无法锻造。所需材料不满足，锻造失败。",
    });
    assert.equal(checkDeterministicInvariant(t, forgePassInv), true);
  });

  it("fails when a forged item is awarded despite insufficient materials", () => {
    const t = traceWith({
      is_action_legal: true,
      awarded_items: [{ id: "long-sword", name: "长剑" }],
      narrative: "你成功锻造了一把长剑。",
    });
    assert.equal(checkDeterministicInvariant(t, forgePassInv), false);
  });

  it("fails when a forged item lands in the warehouse", () => {
    const t = traceWith({
      is_action_legal: true,
      awarded_items: [],
      awarded_warehouse_items: [{ id: "long-sword" }],
      narrative: "长剑已放入仓库。",
    });
    assert.equal(checkDeterministicInvariant(t, forgePassInv), false);
  });

  it("fails when narrative claims success without any failure admission", () => {
    const t = traceWith({
      is_action_legal: true,
      awarded_items: [],
      narrative: "你成功锻造出了长剑，剑身在火光中闪闪发亮。",
    });
    assert.equal(checkDeterministicInvariant(t, forgePassInv), false);
  });

  it("does not rely on is_action_legal alone (old escape: expected=pass meant legal===true)", () => {
    // Old logic passed whenever is_action_legal === true, even if the model
    // forged the item. The state invariant must catch that.
    const t = traceWith({
      is_action_legal: true,
      awarded_items: [{ id: "sword" }],
      narrative: "锻造成功完成。",
    });
    assert.equal(checkDeterministicInvariant(t, forgePassInv), false);
  });
});

describe("resource_conservation state invariant", () => {
  it("passes when nothing is awarded or charged", () => {
    const t = traceWith({ awarded_items: [], currency_change: 0 });
    assert.equal(checkDeterministicInvariant(t, conservePassInv), true);
  });

  it("fails when items are awarded (old escape: pass was always true)", () => {
    const t = traceWith({ awarded_items: [{ id: "iron-ore" }] });
    assert.equal(checkDeterministicInvariant(t, conservePassInv), false);
  });

  it("fails when currency is wrongly deducted", () => {
    const t = traceWith({ awarded_items: [], currency_change: -50 });
    assert.equal(checkDeterministicInvariant(t, conservePassInv), false);
  });
});
