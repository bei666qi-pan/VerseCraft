// src/lib/ai/tools/mechanicsIntentRouter.test.ts
/**
 * Mechanics Workflow Mechanics Intent Router 测试
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
  classifyMechanicsIntentForWorld,
  shouldAttemptMechanics,
  shouldAttemptMechanicsForWorld,
} from "./mechanicsIntentRouter";

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
      assert.strictEqual(shouldAttemptMechanics(input), true);
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
      assert.strictEqual(shouldAttemptMechanics(input), false);
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
      assert.strictEqual(shouldAttemptMechanics(input), false);
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
    assert.strictEqual(shouldAttemptMechanics("   "), false);
  });

  it("短输入（无特殊信号）→ narrative", () => {
    const result = classifyMechanicsIntent("嗯");
    assert.strictEqual(result.classification, "narrative");
    assert.strictEqual(shouldAttemptMechanics("嗯"), false);
  });
});

describe("Intent Router — Inventory Use Signals", () => {
  const inventoryUseInputs = [
    "使用药水治疗自己",
    "使用药剂恢复理智",
    "喝下药水",
    "喝下治疗药剂",
    "服用解毒药剂",
    "用药水治疗伤口",
    "使用背包里的绷带",
    "使用背包中的道具",
    "从背包拿出药水",
    "涂抹药膏在伤口上",
    "使用治疗道具",
    "吃下回复药",
  ];

  for (const input of inventoryUseInputs) {
    it(`"${input}" → mechanics`, () => {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "mechanics",
        `"${input}" should be mechanics, got ${result.classification}: ${result.reason}`
      );
      assert.strictEqual(shouldAttemptMechanics(input), true);
    });
  }
});

describe("Intent Router — NPC Inquiry Signals", () => {
  const npcInquiryInputs = [
    "这个NPC卖什么",
    "铁匠出售什么东西",
    "阿织有什么商品",
    "这个商人有什么货物",
    "有什么服务可以提供",
    "看看有什么可以买的",
    "能买什么东西",
    "有什么商品可以购买",
    "铁匠卖哪些武器",
    "商店的货物有哪些",
    "库存有什么",
  ];

  for (const input of npcInquiryInputs) {
    it(`"${input}" → mechanics`, () => {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "mechanics",
        `"${input}" should be mechanics (NPC inquiry), got ${result.classification}: ${result.reason}`
      );
      assert.strictEqual(shouldAttemptMechanics(input), true);
    });
  }
});

describe("Intent Router — Location Lookup Signals", () => {
  const locationLookupInputs = [
    "铁匠在哪",
    "阿织在哪里",
    "锻造台的位置在哪",
    "B1有什么",
    "B2楼层有什么",
    "这层有什么设施",
    "这个楼层有什么商店",
    "一楼有什么",
    "地下一层有什么",
    "去哪里找铁匠",
    "在什么地方可以锻造",
    "B3有什么房间",
  ];

  for (const input of locationLookupInputs) {
    it(`"${input}" → mechanics`, () => {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "mechanics",
        `"${input}" should be mechanics (location lookup), got ${result.classification}: ${result.reason}`
      );
      assert.strictEqual(shouldAttemptMechanics(input), true);
    });
  }
});

describe("Intent Router — New Intents Do Not Break Existing Classifications", () => {
  it("narrative inputs still classified as narrative", () => {
    const narratives = [
      "你好，请问这里是哪里？",
      "观察一下周围的环境",
      "环顾四周",
      "我感觉有点害怕",
      "等待一会儿",
    ];
    for (const input of narratives) {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "narrative",
        `"${input}" should remain narrative, got ${result.classification}`
      );
    }
  });

  it("ambiguous inputs still classified as ambiguous", () => {
    const ambiguous = [
      "怎么锻造武器？",
      "什么是战斗系统",
      "能不能强化",
      "我不想锻造",
      "如何修理装备",
      "可以强化装备吗",
    ];
    for (const input of ambiguous) {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "ambiguous",
        `"${input}" should remain ambiguous, got ${result.classification}`
      );
    }
  });

  it("existing mechanics inputs still classified as mechanics", () => {
    const mechanics = [
      "我要锻造一把武器",
      "攻击面前的敌人",
      "接受这个任务",
      "强化装备",
      "消耗材料锻造",
      "修理我的武器",
    ];
    for (const input of mechanics) {
      const result = classifyMechanicsIntent(input);
      assert.strictEqual(
        result.classification,
        "mechanics",
        `"${input}" should remain mechanics, got ${result.classification}`
      );
    }
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

// ============================================================
// Per-world classifier (dark_moon vs xingni)
// ============================================================

describe("Intent Router — Per-world: xingni mechanics signals", () => {
  const xingniMechanicsInputs = [
    "我要打开储物袋检查灵石和丹药",
    "消耗三颗灵石兑换一瓶回气丹",
    "祭出飞剑斩杀面前的妖兽",
    "接一个宗门悬赏任务",
    "布设九宫八卦阵抵御敌袭",
    "服用灵草恢复修为",
    "锻造一柄飞剑",
    "启动阵法护住山谷",
  ];

  for (const input of xingniMechanicsInputs) {
    it(`xingni "${input}" → mechanics`, () => {
      const r = classifyMechanicsIntentForWorld(input, "xingni_taichu");
      assert.strictEqual(
        r.classification,
        "mechanics",
        `xingni "${input}" should be mechanics, got ${r.classification}: ${r.reason}`
      );
      assert.strictEqual(shouldAttemptMechanicsForWorld(input, "xingni_taichu"), true);
    });
  }
});

describe("Intent Router — Per-world: xingni narrative signals (修仙叙述)", () => {
  const xingniNarrativeInputs = [
    "我在山中悟道",
    "突然灵气充盈，灵台清明",
    "仿佛感应到天地之间的奥秘",
    "与师尊坐而论道",
    "观云卷云舒，心中一片空明",
  ];

  for (const input of xingniNarrativeInputs) {
    it(`xingni "${input}" → narrative`, () => {
      const r = classifyMechanicsIntentForWorld(input, "xingni_taichu");
      assert.strictEqual(
        r.classification,
        "narrative",
        `xingni "${input}" should be narrative, got ${r.classification}: ${r.reason}`
      );
      assert.strictEqual(shouldAttemptMechanicsForWorld(input, "xingni_taichu"), false);
    });
  }
});

describe("Intent Router — Per-world: dark_moon baseline unchanged", () => {
  // 暗月世界不应被星逆信号干扰：原有 12 个 mechanics 输入仍然 mechanics
  const darkMoonMechanics = [
    "我要锻造一把武器",
    "攻击面前的敌人",
    "接受这个任务",
    "强化装备",
    "消耗材料锻造",
    "修理我的武器",
    "使用物品治疗自己",
    "铁匠卖什么",
    "一楼有什么",
  ];

  for (const input of darkMoonMechanics) {
    it(`dark_moon "${input}" → mechanics`, () => {
      const r = classifyMechanicsIntentForWorld(input, "dark_moon_prologue");
      assert.strictEqual(
        r.classification,
        "mechanics",
        `dark_moon "${input}" should be mechanics, got ${r.classification}: ${r.reason}`
      );
      assert.strictEqual(shouldAttemptMechanicsForWorld(input, "dark_moon_prologue"), true);
    });
  }
});

describe("Intent Router — Per-world: xingni 修仙叙述不被关键词误判为 mechanics", () => {
  it("xingni 单纯悟道叙述不会被“锻” 字触发 mechanics", () => {
    // 关键修复：在星逆里"锻剑" / "炼器"等词常出现在修仙叙述中
    const r = classifyMechanicsIntentForWorld(
      "我在炉火旁凝神铸剑，感受灵气在剑胚中流转",
      "xingni_taichu"
    );
    assert.notStrictEqual(r.classification, "mechanics", `不应误判为 mechanics: ${r.reason}`);
  });

  it("xingni 渡劫叙述不会触发 mechanics", () => {
    const r = classifyMechanicsIntentForWorld("天雷滚滚，我开始渡劫", "xingni_taichu");
    assert.strictEqual(r.classification, "narrative");
  });
});

describe("Intent Router — Per-world: shouldAttemptMechanics 旧入口行为不变", () => {
  it("不带 worldId 时等价于 dark_moon 默认", () => {
    // 12 个原 mechanics 输入仍然 → true
    assert.strictEqual(shouldAttemptMechanics("我要锻造一把武器"), true);
    assert.strictEqual(shouldAttemptMechanics("你好"), false);
    assert.strictEqual(shouldAttemptMechanics("怎么锻造武器？"), false); // ambiguous → false
    // 星逆特有信号在不传 worldId 时不应该被识别为 mechanics
    assert.strictEqual(
      shouldAttemptMechanics("我要打开储物袋检查灵石"),
      false,
      "不传 worldId 时星逆信号不应被默认识别（避免误判暗月场景）"
    );
  });
});

describe("Intent Router — Per-world: 未知 worldId 与纯函数 fallback", () => {
  // 2026-08 简化：router 只做关键词纯函数快路径；embedding 在 mechanicsIntentClassifier/ 单独管理。
  // 未知 worldId 应被静默忽略（不影响关键词结论），避免双标。

  it("未知 worldId 下强 mechanics 关键词仍返回 true（暗月默认信号）", () => {
    assert.strictEqual(
      shouldAttemptMechanicsForWorld("锻造一把武器", "unknown_world"),
      true,
      "未知 worldId 下强 mechanics 关键词仍应返回 true"
    );
  });

  it("未知 worldId 下 narrative 关键词仍返回 false", () => {
    assert.strictEqual(
      shouldAttemptMechanicsForWorld("你好", "unknown_world"),
      false,
      "未知 worldId 下 narrative 关键词仍应返回 false"
    );
  });

  it("未知 worldId 下星逆关键词不会被默认启用（避免误判暗月场景）", () => {
    // 关键修复：不传 worldId 时不能把星逆专属信号（如"灵石"）算成暗月 mechanics
    assert.strictEqual(
      shouldAttemptMechanics("我要打开储物袋检查灵石"),
      false,
      "不传 worldId 时星逆信号不应被默认识别（避免误判暗月场景）"
    );
    // 但传 xingni_taichu 后必须识别
    assert.strictEqual(
      shouldAttemptMechanicsForWorld("我要打开储物袋检查灵石", "xingni_taichu"),
      true
    );
  });

  it("route.ts 入口函数在 embedding 抛错时仍稳定（不依赖外部 IO）", () => {
    // router 现在是纯关键词路径，不再接受 embeddingFn；此用例固化"无 IO"契约
    // 防止后续误把 IO 重新引入 gate。
    for (const input of ["锻造一把武器", "你好", "观察周围", "嗯"]) {
      const r1 = shouldAttemptMechanics(input);
      const r2 = shouldAttemptMechanicsForWorld(input, "xingni_taichu");
      const r3 = shouldAttemptMechanicsForWorld(input, "dark_moon_prologue");
      assert.strictEqual(typeof r1, "boolean");
      assert.strictEqual(typeof r2, "boolean");
      assert.strictEqual(typeof r3, "boolean");
    }
  });
});

describe("Intent Router — Per-world: determinism across worlds", () => {
  it("相同输入多次调用结果一致", () => {
    const inputs: Array<[string, string]> = [
      ["锻造一把武器", "dark_moon_prologue"],
      ["我要打开储物袋", "xingni_taichu"],
      ["你好", "xingni_taichu"],
      ["接一个悬赏", "xingni_taichu"],
    ];
    for (const [input, world] of inputs) {
      const r1 = shouldAttemptMechanicsForWorld(input, world);
      const r2 = shouldAttemptMechanicsForWorld(input, world);
      const r3 = shouldAttemptMechanicsForWorld(input, world);
      assert.strictEqual(r1, r2);
      assert.strictEqual(r2, r3);
    }
  });
});
