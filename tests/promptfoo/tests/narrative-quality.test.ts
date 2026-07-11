/**
 * 叙事质量测试 — 确定性断言
 *
 * 验证 AI 输出的叙事文本质量：
 * - 最小长度约束
 * - 感官细节覆盖度
 * - 系统术语泄漏防护
 * - 选项质量
 *
 * 运行: pnpm dlx tsx --test tests/promptfoo/tests/narrative-quality.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  MIN_NARRATIVE_LENGTH,
  SENSORY_KEYWORDS,
  SYSTEM_LEAK_KEYWORDS,
  detectSensoryDetails,
  validateNarrativeQuality,
  validateOptionQuality,
} from "../assertions/schema-validators";

describe("叙事质量 — 确定性断言", () => {
  describe("叙事长度约束", () => {
    it(`narrative 应至少 ${MIN_NARRATIVE_LENGTH} 字`, () => {
      const shortNarrative = "你走进了走廊。";
      const errors = validateNarrativeQuality(shortNarrative);
      assert.ok(errors.some((e) => e.includes("低于最小值")), "应报长度不足");
    });

    it("合法长度的 narrative 应通过", () => {
      const goodNarrative = "你小心翼翼地走进走廊，灯管在头顶闪烁了三下。空气中弥漫着潮湿的金属味，每一步都踩在未知的边缘。远处有什么东西在动——不是声音，是一种压迫感，像是空气本身在呼吸。";
      const errors = validateNarrativeQuality(goodNarrative);
      assert.equal(errors.length, 0, `不应有错误: ${errors.join("; ")}`);
    });

    it("非字符串 narrative 应报错", () => {
      const errors = validateNarrativeQuality(123);
      assert.ok(errors.some((e) => e.includes("必须是字符串")));
    });

    it("空字符串 narrative 应报错", () => {
      const errors = validateNarrativeQuality("");
      assert.ok(errors.some((e) => e.includes("低于最小值")));
    });
  });

  describe("感官细节覆盖", () => {
    it("包含视觉关键词应被检测到", () => {
      const narrative = "灯管闪烁了一下，你看见走廊尽头的影子在移动。";
      const covered = detectSensoryDetails(narrative);
      assert.ok(covered.includes("visual"), `应检测到视觉细节，实际: ${covered.join(",")}`);
    });

    it("包含听觉关键词应被检测到", () => {
      const narrative = "远处传来一阵低沉的嗡鸣声，像是电流在墙壁里流动。";
      const covered = detectSensoryDetails(narrative);
      assert.ok(covered.includes("auditory"), `应检测到听觉细节，实际: ${covered.join(",")}`);
    });

    it("包含触觉关键词应被检测到", () => {
      const narrative = "你的手指触碰到冰冷的金属栏杆，一阵刺痛从指尖传来。";
      const covered = detectSensoryDetails(narrative);
      assert.ok(covered.includes("tactile"), `应检测到触觉细节，实际: ${covered.join(",")}`);
    });

    it("包含嗅觉关键词应被检测到", () => {
      const narrative = "空气中弥漫着一股腥味，像是铁锈混合着什么东西腐烂的气息。";
      const covered = detectSensoryDetails(narrative);
      assert.ok(covered.includes("olfactory"), `应检测到嗅觉细节，实际: ${covered.join(",")}`);
    });

    it("多感官覆盖应全部检测到", () => {
      const narrative = "你看见灯管闪烁（视觉），听见嗡鸣声（听觉），感受到冰冷的空气（触觉），闻到金属的腥味（嗅觉）。";
      const covered = detectSensoryDetails(narrative);
      assert.ok(covered.length >= 3, `应至少覆盖 3 种感官，实际: ${covered.join(",")}`);
    });

    it("纯抽象叙事应无感官细节", () => {
      const narrative = "你思考着这个问题的答案。也许是对的，也许是错的。总之需要继续前进。";
      const covered = detectSensoryDetails(narrative);
      assert.equal(covered.length, 0, `不应有感官细节，实际: ${covered.join(",")}`);
    });

    it("感官关键词定义应完整", () => {
      assert.ok(Object.keys(SENSORY_KEYWORDS).length >= 4, "应有至少 4 种感官类型");
      for (const [type, keywords] of Object.entries(SENSORY_KEYWORDS)) {
        assert.ok(keywords.length >= 5, `${type} 应有至少 5 个关键词`);
      }
    });
  });

  describe("系统术语泄漏检测", () => {
    it("narrative 包含 system prompt 应报错", () => {
      const narrative = "根据 system prompt 的要求，我需要生成一个叙事。你走在走廊上。";
      const errors = validateNarrativeQuality(narrative);
      assert.ok(errors.some((e) => e.includes("system prompt")), "应报 system prompt 泄漏");
    });

    it("narrative 包含 JSON 格式 应报错", () => {
      const narrative = "请严格以 JSON 格式输出结果。你走进了房间。";
      const errors = validateNarrativeQuality(narrative);
      assert.ok(errors.some((e) => e.includes("JSON 格式") || e.includes("JSON格式")), "应报 JSON 格式泄漏");
    });

    it("narrative 包含字段名泄漏应报错", () => {
      const narrative = "is_action_legal 为 true，sanity_damage 为 2。你感到一阵眩晕。";
      const errors = validateNarrativeQuality(narrative);
      assert.ok(errors.some((e) => e.includes("is_action_legal") || e.includes("sanity_damage")), "应报字段名泄漏");
    });

    it("正常叙事不应触发系统术语检测", () => {
      const narrative = "你握紧手电，光束在黑暗中划出一道颤抖的线。前方的走廊像一张等待被吞噬的嘴。";
      const errors = validateNarrativeQuality(narrative);
      const leakErrors = errors.filter((e) => e.includes("系统术语泄漏"));
      assert.equal(leakErrors.length, 0, `正常叙事不应有泄漏: ${leakErrors.join("; ")}`);
    });

    it("系统泄漏关键词列表应包含核心术语", () => {
      const requiredKeywords = ["system prompt", "JSON 格式", "is_action_legal"];
      for (const kw of requiredKeywords) {
        assert.ok(
          SYSTEM_LEAK_KEYWORDS.some((k) => k.toLowerCase().includes(kw.toLowerCase())),
          `应包含关键词: ${kw}`
        );
      }
    });
  });

  describe("选项质量校验", () => {
    it("重复选项应报错", () => {
      const errors = validateOptionQuality(["前进", "前进", "后退"]);
      assert.ok(errors.some((e) => e.includes("重复")), "应报重复选项");
    });

    it("系统操作选项应报错", () => {
      const errors = validateOptionQuality(["查看系统状态", "前进", "后退"]);
      assert.ok(errors.some((e) => e.includes("系统操作") || e.includes("系统")), "应报系统操作选项");
    });

    it("debug 选项应报错", () => {
      const errors = validateOptionQuality(["debug mode", "前进", "后退"]);
      assert.ok(errors.some((e) => e.includes("debug") || e.includes("系统")), "应报 debug 选项");
    });

    it("过短选项应报错", () => {
      const errors = validateOptionQuality(["a", "前进", "后退"]);
      assert.ok(errors.some((e) => e.includes("长度")), "应报过短选项");
    });

    it("合法选项应通过", () => {
      const errors = validateOptionQuality(["小心翼翼地向前推进", "退回到刚才的房间", "大声呼喊引起注意"]);
      assert.equal(errors.length, 0, `合法选项不应报错: ${errors.join("; ")}`);
    });

    it("非数组选项应报错", () => {
      const errors = validateOptionQuality("不是数组");
      assert.ok(errors.some((e) => e.includes("必须是数组")));
    });

    it("禁止选项关键词列表应合理", () => {
      assert.ok(SYSTEM_LEAK_KEYWORDS.length > 5, "应有足够的泄漏关键词");
    });
  });
});
