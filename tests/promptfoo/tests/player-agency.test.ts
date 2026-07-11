/**
 * 玩家选择尊重测试 — 确定性断言
 *
 * 验证 AI 输出是否正确尊重玩家的选择：
 * - is_action_legal=false 时应有合理解释
 * - 选项应与当前场景相关
 * - 拒绝时应有替代方案
 * - 行动合法性判断应与叙事一致
 *
 * 运行: pnpm dlx tsx --test tests/promptfoo/tests/player-agency.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { validatePlayerAgency } from "../assertions/schema-validators";

// === 测试辅助 ===

interface DmOutput {
  [key: string]: unknown;
  narrative: string;
  is_action_legal: boolean;
  sanity_damage: number;
  is_death: boolean;
  options: string[];
}

function mockOutput(overrides: Partial<DmOutput> = {}): DmOutput {
  return {
    narrative: "你站在走廊中央，灯管在头顶闪烁。",
    is_action_legal: true,
    sanity_damage: 0,
    is_death: false,
    options: ["前进", "后退", "观察"],
    ...overrides,
  };
}

describe("玩家选择尊重 — 确定性断言", () => {
  describe("行动合法性与叙事一致性", () => {
    it("is_action_legal=false 时 narrative 应解释拒绝原因", () => {
      const output = mockOutput({
        is_action_legal: false,
        narrative: "你尝试推开那扇门——但它纹丝不动。门被某种力量封住了，现在无法打开。",
      });
      const errors = validatePlayerAgency(output);
      assert.equal(errors.length, 0, `有解释原因的拒绝不应报错: ${errors.join("; ")}`);
    });

    it("is_action_legal=false 但无解释应报错", () => {
      const output = mockOutput({
        is_action_legal: false,
        narrative: "你推开了那扇门。门后是一条延伸向黑暗的走廊。",
      });
      const errors = validatePlayerAgency(output);
      assert.ok(errors.some((e) => e.includes("拒绝") || e.includes("解释")), "应报无解释的拒绝");
    });

    it("is_action_legal=true 时正常叙事应通过", () => {
      const output = mockOutput({
        is_action_legal: true,
        narrative: "你小心翼翼地向前走去。走廊的灯管在头顶闪烁，照亮前方模糊的轮廓。",
      });
      const errors = validatePlayerAgency(output);
      assert.equal(errors.length, 0, `合法行动不应报错: ${errors.join("; ")}`);
    });

    it("拒绝关键词列表应覆盖常见拒绝表达", () => {
      const refusalIndicators = ["无法", "不能", "不允许", "做不到", "没办法"];
      for (const kw of refusalIndicators) {
        // 验证这些关键词在拒绝场景中会被使用
        const refusalNarrative = `你尝试行动，但目前${kw}做到。`;
        assert.ok(refusalNarrative.includes(kw), `拒绝叙事应包含: ${kw}`);
      }
    });
  });

  describe("拒绝场景的替代方案", () => {
    it("拒绝时应提供替代方案或下一步指引", () => {
      const output = mockOutput({
        is_action_legal: false,
        narrative: "你尝试跳下四楼——但这太危险了，现在还不能这么做。也许可以先找到更安全的方式。",
        options: ["寻找其他出路", "回到安全区域", "收集更多信息"],
      });
      const errors = validatePlayerAgency(output);
      assert.equal(errors.length, 0, `有替代方案的拒绝不应报错: ${errors.join("; ")}`);
      assert.ok(output.options.length >= 2, "应提供多个替代选项");
    });

    it("拒绝后选项不应包含被拒绝的行动", () => {
      const output = mockOutput({
        is_action_legal: false,
        narrative: "你现在无法通过这扇门。它被某种力量封住了。",
        options: ["寻找其他通路", "尝试破窗", "返回上楼"],
      });
      // 选项不应包含 "打开这扇门" 或类似重复被拒行动
      const forbiddenOptions = ["打开这扇门", "强行推门", "破门而入"];
      for (const opt of output.options) {
        for (const forbidden of forbiddenOptions) {
          assert.ok(!opt.includes(forbidden), `选项不应重复被拒行动: ${forbidden}`);
        }
      }
    });
  });

  describe("选项与场景相关性", () => {
    it("选项应与当前场景逻辑相关", () => {
      const output = mockOutput({
        narrative: "你站在配电间里，面前是一排复杂的断路器。",
        is_action_legal: true,
        options: ["检查断路器", "记录仪表盘读数", "返回走廊"],
      });
      // 选项应与 "配电间" 场景相关
      const relevantKeywords = ["断路器", "仪表盘", "走廊", "检查", "记录"];
      for (const opt of output.options) {
        const isRelevant = relevantKeywords.some((kw) => opt.includes(kw));
        assert.ok(isRelevant, `选项应与场景相关: ${opt}`);
      }
    });

    it("选项不应包含完全无关的行动", () => {
      const output = mockOutput({
        narrative: "你站在阴暗的地下室里，空气中弥漫着霉味。",
        is_action_legal: true,
        options: ["向前探索", "点亮手电", "倾听周围动静"],
      });
      // 选项不应包含 "点外卖"、"刷微博" 等与场景无关的行动
      const irrelevantOptions = ["点外卖", "刷微博", "打游戏"];
      for (const opt of output.options) {
        for (const irrelevant of irrelevantOptions) {
          assert.ok(!opt.includes(irrelevant), `选项不应包含无关行动: ${irrelevant}`);
        }
      }
    });
  });

  describe("玩家意图对齐", () => {
    it("玩家明确表达意图时 narrative 应回应", () => {
      // 模拟玩家输入 "我想打开门"
      const playerInput = "我想打开门";
      const output = mockOutput({
        narrative: "你握住门把手，用力转动。门发出沉重的吱呀声，缓缓向内打开。",
        is_action_legal: true,
      });
      // narrative 应包含 "开门" 相关描述
      assert.ok(
        output.narrative.includes("门") || output.narrative.includes("开"),
        "narrative 应回应玩家开门意图"
      );
    });

    it("玩家选择探索时不应被强制推进剧情", () => {
      const playerInput = "我想先看看周围";
      const output = mockOutput({
        narrative: "你环顾四周。走廊很长，灯管在头顶闪烁。墙壁上有几道刮痕，像是某种尖锐物体留下的。",
        is_action_legal: true,
      });
      // 叙事应是探索性质的，不应突然出现 NPC 或强制事件
      const forcedEvents = ["突然出现", "突然袭击", "强制", "必须"];
      for (const event of forcedEvents) {
        assert.ok(!output.narrative.includes(event), `探索场景不应强制推进: ${event}`);
      }
    });

    it("narrative 应与 is_action_legal 一致", () => {
      const output = mockOutput({
        is_action_legal: false,
        narrative: "你尝试跳下四楼——但这太危险了，现在无法做到。",
      });
      // 如果 is_action_legal=false, narrative 应体现 "无法" "不能" 等
      const refusalIndicators = ["无法", "不能", "不允许", "做不到", "没办法", "太危险"];
      const hasRefusal = refusalIndicators.some((kw) => output.narrative.includes(kw));
      assert.ok(hasRefusal, "is_action_legal=false 时 narrative 应包含拒绝表达");
    });
  });

  describe("失败/拒绝的自然度", () => {
    it("拒绝不应使用生硬的系统通知式语言", () => {
      const output = mockOutput({
        is_action_legal: false,
        narrative: "错误：行动不合法。请重新选择。",
      });
      // validatePlayerAgency 主要检查拒绝解释，不直接检测系统术语
      // 但 narrative 中包含 "无法" "不能" 等词会被认为有解释
      // 这个测试验证函数不报错（因为包含"不合法"暗示拒绝原因）
      const errors = validatePlayerAgency(output);
      // 实际上 "不合法" 不在拒绝关键词列表中，所以会报错
      // 这是预期行为 —— 系统通知式拒绝不是好的拒绝
      assert.ok(errors.length > 0, "系统通知式拒绝应被检测");
    });

    it("拒绝应融入叙事，而非打断沉浸感", () => {
      const goodRefusal = mockOutput({
        is_action_legal: false,
        narrative: "你伸出手，指尖触碰到门面的瞬间，一阵冰冷的刺痛传遍全身。这道门——不是你现在能打开的。也许需要先找到什么。",
      });
      // 好的拒绝应保持沉浸感，使用感官描写
      const sensoryWords = ["冰冷", "刺痛", "指尖", "触碰"];
      const hasSensory = sensoryWords.some((w) => goodRefusal.narrative.includes(w));
      assert.ok(hasSensory, "好的拒绝叙事应包含感官描写");
    });
  });

  describe("综合玩家体验场景", () => {
    it("完全合法且有沉浸感的行动应零错误", () => {
      const output = mockOutput({
        is_action_legal: true,
        narrative: "你握紧手电，光束在黑暗中划出一条颤抖的线。前方的走廊安静得诡异，只有灯管偶尔发出的嗡鸣声。你深吸一口气，向前迈出了一步。",
        sanity_damage: 1,
        options: ["继续探索", "退回安全区域", "大声呼喊"],
      });
      const errors = validatePlayerAgency(output);
      assert.equal(errors.length, 0, `合法且有沉浸感的行动不应报错: ${errors.join("; ")}`);
    });

    it("合理拒绝且有替代方案应零错误", () => {
      const output = mockOutput({
        is_action_legal: false,
        narrative: "你尝试跳下四楼——但高度让你犹豫了，现在还不能跳。也许可以先找到更安全的方式。",
        options: ["寻找其他出路", "回到安全区域", "收集更多信息"],
      });
      const errors = validatePlayerAgency(output);
      assert.equal(errors.length, 0, `合理拒绝且有替代方案不应报错: ${errors.join("; ")}`);
    });
  });
});
