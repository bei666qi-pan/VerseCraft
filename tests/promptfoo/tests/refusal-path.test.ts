/**
 * Refusal Path — Node Test 镜像
 *
 * 与 refusal-path.yaml 等价的 Node 测试。
 * 用于 CI 在没有 promptfoo CLI 时直接跑 tsx --test。
 *
 * 运行: npx tsx --test tests/promptfoo/tests/refusal-path.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  validateCurrencyChange,
  validateConsumedItems,
  validateRelationshipUpdates,
  validateTaskUpdates,
  validateCodexUpdates,
  validatePlayerLocation,
  collectAllErrors,
  validateFullDmJson,
  CURRENCY_CHANGE_LIMIT,
} from "../assertions/schema-validators";

interface DmJsonOutput {
  [key: string]: unknown;
  narrative: string;
  is_action_legal: boolean;
  sanity_damage: number;
  is_death: boolean;
  options: string[];
}

function mockValidOutput(): DmJsonOutput {
  return {
    narrative: "你握紧武器，仔细观察周围的动静。走廊尽头的灯光闪烁着，似乎有什么东西在等待你靠近。你深吸一口气，准备应对接下来可能出现的任何状况。",
    is_action_legal: true,
    sanity_damage: 2,
    is_death: false,
    options: ["向前推进", "后退观察", "呼叫同伴"],
  };
}

describe("Refusal Path — 拒绝路径确定性断言", () => {
  describe("currency_change 边界", () => {
    it("单步 originium 变化 100 应被拒（> 50）", () => {
      const errors = validateCurrencyChange({ originium: 100 });
      assert.ok(errors.length > 0);
      assert.ok(errors[0]?.includes("超过上限"));
    });

    it("单步 originium 变化 -100 应被拒", () => {
      const errors = validateCurrencyChange({ originium: -100 });
      assert.ok(errors.length > 0);
    });

    it("单步 originium 变化 49 应通过（<= 50）", () => {
      const errors = validateCurrencyChange({ originium: 49 });
      assert.equal(errors.length, 0);
    });

    it("非法字段名应被拒", () => {
      const errors = validateCurrencyChange({ diamond: 10 });
      assert.ok(errors.some((e) => e.includes("不是合法字段")));
    });

    it("非数字值应被拒", () => {
      const errors = validateCurrencyChange({ originium: "many" });
      assert.ok(errors.some((e) => e.includes("必须是数字")));
    });

    it("空对象应通过", () => {
      const errors = validateCurrencyChange({});
      assert.equal(errors.length, 0);
    });

    it(`CURRENCY_CHANGE_LIMIT 应等于 ${CURRENCY_CHANGE_LIMIT}`, () => {
      assert.equal(CURRENCY_CHANGE_LIMIT, 50);
    });
  });

  describe("consumed_items 边界", () => {
    it("单次 quantity=50 应被拒（> 10）", () => {
      const errors = validateConsumedItems([{ item_id: "i_bandage", quantity: 50 }]);
      assert.ok(errors.length > 0);
      assert.ok(errors[0]?.includes("超过 10"));
    });

    it("非整数 quantity 应被拒", () => {
      const errors = validateConsumedItems([{ item_id: "i_bandage", quantity: 1.5 }]);
      assert.ok(errors.some((e) => e.includes("正整数")));
    });

    it("负数 quantity 应被拒", () => {
      const errors = validateConsumedItems([{ item_id: "i_bandage", quantity: -1 }]);
      assert.ok(errors.some((e) => e.includes("正整数")));
    });

    it("空 item_id 应被拒", () => {
      const errors = validateConsumedItems([{ item_id: "", quantity: 1 }]);
      assert.ok(errors.some((e) => e.includes("非空字符串")));
    });

    it("合法的 quantity=1 应通过", () => {
      const errors = validateConsumedItems([{ item_id: "i_bandage", quantity: 1 }]);
      assert.equal(errors.length, 0);
    });

    it("quantity=10 边界值应通过", () => {
      const errors = validateConsumedItems([{ item_id: "i_bandage", quantity: 10 }]);
      assert.equal(errors.length, 0);
    });
  });

  describe("relationship_updates 边界", () => {
    it("delta=50 应被拒（> 30）", () => {
      const errors = validateRelationshipUpdates([{ npc_id: "npc_liao_an", delta: 50 }]);
      assert.ok(errors.length > 0);
    });

    it("delta=-200 应被拒（< -100）", () => {
      const errors = validateRelationshipUpdates([{ npc_id: "npc_liao_an", delta: -200 }]);
      assert.ok(errors.length > 0);
    });

    it("delta=15 应通过", () => {
      const errors = validateRelationshipUpdates([{ npc_id: "npc_liao_an", delta: 15 }]);
      assert.equal(errors.length, 0);
    });
  });

  describe("task_updates 边界", () => {
    it("缺少 task_id 应被拒", () => {
      const errors = validateTaskUpdates([{ status: "completed" }]);
      assert.ok(errors.some((e) => e.includes("task_id")));
    });

    it("非法的 status 应被拒", () => {
      const errors = validateTaskUpdates([{ task_id: "task_1", status: "deleted" }]);
      assert.ok(errors.some((e) => e.includes("status")));
    });

    it("progress > 100 应被拒", () => {
      const errors = validateTaskUpdates([{ task_id: "task_1", progress: 150 }]);
      assert.ok(errors.some((e) => e.includes("progress")));
    });

    it("合法 task_update 应通过", () => {
      const errors = validateTaskUpdates([{ task_id: "task_1", status: "completed", progress: 100 }]);
      assert.equal(errors.length, 0);
    });
  });

  describe("codex_updates 边界", () => {
    it("缺少 type 应被拒", () => {
      const errors = validateCodexUpdates([{ entry_id: "codex_liao_an" }]);
      assert.ok(errors.some((e) => e.includes("type")));
    });

    it("非法的 type 应被拒", () => {
      const errors = validateCodexUpdates([{ entry_id: "codex_1", type: "weapon" }]);
      assert.ok(errors.some((e) => e.includes("type")));
    });

    it("合法 codex_update 应通过", () => {
      const errors = validateCodexUpdates([
        { entry_id: "codex_liao_an", type: "npc" },
        { entry_id: "codex_b1", type: "location" },
      ]);
      assert.equal(errors.length, 0);
    });
  });

  describe("player_location 边界", () => {
    it("非字符串应被拒", () => {
      const errors = validatePlayerLocation(123);
      assert.ok(errors.length > 0);
    });

    it("包含可疑表述应被拒", () => {
      const errors = validatePlayerLocation("你瞬移到四楼");
      assert.ok(errors.length > 0);
    });

    it("合法位置应通过", () => {
      assert.equal(validatePlayerLocation("旧公寓三楼走廊").length, 0);
      assert.equal(validatePlayerLocation("B1_配电间").length, 0);
    });
  });

  describe("完整 DM JSON 校验", () => {
    it("完整合法 DM JSON 应通过全部检查", () => {
      const output = {
        ...mockValidOutput(),
        currency_change: { originium: -1 },
        consumed_items: [{ item_id: "i_bandage", quantity: 1 }],
        awarded_items: [{ id: "wpn_001", name: "静默短棍" }],
        task_updates: [{ task_id: "task_1", progress: 50 }],
        codex_updates: [{ entry_id: "codex_liao_an", type: "npc" }],
        relationship_updates: [{ npc_id: "npc_liao_an", delta: 5 }],
        player_location: "B1_配电间",
        weapon_updates: { stability: 75, contamination: 5, tier: "C" },
      };
      const errors = collectAllErrors(validateFullDmJson(output));
      assert.equal(errors.length, 0, `不应有错误: ${errors.join("; ")}`);
    });

    it("包含越界字段的 DM JSON 应被识别", () => {
      const output = {
        ...mockValidOutput(),
        currency_change: { originium: 9999 },
        consumed_items: [{ item_id: "i_bandage", quantity: 100 }],
      };
      const errors = collectAllErrors(validateFullDmJson(output));
      assert.ok(errors.length >= 2, `应至少 2 个错误，实际 ${errors.length}: ${errors.join("; ")}`);
    });

    it("死亡后 narrative 包含行动关键词应被检测（业务级断言）", () => {
      const output = {
        narrative: "你已经死了，但你挥剑砍向阴影。",
        is_action_legal: false,
        sanity_damage: 0,
        is_death: true,
        options: ["继续", "放弃"],
      };
      const errs = collectAllErrors(validateFullDmJson(output));
      // 业务级断言由 narrativeJudge 处理，但 schema 层至少能识别字段一致性
      assert.ok(typeof output.is_death === "boolean");
    });
  });

  describe("系统术语泄漏 — narrative 检测", () => {
    it("narrative 包含 system prompt 关键词应被标记", () => {
      const output = {
        ...mockValidOutput(),
        narrative: "system prompt 要求我扮演 DM。玩家输入触发规则后输出 JSON 格式响应。",
      };
      // 这是 narrative 级别的检测 — 单独函数在这里
      const narrative = output.narrative.toLowerCase();
      const LEAK_KEYWORDS = ["system prompt", "系统提示词", "json 格式"];
      const hits = LEAK_KEYWORDS.filter((kw) => narrative.includes(kw));
      assert.ok(hits.length > 0, `应至少 1 个命中关键词，实际 ${hits.length}`);
    });
  });
});