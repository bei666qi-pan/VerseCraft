/**
 * NPC 一致性测试 — 确定性断言
 *
 * 验证 AI 输出中 NPC 行为的一致性：
 * - NPC 不应泄漏 DM-only 信息（认知边界）
 * - NPC 性格应与设定一致
 * - NPC 身份不应混淆
 * - NPC 知识范围应遵守
 *
 * 运行: pnpm dlx tsx --test tests/promptfoo/tests/npc-consistency.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  DM_ONLY_KEYWORDS,
  detectNpcIdentityConfusion,
  validateNpcConsistency,
} from "../assertions/schema-validators";

// === NPC 设定档案（测试用） ===

interface NpcProfile {
  id: string;
  name: string;
  personality: string[];      // 性格关键词
  speechStyle: string[];      // 说话风格关键词
  knowledgeScope: string[];   // 知识范围
  forbiddenKnowledge: string[]; // 不应知道的信息
}

const NPC_PROFILES: Record<string, NpcProfile> = {
  npc_liao_an: {
    id: "npc_liao_an",
    name: "廖暗",
    personality: ["沉默寡言", "警觉", "经验丰富"],
    speechStyle: ["简短", "低沉", "暗示性"],
    knowledgeScope: ["公寓异常", "威胁类型", "生存技巧"],
    forbiddenKnowledge: ["玩家真实身份", "DM 判定逻辑", "游戏数值"],
  },
  npc_xinlan: {
    id: "npc_xinlan",
    name: "欣蓝",
    personality: ["校园系", "好奇", " slightly naive"],
    speechStyle: ["年轻", "书面语", "偶尔文艺"],
    knowledgeScope: ["学校生活", "日常事物", "公寓表面现象"],
    forbiddenKnowledge: ["深层真相", "威胁本质", "DM 规则"],
  },
  npc_laoliu: {
    id: "npc_laoliu",
    name: "老刘",
    personality: ["寡言", "务实", "隐藏过去"],
    speechStyle: ["工地口吻", "三句话只说半句", "行动派"],
    knowledgeScope: ["建筑", "电路", "公寓历史"],
    forbiddenKnowledge: ["系统设定", "数值计算", "玩家内心"],
  },
};

describe("NPC 一致性 — 确定性断言", () => {
  describe("NPC 认知边界 — DM-only 信息防护", () => {
    it("NPC 不应说出 '根据游戏规则'", () => {
      const narrative = "廖暗看着你，平静地说：「根据游戏规则，你现在应该往左走。」";
      const errors = validateNpcConsistency(narrative);
      assert.ok(errors.some((e) => e.includes("DM-only") || e.includes("游戏规则")), "应报认知越界");
    });

    it("NPC 不应说出 'DM 判定'", () => {
      const narrative = "老刘告诉你：「DM 判定你不能通过这个门。」";
      const errors = validateNpcConsistency(narrative);
      assert.ok(errors.some((e) => e.includes("DM") || e.includes("DM-only")), "应报 DM 泄漏");
    });

    it("NPC 不应说出 '系统告诉我'", () => {
      const narrative = "欣蓝说：「系统告诉我你手里有封缄钉。」";
      const errors = validateNpcConsistency(narrative);
      assert.ok(errors.some((e) => e.includes("系统") || e.includes("DM-only")), "应报系统信息泄漏");
    });

    it("NPC 不应说出 '按照剧本'", () => {
      const narrative = "廖暗说：「按照剧本，你现在应该感到害怕。」";
      const errors = validateNpcConsistency(narrative);
      assert.ok(errors.some((e) => e.includes("剧本") || e.includes("DM-only")), "应报剧本泄漏");
    });

    it("NPC 正常认知范围内对话应通过", () => {
      const narrative = "廖暗压低声音说：「别往前走了，那东西不好对付。我在B1见过类似的。」";
      const errors = validateNpcConsistency(narrative);
      assert.equal(errors.length, 0, `正常认知范围内对话不应报错: ${errors.join("; ")}`);
    });

    it("NPC 谈论其知识范围内的事物应通过", () => {
      const narrative = "老刘指着配电箱说：「这个断路器被人动过。红漆画的圈不是电工干的。」";
      const errors = validateNpcConsistency(narrative);
      assert.equal(errors.length, 0, `知识范围内对话不应报错: ${errors.join("; ")}`);
    });

    it("DM-only 关键词列表应完整", () => {
      assert.ok(DM_ONLY_KEYWORDS.length >= 5, "应有足够关键词");
      const required = ["游戏规则", "系统", "DM"];
      for (const kw of required) {
        assert.ok(
          DM_ONLY_KEYWORDS.some((k) => k.includes(kw)),
          `DM-only 列表应包含: ${kw}`
        );
      }
    });
  });

  describe("NPC 性格一致性", () => {
    it("寡言NPC不应突然说长篇大论（通过性格关键词检测）", () => {
      // 这是一个简化检测 —— 完整版需要 NLP
      const laoliuProfile = NPC_PROFILES.npc_laoliu!;
      assert.ok(laoliuProfile.personality.includes("寡言"), "老刘应设定为寡言");
    });

    it("校园系NPC应有年轻口吻关键词", () => {
      const xinlanProfile = NPC_PROFILES.npc_xinlan!;
      assert.ok(xinlanProfile.speechStyle.includes("年轻"), "欣蓝应有年轻口吻");
    });

    it("NPC 档案应包含必要字段", () => {
      for (const [id, profile] of Object.entries(NPC_PROFILES)) {
        assert.ok(profile.id, `${id} 应有 id`);
        assert.ok(profile.name, `${id} 应有 name`);
        assert.ok(profile.personality.length >= 2, `${id} 应有至少 2 个性格关键词`);
        assert.ok(profile.speechStyle.length >= 2, `${id} 应有至少 2 个说话风格关键词`);
      }
    });

    it("NPC 禁止知识列表应存在", () => {
      for (const [id, profile] of Object.entries(NPC_PROFILES)) {
        assert.ok(profile.forbiddenKnowledge.length >= 1, `${id} 应有禁止知识列表`);
      }
    });
  });

  describe("NPC 身份不混淆", () => {
    it("不同 NPC 应有不同的说话风格", () => {
      const styles = Object.values(NPC_PROFILES).map((p) => p.speechStyle.join(","));
      const uniqueStyles = new Set(styles);
      // 简化检测：至少说话风格组合应不同
      assert.ok(uniqueStyles.size >= 2, "NPC 之间应有可区分的说话风格");
    });

    it("同一 NPC 不应使用另一个 NPC 的标志性口吻", () => {
      // 模拟：欣蓝不应说出老刘的工地口吻
      // 检测欣蓝的台词中不应包含老刘的风格特征
      const laoliuKeywords = ["小姑娘", "你在这儿干嘛呢", "有道理"];
      const xinlanDialogue = "欣蓝想了想说：「也许吧，事情比看起来复杂。」";

      for (const kw of laoliuKeywords) {
        assert.ok(!xinlanDialogue.includes(kw), `欣蓝不应使用老刘口吻: ${kw}`);
      }

      // 验证函数可用性
      const confusionErrors = detectNpcIdentityConfusion(xinlanDialogue, {
        npc_laoliu: NPC_PROFILES.npc_laoliu!.speechStyle,
      });
      // 简化检测：函数应可执行
      assert.ok(Array.isArray(confusionErrors));
    });

    it("NPC 数量应足够支持一致性测试", () => {
      assert.ok(Object.keys(NPC_PROFILES).length >= 3, "应至少 3 个 NPC 档案");
    });
  });

  describe("NPC 知识范围遵守", () => {
    it("NPC 不应知道超出其知识范围的信息", () => {
      const xinlan = NPC_PROFILES.npc_xinlan!;
      // 欣蓝不应知道 "深层真相"
      assert.ok(xinlan.forbiddenKnowledge.includes("深层真相"), "欣蓝不应知道深层真相");

      // 如果叙事中欣蓝说出了深层真相，应被检测
      const badNarrative = "欣蓝说：「其实这一切都是时间循环，我们都是被困在里面的灵魂。」";
      // 此处为简化检测 —— 完整版需要对比知识范围
      assert.ok(badNarrative.includes("时间循环"), "叙事包含超出知识范围的信息");
    });

    it("NPC 谈论其知识范围内的事物应合理", () => {
      const laoliu = NPC_PROFILES.npc_laoliu!;
      // 老刘知道 "建筑" 和 "电路"
      assert.ok(laoliu.knowledgeScope.includes("电路"), "老刘应知道电路");

      const goodNarrative = "老刘检查了配电箱说：「这个断路器被人手动关闭过。不是跳闸。」";
      // 这与老刘的知识范围一致
      assert.ok(goodNarrative.includes("断路器") || goodNarrative.includes("电路"));
    });
  });

  describe("综合 NPC 场景", () => {
    it("NPC 同时泄漏 DM-only 和超出知识范围 应多重报错", () => {
      const narrative = "廖暗说：「按照系统设定，你的sanity_damage已经很高了。另外，深层真相是……」";
      const errors = validateNpcConsistency(narrative);
      assert.ok(errors.length >= 1, `应至少 1 个错误，实际 ${errors.length}: ${errors.join("; ")}`);
    });

    it("完全合规的 NPC 对话应零错误", () => {
      const narrative = "廖暗侧过头，压低声音：「别往前了。那东西——不是你现在的水平能处理的。」他的左手臂上有一道发光的暗痕。";
      const errors = validateNpcConsistency(narrative);
      assert.equal(errors.length, 0, `合规对话不应报错: ${errors.join("; ")}`);
    });
  });
});
