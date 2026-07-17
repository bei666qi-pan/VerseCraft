/**
 * taskCopyValidator.test.ts — 任务文案 lint 单元测试
 *
 * 覆盖：checkTitle / checkDesc / checkNextHint / validateGameTask / sanitizeTitle
 * 要求（DESIGN.md §8.3）：≥10 good case（通过）、≥10 must-fail 反例（被拦截）、含 compact 快车道输出反例
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkTitle,
  checkDesc,
  checkNextHint,
  validateGameTask,
  sanitizeTitle,
} from "@/lib/tasks/taskCopyValidator";

// ── Good cases ──────────────────────────────────────

describe("checkTitle — good cases", () => {
  const GOOD_TITLES: string[] = [
    '借到一枚"通行印章"',
    "拼出出口路线碎片",
    '替阿织带一件"干净外套"',
    "在午夜前回一封匿名信",
    "换一根未受潮的保险丝",
    "问清三楼走廊尽头的脚步声",
    "找到能证明老刘清白的收据",
    "把医药箱还给林医生",
  ];

  for (const t of GOOD_TITLES) {
    it(`passes: ${t}`, () => {
      assert.equal(checkTitle(t).length, 0, `expected no issues for "${t}"`);
    });
  }
});

describe("checkDesc — good cases", () => {
  const GOOD_DESCS: string[] = [
    "老刘说配电间有扇上锁的铁门，钥匙在值班室抽屉里——得趁值班员换班那二十分钟动手。",
    "向老刘换至少两条可验证碎片：谁见过地下二层的门、哪条传闻带物证、谁在撒谎。",
    "阿织托你从三楼洗衣房拿一件没人认领的外套——她说洗衣阿姨认得她，提她名字就行。",
    "叶塞给你一封信，说如果今晚十二点前不放到B1邮筒里，会有麻烦。",
    "走廊尽头的脚步声每周三五出现，洗衣房阿姨说那不是人——但你发现鞋印是43码男鞋。",
    "老刘的收据在1F前台抽屉里，需要趁值班员去厕所那几分钟翻出来。",
  ];

  for (const d of GOOD_DESCS) {
    it(`passes: ${d.slice(0, 30)}...`, () => {
      assert.equal(checkDesc(d).length, 0, `expected no issues for desc`);
    });
  }
});

describe("checkNextHint — good cases", () => {
  const GOOD_HINTS: string[] = [
    "去配电间找老刘问值班表，看准换班窗口再下楼。",
    "先复述你在B1看到的不对劲，再问他：谁见过B2的门、谁能拿出证据。",
    "上三楼洗衣房，跟阿姨说阿织让你来拿衣服。",
    "趁天还没黑透，下B1去尽头的废弃邮筒，把信塞进去。",
    "等今晚走廊安静下来后，带手电去三楼公共电话旁蹲守。",
  ];

  for (const h of GOOD_HINTS) {
    it(`passes: ${h.slice(0, 30)}...`, () => {
      assert.equal(checkNextHint(h).length, 0, `expected no issues for hint`);
    });
  }
});

// ── Must-fail cases ──────────────────────────────────

describe("checkTitle — must-fail", () => {
  it("platitude: 帮我找到", () => {
    const issues = checkTitle("帮我找到地下二层的入口");
    assert.ok(issues.some((i) => i.code === "platitude"));
  });

  it("internal tag leak: N-xxx", () => {
    const issues = checkTitle("与N-008交谈取证");
    assert.ok(issues.some((i) => i.code === "internal_tag_leak"));
  });

  it("self-praise: 惊天秘密", () => {
    const issues = checkTitle("揭开一个惊天的秘密");
    assert.ok(issues.some((i) => i.code === "self_praise"));
  });

  it("too long (>12 chars)", () => {
    const issues = checkTitle("调查地下二层入口的通行权限");
    assert.ok(issues.some((i) => i.code === "title_too_long"));
  });
});

describe("checkDesc — must-fail", () => {
  it("platitude: 了解更多", () => {
    const issues = checkDesc("了解更多关于地下二层的情报，收集更多信息以完成调查。");
    assert.ok(issues.some((i) => i.code === "platitude"), "should flag platitude");
  });

  it("system tone: 检测到新线索", () => {
    const issues = checkDesc("检测到新线索：配电间的钥匙可能在前台。");
    assert.ok(issues.some((i) => i.code === "system_tone"), "should flag system_tone");
  });

  it("boast: 丰厚奖励", () => {
    const issues = checkDesc("帮老刘完成任务可获得丰厚奖励。");
    assert.ok(issues.some((i) => i.code === "boast"), "should flag boast");
  });

  it("vague direction: 继续探索", () => {
    const issues = checkDesc("继续探索地下二层，寻找更多线索。");
    const codes = issues.map((i) => i.code);
    assert.ok(codes.includes("vague_direction") || codes.includes("platitude"), "should flag vague_direction or platitude");
  });

  it("conjunction cluster", () => {
    const issues = checkDesc("不仅需要找到钥匙，而且还要避开值班员，此外还得注意监控。");
    assert.ok(issues.some((i) => i.code === "conjunction_cluster"), "should flag conjunction cluster");
  });

  it("empty desc", () => {
    const issues = checkDesc("");
    assert.ok(issues.some((i) => i.code === "empty"), "should flag empty");
  });

  it("too long (>80 chars)", () => {
    const issues = checkDesc("它的确很长很长，长到毫无疑问会远远超过八十字的限制，毕竟这是一个非常长的描述句子，它至少应该有八十五个以上的汉字字符才能确保触发长度检查的拦截逻辑，再多个字也没问题。");
    assert.ok(issues.some((i) => i.code === "desc_too_long"), "should flag too long");
  });
});

describe("checkNextHint — must-fail", () => {
  it("platitude: 调查一下", () => {
    const issues = checkNextHint("调查一下地下二层的情况。");
    assert.ok(issues.some((i) => i.code === "platitude"), "should flag platitude");
  });

  it("vague continue: 继续在老刘那里打探消息", () => {
    const issues = checkNextHint("继续在老刘那里打探消息。");
    assert.ok(issues.some((i) => i.code === "vague_continue"), "should flag vague_continue");
  });

  it("empty hint", () => {
    const issues = checkNextHint("");
    assert.ok(issues.some((i) => i.code === "empty"), "should flag empty");
  });
});

// ── Compact path output counterexamples ──────────────

describe("compact path — must-fail (DESIGN §8.3)", () => {
  it("compact 快车道输出：万能套话标题+描述", () => {
    // 模拟快车道可能输出的简化版任务
    const report = validateGameTask({
      title: "了解更多线索",
      desc: "继续收集更多信息以完成调查，揭开事情的真相。",
      nextHint: "继续在公寓里寻找线索。",
    });
    assert.equal(report.valid, false, "should be invalid");
    assert.ok(report.issues.some((i) => i.code === "platitude"), "should flag platitude in title/desc");
  });

  it("compact 快车道：内部标签泄露", () => {
    const report = validateGameTask({
      title: "与visited:老刘交谈",
      desc: "talked_to:老刘的线索仍未收集完成。",
      nextHint: "继续与老刘交谈获取更多信息。",
    });
    assert.equal(report.valid, false, "should be invalid");
    assert.ok(report.issues.some((i) => i.code === "internal_tag_leak"), "should flag internal tag leak");
  });

  it("compact 快车道：奖牌腔+系统音混合", () => {
    const report = validateGameTask({
      title: "任务已更新",
      desc: "检测到新线索，完成可获得丰厚奖励。",
      nextHint: "继续推进任务。",
    });
    assert.equal(report.valid, false, "should be invalid");
    const codes = report.issues.map((i) => i.code);
    assert.ok(codes.includes("system_tone") || codes.includes("boast"), "should flag system_tone or boast");
  });
});

// ── validateGameTask ────────────────────────────────

describe("validateGameTask", () => {
  it("good task = valid", () => {
    const report = validateGameTask({
      title: '借到一枚"通行印章"',
      desc: "老刘说配电间有扇上锁的铁门，钥匙在值班室抽屉里——得趁值班员换班那二十分钟动手。",
      nextHint: "去配电间找老刘问值班表，看准换班窗口再下楼。",
    });
    assert.equal(report.valid, true, "good task should be valid");
    assert.equal(report.issues.length, 0);
  });

  it("bad task = invalid with issues", () => {
    const report = validateGameTask({
      title: "帮我找到线索",
      desc: "继续了解更多关于地下二层的信息，收集更多线索以揭开真相。",
      nextHint: "继续在公寓探索。",
    });
    assert.equal(report.valid, false, "bad task should be invalid");
    assert.ok(report.issues.length > 0, "should have issues");
  });

  it("empty input = invalid", () => {
    const report = validateGameTask({});
    assert.equal(report.valid, false);
  });
});

// ── sanitizeTitle ────────────────────────────────────

describe("sanitizeTitle", () => {
  it("removes 帮我找到", () => {
    assert.equal(sanitizeTitle("帮我找到钥匙"), "找到钥匙");
  });
  it("removes 调查一下", () => {
    assert.equal(sanitizeTitle("调查一下配电间"), "留意配电间");
  });
  it("removes 了解更多", () => {
    assert.equal(sanitizeTitle("了解更多线索"), "弄清线索");
  });
  it("removes 一探究竟", () => {
    assert.equal(sanitizeTitle("去B1一探究竟"), "去B1弄清楚");
  });
  it("removes 检测到新线索", () => {
    assert.equal(sanitizeTitle("检测到新线索"), "发现了一些值得注意的动静");
  });
  it("passes through clean title", () => {
    assert.equal(sanitizeTitle('借到一枚"通行印章"'), '借到一枚"通行印章"');
  });
});
