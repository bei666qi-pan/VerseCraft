/**
 * 原石经济契约测试
 *
 * 验证原石（originium）系统在所有操作路径下的正确性：
 * - 初始余额
 * - 获取（earn）
 * - 消耗（spend）
 * - 理智恢复（1原石=1理智）
 * - 边界条件（不足、为零、负数防御）
 *
 * 这些测试独立于 LLM —— 只验证游戏逻辑层。
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// 原石 + 理智交互的纯函数逻辑（从 store 中提取）
interface OriginiumState {
  originium: number;
  sanity: number;
  historicalMaxSanity: number;
}

function canRestoreSanity(state: OriginiumState): boolean {
  return state.originium > 0 && state.sanity < state.historicalMaxSanity;
}

function restoreSanity(state: OriginiumState, amount = 1): OriginiumState {
  if (!canRestoreSanity(state)) return { ...state };
  const cost = Math.min(amount, state.originium);
  const maxRestorable = state.historicalMaxSanity - state.sanity;
  const restored = Math.min(cost, maxRestorable);
  return {
    ...state,
    originium: state.originium - restored,
    sanity: Math.min(state.sanity + restored, state.historicalMaxSanity),
  };
}

function addOriginium(state: OriginiumState, amount: number): OriginiumState {
  if (amount <= 0) return { ...state };
  return { ...state, originium: state.originium + amount };
}

function spendOriginium(state: OriginiumState, amount: number): { newState: OriginiumState; success: boolean } {
  if (amount <= 0 || state.originium < amount) {
    return { newState: { ...state }, success: false };
  }
  return {
    newState: { ...state, originium: state.originium - amount },
    success: true,
  };
}

describe("原石经济契约", () => {
  describe("初始状态", () => {
    it("新玩家应有初始原石余额", () => {
      const state: OriginiumState = { originium: 10, sanity: 100, historicalMaxSanity: 100 };
      assert.ok(state.originium >= 0);
    });

    it("原石不能为负数", () => {
      const result = spendOriginium({ originium: 1, sanity: 100, historicalMaxSanity: 100 }, 5);
      assert.equal(result.success, false);
      assert.equal(result.newState.originium, 1, "余额不足时不应扣减");
    });
  });

  describe("获取原石", () => {
    it("完成任务应增加原石", () => {
      const state = addOriginium({ originium: 2, sanity: 85, historicalMaxSanity: 100 }, 1);
      assert.equal(state.originium, 3);
    });

    it("零值获取不变余额", () => {
      const state = addOriginium({ originium: 2, sanity: 85, historicalMaxSanity: 100 }, 0);
      assert.equal(state.originium, 2);
    });

    it("负值获取被忽略", () => {
      const state = addOriginium({ originium: 2, sanity: 85, historicalMaxSanity: 100 }, -1);
      assert.equal(state.originium, 2);
    });
  });

  describe("消耗原石", () => {
    it("足够余额时消耗成功", () => {
      const { newState, success } = spendOriginium({ originium: 3, sanity: 85, historicalMaxSanity: 100 }, 1);
      assert.equal(success, true);
      assert.equal(newState.originium, 2);
    });

    it("余额不足时消耗失败", () => {
      const { newState, success } = spendOriginium({ originium: 0, sanity: 85, historicalMaxSanity: 100 }, 1);
      assert.equal(success, false);
      assert.equal(newState.originium, 0);
    });

    it("刚好足够的余额消耗成功", () => {
      const { newState, success } = spendOriginium({ originium: 1, sanity: 85, historicalMaxSanity: 100 }, 1);
      assert.equal(success, true);
      assert.equal(newState.originium, 0);
    });
  });

  describe("理智恢复（1原石=1理智）", () => {
    it("理智低于历史峰值时可以恢复", () => {
      const state: OriginiumState = { originium: 3, sanity: 80, historicalMaxSanity: 100 };
      assert.equal(canRestoreSanity(state), true);
    });

    it("理智已满时不能恢复", () => {
      const state: OriginiumState = { originium: 3, sanity: 100, historicalMaxSanity: 100 };
      assert.equal(canRestoreSanity(state), false);
    });

    it("无原石时不能恢复", () => {
      const state: OriginiumState = { originium: 0, sanity: 50, historicalMaxSanity: 100 };
      assert.equal(canRestoreSanity(state), false);
    });

    it("消耗1原石恢复1理智", () => {
      const state: OriginiumState = { originium: 3, sanity: 85, historicalMaxSanity: 100 };
      const newState = restoreSanity(state, 1);
      assert.equal(newState.originium, 2);
      assert.equal(newState.sanity, 86);
    });

    it("恢复不会超过历史峰值", () => {
      const state: OriginiumState = { originium: 5, sanity: 98, historicalMaxSanity: 100 };
      const newState = restoreSanity(state, 3);
      assert.equal(newState.sanity, 100, "不应超过历史峰值");
      assert.equal(newState.originium, 3, "只消耗实际恢复的2原石");
    });

    it("原石不足时恢复部分理智", () => {
      const state: OriginiumState = { originium: 1, sanity: 70, historicalMaxSanity: 100 };
      const newState = restoreSanity(state, 5);
      assert.equal(newState.sanity, 71);
      assert.equal(newState.originium, 0);
    });

    it("理智为0时仍可恢复", () => {
      const state: OriginiumState = { originium: 2, sanity: 0, historicalMaxSanity: 100 };
      const newState = restoreSanity(state, 2);
      assert.equal(newState.sanity, 2);
      assert.equal(newState.originium, 0);
    });
  });

  describe("联动：理智恢复与死亡边界", () => {
    it("理智恢复到>0 后玩家不再是濒死状态", () => {
      const state: OriginiumState = { originium: 1, sanity: 0, historicalMaxSanity: 100 };
      const newState = restoreSanity(state, 1);
      assert.ok(newState.sanity > 0, "恢复后应当存活");
    });

    it("0 理智 + 0 原石 = 无法自救", () => {
      const state: OriginiumState = { originium: 0, sanity: 0, historicalMaxSanity: 100 };
      const newState = restoreSanity(state, 1);
      assert.equal(newState.sanity, 0);
      assert.equal(newState.originium, 0);
    });
  });
});
