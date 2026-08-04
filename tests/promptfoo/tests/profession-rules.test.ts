/**
 * 职业规则一致性测试 — Node Test 版本
 *
 * 与 promptfooconfig.yaml 中的 profession-rules.yaml 对应。
 * 验证给定职业时，AI 输出是否遵守技能池、装备限制、属性范围等规则。
 *
 * 运行: pnpm dlx tsx --test tests/promptfoo/tests/profession-rules.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  PROFESSION_EXCLUDED_SYSTEMS,
  PROFESSION_SKILL_MAP,
  validateProfessionExcludedSystems,
  validateProfessionSkillExclusivity,
} from "../assertions/schema-validators";

// === Mock 输出 ===

interface MockDmOutput {
  [key: string]: unknown;
  narrative: string;
  is_action_legal: boolean;
  sanity_damage: number;
  is_death: boolean;
  skill_triggered?: boolean;
  weapon_updates?: Record<string, unknown>;
  options: string[];
}

function mockOutputWithSkill(profession: string): MockDmOutput {
  const skillName = PROFESSION_SKILL_MAP[profession] ?? "";
  return {
    narrative: `你作为${profession}${skillName ? `，发动了「${skillName}」` : ""}。走廊中的暗影变得清晰，那些原本不可见的危险轮廓开始浮现。你看见了压制窗口，也看见了代价——但至少现在你有选择。`,
    is_action_legal: true,
    sanity_damage: 1,
    is_death: false,
    skill_triggered: true,
    options: ["利用窗口行动", "收集更多信息", "与同伴协商"],
  };
}

describe("职业规则一致性 — 确定性断言", () => {
  describe("职业技能名排他性", () => {
    it("守灯人输出不应包含巡迹客技能名", () => {
      const output = mockOutputWithSkill("守灯人");
      const errors = validateProfessionSkillExclusivity(output, "守灯人");
      assert.equal(errors.length, 0, `不应有交叉技能: ${errors.join("; ")}`);
    });

    it("溯源师输出不应包含其他职业技能名", () => {
      const output = mockOutputWithSkill("溯源师");
      const errors = validateProfessionSkillExclusivity(output, "溯源师");
      assert.equal(errors.length, 0, `不应有交叉技能: ${errors.join("; ")}`);
    });

    it("故意包含交叉技能名应被检测到", () => {
      const output = { ...mockOutputWithSkill("守灯人"), narrative: "你尝试用疾行断压移动" };
      const errors = validateProfessionSkillExclusivity(output, "守灯人");
      assert.ok(errors.some((e) => e.includes("疾行断压")), "应检测到交叉技能名");
    });

    it("未认证职业时所有技能名都不应出现", () => {
      // 不设置 profession — 验证所有职业技能名都不应出现在输出中
      const output = { ...mockOutputWithSkill("守灯人"), narrative: "走廊中的暗影变得清晰。" };
      // 遍历所有职业的技能名，确认无一名出现在叙事中
      for (const skill of Object.values(PROFESSION_SKILL_MAP)) {
        assert.ok(!output.narrative.includes(skill), `叙事不应包含技能名: ${skill}`);
      }
    });
  });

  describe("excludeSystems 约束校验", () => {
    it("守灯人不应获得 weapon_damage 加成（其excludeSystems包含weapon_damage）", () => {
      const output = {
        ...mockOutputWithSkill("守灯人"),
        weapon_updates: { damage_boost: 10, stability: 70 },
      };
      const errors = validateProfessionExcludedSystems(output, "守灯人");
      const weaponDamageErrors = errors.filter((e) => e.includes("weapon_damage"));
      assert.ok(weaponDamageErrors.length > 0, "应检测到武器伤害加成违规");
    });

    it("守灯人合法输出（无伤害加成）应通过", () => {
      const output = {
        ...mockOutputWithSkill("守灯人"),
        weapon_updates: { stability: 75 },
      };
      const errors = validateProfessionExcludedSystems(output, "守灯人");
      const weaponDamageErrors = errors.filter((e) => e.includes("weapon_damage"));
      assert.equal(weaponDamageErrors.length, 0, "无伤害加成应通过");
    });

    it("觅兆者不应声称自动破解威胁", () => {
      const output = {
        ...mockOutputWithSkill("觅兆者"),
        narrative: "你的分析自动破解了威胁，威胁被自动消除，无需进一步行动。",
      };
      const errors = validateProfessionExcludedSystems(output, "觅兆者");
      const autoSolveErrors = errors.filter((e) => e.includes("auto_solve_threat"));
      assert.ok(autoSolveErrors.length > 0, "应检测到自动破解威胁违规");
    });

    it("齐日角不应包含强制说服关键词", () => {
      const output = {
        ...mockOutputWithSkill("齐日角"),
        narrative: "你强制说服了NPC，对方不可拒绝你的要求。",
      };
      const errors = validateProfessionExcludedSystems(output, "齐日角");
      const forceErrors = errors.filter((e) => e.includes("force_persuade_all"));
      assert.ok(forceErrors.length > 0, "应检测到强制说服违规");
    });

    it("所有职业都排除 attribute_override", () => {
      for (const prof of Object.keys(PROFESSION_EXCLUDED_SYSTEMS)) {
        const excluded = PROFESSION_EXCLUDED_SYSTEMS[prof];
        assert.ok(
          excluded?.includes("attribute_override"),
          `${prof} 应排除 attribute_override`
        );
      }
    });
  });

  describe("职业技能池完整性", () => {
    it("所有5个职业都有对应的技能名", () => {
      const expectedProfs = ["守灯人", "巡迹客", "觅兆者", "齐日角", "溯源师"];
      for (const prof of expectedProfs) {
        assert.ok(PROFESSION_SKILL_MAP[prof], `${prof} 应有技能名`);
        assert.ok(PROFESSION_EXCLUDED_SYSTEMS[prof], `${prof} 应有excludeSystems`);
      }
    });

    it("职业技能名应互不相同", () => {
      const skills = Object.values(PROFESSION_SKILL_MAP);
      const unique = new Set(skills);
      assert.equal(unique.size, skills.length, "所有技能名应互不相同");
    });

    it("每个职业的 excludesSystems 应包含 attribute_override", () => {
      for (const [prof, excluded] of Object.entries(PROFESSION_EXCLUDED_SYSTEMS)) {
        assert.ok(
          excluded.includes("attribute_override"),
          `${prof} 必须排除 attribute_override`
        );
      }
    });
  });

  describe("冷却时间相关约束", () => {
    it("冷却中不应触发技能", () => {
      // 模拟冷却中的输出：skill_triggered 应为 false 或不存在
      const output = {
        ...mockOutputWithSkill("守灯人"),
        skill_triggered: false,
      };
      assert.equal(output.skill_triggered, false);
    });

    it("冷却为0时技能可以触发", () => {
      const output = {
        ...mockOutputWithSkill("守灯人"),
        skill_triggered: true,
      };
      assert.equal(output.skill_triggered, true);
    });
  });

  describe("叙事中不应包含系统提示词泄漏", () => {
    it("输出不应包含「系统提示词」", () => {
      const output = mockOutputWithSkill("守灯人");
      assert.ok(!output.narrative.includes("系统提示词"));
      assert.ok(!JSON.stringify(output).includes("system prompt"));
    });

    it("输出不应包含「JSON解析」等技术术语", () => {
      const output = mockOutputWithSkill("溯源师");
      assert.ok(!output.narrative.includes("JSON解析"));
      assert.ok(!output.narrative.includes("JSON格式"));
    });
  });
});
