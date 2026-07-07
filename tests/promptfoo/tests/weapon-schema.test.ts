/**
 * 武器 Schema 确定性断言 — Node Test 版本
 *
 * 与 promptfooconfig.yaml 中的 weapon-schema.yaml 对应。
 * 使用 Node 内置测试运行器 + mock provider 实现离线秒级断言。
 *
 * 运行: pnpm dlx tsx --test tests/promptfoo/tests/weapon-schema.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  VALID_INFUSIONS,
  VALID_MOD_SLOTS,
  VALID_WEAPON_TIERS,
  validateDmJsonRequiredFields,
  validateOptions,
  validateWeaponUpdates,
} from "../assertions/schema-validators";

// === Mock 输出（模拟 AI 响应） ===

interface DmJsonOutput {
  [key: string]: unknown;
  narrative: string;
  is_action_legal: boolean;
  sanity_damage: number;
  is_death: boolean;
  weapon_updates?: Record<string, unknown>;
  awarded_items?: Array<{ id: string; name: string }>;
  options: string[];
}

/**
 * 生成合法的 mock DM JSON（基准）
 */
function mockValidOutput(): DmJsonOutput {
  return {
    narrative: "你握紧武器，感受着它在手中的熟悉质感。走廊的尽头有微光闪烁——不是灯光，是更深的、缓慢呼吸的黑色。武器微微颤动，像是在警告你。你深吸一口气，准备应对接下来的挑战。",
    is_action_legal: true,
    sanity_damage: 2,
    is_death: false,
    weapon_updates: {
      stability: 75,
      contamination: 5,
      counter: "目眩",
      tier: "C",
    },
    awarded_items: [
      { id: "WPN-001", name: "静默短棍" },
    ],
    options: ["向前推进", "后退观察", "呼叫同伴", "检查周围"],
  };
}

describe("武器 Schema 校验 — 确定性断言", () => {
  describe("必填字段完整性", () => {
    it("合法输出应通过所有必填字段校验", () => {
      const output = mockValidOutput();
      const errors = validateDmJsonRequiredFields(output);
      assert.equal(errors.length, 0, `不应有错误: ${errors.join("; ")}`);
    });

    it("缺少 narrative 字段应报错", () => {
      const output = { ...mockValidOutput(), narrative: undefined as unknown as string };
      const errors = validateDmJsonRequiredFields(output);
      assert.ok(errors.some((e) => e.includes("narrative")), "应报 narrative 缺失");
    });

    it("缺少 is_action_legal 字段应报错", () => {
      const output = { ...mockValidOutput(), is_action_legal: undefined as unknown as boolean };
      const errors = validateDmJsonRequiredFields(output);
      assert.ok(errors.some((e) => e.includes("is_action_legal")), "应报 is_action_legal 缺失");
    });

    it("缺少 sanity_damage 字段应报错", () => {
      const output = { ...mockValidOutput(), sanity_damage: undefined as unknown as number };
      const errors = validateDmJsonRequiredFields(output);
      assert.ok(errors.some((e) => e.includes("sanity_damage")), "应报 sanity_damage 缺失");
    });

    it("缺少 is_death 字段应报错", () => {
      const output = { ...mockValidOutput(), is_death: undefined as unknown as boolean };
      const errors = validateDmJsonRequiredFields(output);
      assert.ok(errors.some((e) => e.includes("is_death")), "应报 is_death 缺失");
    });

    it("narrative 过短应报错", () => {
      const output = { ...mockValidOutput(), narrative: "短" };
      const errors = validateDmJsonRequiredFields(output);
      assert.ok(errors.some((e) => e.includes("narrative")), "应报 narrative 过短");
    });

    it("sanity_damage 为负数应报错", () => {
      const output = { ...mockValidOutput(), sanity_damage: -5 };
      const errors = validateDmJsonRequiredFields(output);
      assert.ok(errors.some((e) => e.includes("sanity_damage")), "应报 sanity_damage 为负");
    });
  });

  describe("weapon_updates 结构校验", () => {
    it("合法的 weapon_updates 应通过", () => {
      const errors = validateWeaponUpdates({
        stability: 80,
        contamination: 3,
        counter: "目眩",
        tier: "C",
      });
      assert.equal(errors.length, 0, `不应有错误: ${errors.join("; ")}`);
    });

    it("stability > 100 应报错", () => {
      const errors = validateWeaponUpdates({ stability: 150 });
      assert.ok(errors.some((e) => e.includes("stability")), "应报 stability 溢出");
    });

    it("stability < 0 应报错", () => {
      const errors = validateWeaponUpdates({ stability: -10 });
      assert.ok(errors.some((e) => e.includes("stability")), "应报 stability 为负");
    });

    it("stability 非数字应报错", () => {
      const errors = validateWeaponUpdates({ stability: "high" });
      assert.ok(errors.some((e) => e.includes("stability")), "应报 stability 非数字");
    });

    it("contamination > 100 应报错", () => {
      const errors = validateWeaponUpdates({ contamination: 200 });
      assert.ok(errors.some((e) => e.includes("contamination")), "应报 contamination 溢出");
    });

    it("contamination < 0 应报错", () => {
      const errors = validateWeaponUpdates({ contamination: -1 });
      assert.ok(errors.some((e) => e.includes("contamination")), "应报 contamination 为负");
    });

    it("非法的 tier 应报错", () => {
      const errors = validateWeaponUpdates({ tier: "X" });
      assert.ok(errors.some((e) => e.includes("tier")), "应报非法 tier");
    });

    it("合法的 tier 应通过", () => {
      for (const tier of VALID_WEAPON_TIERS) {
        const errors = validateWeaponUpdates({ tier });
        assert.equal(errors.length, 0, `tier ${tier} 应通过`);
      }
    });

    it("非法的 infusion 应报错", () => {
      const errors = validateWeaponUpdates({ infusion: "nuclear" });
      assert.ok(errors.some((e) => e.includes("infusion")), "应报非法 infusion");
    });

    it("合法的 infusion 应通过", () => {
      for (const infusion of VALID_INFUSIONS) {
        const errors = validateWeaponUpdates({ infusion });
        assert.equal(errors.length, 0, `infusion ${infusion} 应通过`);
      }
    });

    it("null infusion 应通过（允许未灌注）", () => {
      const errors = validateWeaponUpdates({ infusion: null });
      assert.equal(errors.length, 0, "null infusion 应通过");
    });

    it("非法的 mod_type 应报错", () => {
      const errors = validateWeaponUpdates({ mod_type: "ultra" });
      assert.ok(errors.some((e) => e.includes("mod_type")), "应报非法 mod_type");
    });

    it("合法的 mod_type 应通过", () => {
      for (const mod of VALID_MOD_SLOTS) {
        const errors = validateWeaponUpdates({ mod_type: mod });
        assert.equal(errors.length, 0, `mod_type ${mod} 应通过`);
      }
    });

    it("counter 为空字符串应报错", () => {
      const errors = validateWeaponUpdates({ counter: "" });
      assert.ok(errors.some((e) => e.includes("counter")), "应报空 counter");
    });

    it("counter 为合法字符串应通过", () => {
      const errors = validateWeaponUpdates({ counter: "目眩" });
      assert.equal(errors.length, 0);
    });

    it("无 weapon_updates 时不报错（可选字段）", () => {
      const errors = validateWeaponUpdates(undefined);
      assert.equal(errors.length, 0);
    });
  });

  describe("options 数组校验", () => {
    it("2-4个合法选项应通过", () => {
      assert.equal(validateOptions(["前进", "后退", "观察"]).length, 0);
    });

    it("只有1个选项应报错", () => {
      const errors = validateOptions(["仅此一项"]);
      assert.ok(errors.length > 0, "应报选项不足");
    });

    it("超过4个选项应报错", () => {
      const errors = validateOptions(["一", "二", "三", "四", "五"]);
      assert.ok(errors.length > 0, "应报选项过多");
    });

    it("选项含空字符串应报错", () => {
      const errors = validateOptions(["有效选项", ""]);
      assert.ok(errors.some((e) => e.includes("非空")), "应报空选项");
    });

    it("非数组应报错", () => {
      const errors = validateOptions("不是数组");
      assert.ok(errors.length > 0, "应报非数组");
    });
  });

  describe("awarded_items 结构校验", () => {
    it("物品必须有 id 和 name", () => {
      const output = mockValidOutput();
      const items = output.awarded_items ?? [];
      for (const item of items) {
        assert.ok(typeof item.id === "string" && item.id.length > 0, `物品应有有效 id: ${JSON.stringify(item)}`);
        assert.ok(typeof item.name === "string" && item.name.length > 0, `物品应有有效 name: ${JSON.stringify(item)}`);
      }
    });
  });
});
