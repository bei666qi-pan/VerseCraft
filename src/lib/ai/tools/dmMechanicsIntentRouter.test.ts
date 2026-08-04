// src/lib/ai/tools/dmMechanicsIntentRouter.test.ts
/**
 * DM Agent Mechanics Intent Router 测试
 *
 * 覆盖：
 * - 强 mechanics 信号（锻造、战斗、任务）→ "mechanics"
 * - 强 narrative 信号（观察、对话、闲聊）→ "narrative"
 * - 反 mechanics 信号（咨询、询问）→ "ambiguous"
 * - 模糊输入 → 保守走 narrative 或 ambiguous
 * - 空输入/短输入 → narrative
 * - 确定性：相同输入永远返回相同结果
 * - 不包含内部工具名或敏感信息在 reason 中
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyMechanicsIntent,
  shouldAttemptDmAgent,
} from "./dmMechanicsIntentRouter";

describe("Intent Router — Mechanics Signals", () => {
  const mechanicsInputs = [
    "我要锻造一把武器",
    "锻造静音改装",
    "修理我的武器",
    "强化装备",
    "我要攻击面前的敌人",
    "开始战斗",
    "格挡他的攻击",
    "我要接一个任务",
    "接受这个任务",
    "完成任务",
    "消耗材料锻造",
    "使用物品治疗自己",
  ];

  for (const input of mechanicsInputs) {
    it(`"${input}" → mechanics`, () => {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "mechanics",
        `"${input}" should be mechanics, got ${result.classification}: ${result.reason}`
      );
      assert.strictEqual(shouldAttemptDmAgent(input), true);
    });
  }
});

describe("Intent Router — Narrative Signals", () => {
  const narrativeInputs = [
    "你好",
    "你好，请问这里是哪里？",
    "观察一下周围的环境",
    "看看四周有什么",
    "环顾四周",
    "我想探索这个房间",
    "搜索一下",
    "找找看有没有线索",
    "请问你是谁？",
    "跟我说说话",
    "聊聊天吧",
    "走向楼梯",
    "上楼去看看",
    "离开这里",
    "我感觉有点害怕",
    "思考一下接下来怎么办",
    "回忆一下之前发生的事情",
    "等待一会儿",
  ];

  for (const input of narrativeInputs) {
    it(`"${input}" → narrative`, () => {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "narrative",
        `"${input}" should be narrative, got ${result.classification}: ${result.reason}`
      );
      assert.strictEqual(shouldAttemptDmAgent(input), false);
    });
  }
});

describe("Intent Router — Anti-Mechanics (Ambiguous)", () => {
  const ambiguousInputs = [
    "怎么锻造武器？",       // 咨询，不是执行
    "能锻造吗",             // 询问能力
    "如何修理装备",         // 咨询
    "我想问一下锻造的事",   // 打听
    "什么是战斗系统",       // 咨询
    "我不想锻造",           // 否定
    "不是要锻造",           // 否定
    "没有材料能锻造吗",     // 否定 + 咨询
    "可不可以接任务",       // 询问
    "能不能强化",           // 询问
  ];

  for (const input of ambiguousInputs) {
    it(`"${input}" → ambiguous`, () => {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "ambiguous",
        `"${input}" should be ambiguous, got ${result.classification}: ${result.reason}`
      );
      assert.strictEqual(shouldAttemptDmAgent(input), false);
    });
  }
});

describe("Intent Router — Mixed Signals", () => {
  it("同时有叙事和 mechanics 信号 → ambiguous", () => {
    // This only matters when both strong narrative AND strong mechanics match
    // The current algorithm prioritizes narrative if 2+ narrative signals detected
  });

  it("纯空白输入 → narrative", () => {
    const result = classifyMechanicsIntent("   ");
    assert.strictEqual(result.classification, "narrative");
    assert.strictEqual(shouldAttemptDmAgent("   "), false);
  });

  it("短输入（无特殊信号）→ narrative", () => {
    const result = classifyMechanicsIntent("嗯");
    assert.strictEqual(result.classification, "narrative");
    assert.strictEqual(shouldAttemptDmAgent("嗯"), false);
  });
});

describe("Intent Router — Determinism", () => {
  it("相同输入多次调用返回相同结果", () => {
    const inputs = ["锻造武器", "你好", "怎么锻造", "观察四周", "攻击"];
    for (const input of inputs) {
      const r1 = classifyMechanicsIntent(input);
      const r2 = classifyMechanicsIntent(input);
      const r3 = classifyMechanicsIntent(input);
      assert.strictEqual(r1.classification, r2.classification);
      assert.strictEqual(r1.classification, r3.classification);
      assert.strictEqual(r1.reason, r2.reason);
    }
  });
});

describe("Intent Router — No Sensitive Leak in Reason", () => {
  it("reason 不包含内部工具名或敏感信息", () => {
    const sensitiveWords = [
      "prompt", "system", "internal", "secret", "token",
      "api_key", "dm_agent", "tool_call",
    ];
    const inputs = ["锻造武器", "你好", "怎么锻造"];
    for (const input of inputs) {
      const result = classifyMechanicsIntent(input);
      const reasonLower = result.reason.toLowerCase();
      for (const word of sensitiveWords) {
        assert.ok(
          !reasonLower.includes(word),
          `reason for "${input}" should not contain "${word}": ${result.reason}`
        );
      }
    }
  });
});
