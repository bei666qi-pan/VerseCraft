import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateNarrativeStyleCase,
  summarizeNarrativeStyleEval,
  type NarrativeStyleEvalCase,
} from "./narrativeStyleRubric";

function baseCase(overrides: Partial<NarrativeStyleEvalCase> = {}): NarrativeStyleEvalCase {
  return {
    id: "case",
    kind: "golden_pass",
    narrative: "我贴着墙根停下脚步，走廊尽头的灯管闪了两下。门缝里没有风，灰却向外走。楼上有人停住了脚步。",
    sceneContext: { turnMode: "narrative_only", expectedRegister: "suspense" },
    expect: { mustNotHitIssues: ["hook_missing"] },
    ...overrides,
  };
}

test("narrativeStyleRubric golden_pass passes a clean narrative", () => {
  const result = evaluateNarrativeStyleCase(baseCase());
  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test("narrativeStyleRubric golden_pass fails on mechanical_exposition", () => {
  const result = evaluateNarrativeStyleCase(
    baseCase({
      id: "gp_mechanical",
      narrative: "系统提示：本回合判定成功，你获得了钥匙。走廊尽头灯管闪了两下。",
    })
  );
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes("golden_pass_hit_hard_issues")));
});

test("narrativeStyleRubric golden_pass fails on forbidden_phrase_hit", () => {
  const result = evaluateNarrativeStyleCase(
    baseCase({
      id: "gp_forbidden",
      narrative: "任务已完成，我获得了走廊钥匙。恭喜解锁新区域。",
    })
  );
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes("golden_pass_hit_hard_issues")));
});

test("narrativeStyleRubric golden_pass fails on unexpected issue in mustNotHitIssues", () => {
  const result = evaluateNarrativeStyleCase(
    baseCase({
      id: "gp_flat_rhythm",
      // sentence_rhythm_flat 触发条件：≥4 句、平均句长 ≥8、spread ≤2
      narrative: "我推开门准备迈步走进走廊。走廊里灯光昏暗而且非常安静。我停下脚步仔细环顾四周。眼前暂时没有任何异常情况。我深吸一口气决定继续向前。",
      expect: { mustNotHitIssues: ["sentence_rhythm_flat"] },
    })
  );
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.startsWith("unexpected_issue_hit")));
});

test("narrativeStyleRubric golden_pass with mustNotHitIssues enforcement", () => {
  const result = evaluateNarrativeStyleCase(
    baseCase({
      id: "gp_clean",
      narrative: "纸团砸进暗处，弹了两下。像被什么东西——接住了。走廊尽头的灯管闪了两下，我屏住呼吸没有再扔第二个。门缝里传来一声很轻的笑。",
      expect: { mustNotHitIssues: ["hook_missing", "sensory_density_low"] },
    })
  );
  assert.equal(result.pass, true);
});

test("narrativeStyleRubric must_fail detects choice_preview_tail via hook_missing", () => {
  const result = evaluateNarrativeStyleCase({
    id: "mf_choice_tail",
    kind: "must_fail",
    // 标准选项预告尾巴；尾段不含任何 HOOK_RE / CLOSED_ENDING 关键词
    narrative: "我能继续沿墙靠近，也能先确认身后的退路，或者利用随身物件制造一点声响然后等待。走廊那头没有任何回应。",
    sceneContext: { turnMode: "narrative_only" },
    expect: { mustHitIssues: ["hook_missing"] },
  });
  assert.equal(result.pass, true, `must_fail should pass when mustHitIssues are hit: ${result.failures.join(",")}`);
  assert.ok(result.expectedIssuesHit.includes("hook_missing"));
});

test("narrativeStyleRubric must_fail fails if mustHitIssues not triggered", () => {
  const result = evaluateNarrativeStyleCase({
    id: "mf_no_hit",
    kind: "must_fail",
    narrative: "刮擦声停了。停得太整齐——像对面也在数我的呼吸。门缝里没有风，灰却向外走。楼上有人停住了脚步。",
    sceneContext: { turnMode: "narrative_only" },
    expect: { mustHitIssues: ["sentence_rhythm_flat"] },
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.startsWith("must_fail_missed")));
});

test("narrativeStyleRubric must_fail detects mechanical_exposition", () => {
  const result = evaluateNarrativeStyleCase({
    id: "mf_mechanical",
    kind: "must_fail",
    narrative: "系统提示：根据规则，本回合判定成功。任务已完成，奖励已发放。你能继续调查，也能先确认身后的退路。",
    sceneContext: { turnMode: "narrative_only" },
    expect: { mustHitIssues: ["mechanical_exposition", "forbidden_phrase_hit"] },
  });
  assert.equal(result.pass, true);
  assert.ok(result.expectedIssuesHit.includes("mechanical_exposition"));
  assert.ok(result.expectedIssuesHit.includes("forbidden_phrase_hit"));
});

test("narrativeStyleRubric must_fail detects style_drift", () => {
  const result = evaluateNarrativeStyleCase({
    id: "mf_drift",
    kind: "must_fail",
    narrative: "公寓规则写着：守则第一条，午夜前必须返回房间。违反规则则后果自负。灯牌在墙上闪了三下。",
    expect: { mustHitIssues: ["style_drift"] },
  });
  assert.equal(result.pass, true);
  assert.ok(result.expectedIssuesHit.includes("style_drift"));
});

test("narrativeStyleRubric must_fail detects dialogue_over_explains", () => {
  const result = evaluateNarrativeStyleCase({
    id: "mf_dialogue",
    kind: "must_fail",
    narrative: "她对我说：\"这座公寓的真相就是循环，根因来自校源机制，所以所有人都必须遵守规则，否则答案会被重置。\"",
    expect: { mustHitIssues: ["dialogue_over_explains"] },
  });
  assert.equal(result.pass, true);
  assert.ok(result.expectedIssuesHit.includes("dialogue_over_explains"));
});

test("narrativeStyleRubric must_fail detects purple_prose_overload", () => {
  const result = evaluateNarrativeStyleCase({
    id: "mf_purple",
    kind: "must_fail",
    narrative: "那声音像钟声、像雷鸣、又像教堂最深处那口生锈了上百年的铜钟忽然被重重敲响。仿佛整个世界都在燃烧，绚烂得如同永恒的宿命。走廊尽头的灯管宛如深渊。",
    expect: { mustHitIssues: ["purple_prose_overload"] },
  });
  assert.equal(result.pass, true);
  assert.ok(result.expectedIssuesHit.includes("purple_prose_overload"));
});

test("narrativeStyleRubric must_fail detects info_density_low", () => {
  const result = evaluateNarrativeStyleCase({
    id: "mf_info_low",
    kind: "must_fail",
    // 需要 ≥40 个内容词才能触发 info_density_low；此处大量重复"我继续往前走"
    narrative: "我继续往前走。走廊里没有声音。我继续往前走。走廊两边有很多门。我继续往前走。每扇门都长得一样。我继续往前走。我没有停下脚步。我继续往前走。走廊还是没有尽头。我继续往前走。头顶灯管一直闪烁。我继续往前走。身后传来奇怪声音。我继续往前走。走廊好像越来越长。我继续往前走。我已经走了很久很久。我继续往前走。走廊越来越暗了。我继续往前走。前方有扇半开的门。我继续往前走。不知道还要走多远。",
    expect: { mustHitIssues: ["rhythm_variation_flat"] },
  });
  assert.equal(result.pass, true, `must_fail should pass: ${result.failures.join(",")}`);
  assert.ok(result.expectedIssuesHit.includes("rhythm_variation_flat"));
});

test("narrativeStyleRubric summary gate door logic", () => {
  const safePass = evaluateNarrativeStyleCase(baseCase({ id: "safe" }));
  const safePassB = evaluateNarrativeStyleCase(
    baseCase({ id: "safe_b", narrative: "我把校服袖口往下拽了拽，粉笔灰还粘在指节上。走廊灯忽然暗了一格。" })
  );
  const mechanicalFail = evaluateNarrativeStyleCase({
    id: "mfail_mech",
    kind: "must_fail",
    narrative: "系统提示：本回合判定成功。你获得了走廊钥匙。",
    sceneContext: { turnMode: "narrative_only" },
    expect: { mustHitIssues: ["mechanical_exposition"] },
  });

  const summary = summarizeNarrativeStyleEval([safePass, safePassB, mechanicalFail]);
  assert.equal(summary.total, 3);
  assert.equal(summary.goldenPassCount, 2);
  assert.equal(summary.goldenPassPass, 2);
  assert.equal(summary.mustFailCount, 1);
  assert.equal(summary.mustFailPass, 1);
  assert.equal(summary.gatePass, true);
});

test("narrativeStyleRubric summary gate fails when golden_pass fails", () => {
  const safePass = evaluateNarrativeStyleCase(baseCase({ id: "safe" }));
  const badGolden = evaluateNarrativeStyleCase(
    baseCase({
      id: "bad_golden",
      narrative: "系统提示：本回合判定成功。你获得了走廊钥匙。任务目标更新。",
    })
  );

  const summary = summarizeNarrativeStyleEval([safePass, badGolden]);
  assert.equal(summary.passCount, 1);
  assert.equal(summary.gatePass, false);
  assert.deepEqual(summary.failingIds, ["bad_golden"]);
});

test("narrativeStyleRubric summary gate fails when must_fail misses", () => {
  const mustFailMissed = evaluateNarrativeStyleCase({
    id: "mf_miss",
    kind: "must_fail",
    narrative: "刮擦声停了。停得太整齐——像对面也在数我的呼吸。门缝里没有风，灰却向外走。楼上有人停住了脚步。",
    sceneContext: { turnMode: "narrative_only" },
    expect: { mustHitIssues: ["sentence_rhythm_flat"] },
  });

  const summary = summarizeNarrativeStyleEval([mustFailMissed]);
  assert.equal(summary.gatePass, false);
  assert.equal(summary.mustFailPass, 0);
});

test("narrativeStyleRubric handles non-narrative_only golden pass without hard hook requirement", () => {
  const result = evaluateNarrativeStyleCase(
    baseCase({
      id: "gp_decision",
      narrative: "我把登记单翻了个面，背面的签名栏已经被人撕掉了。我走到门前，握着把手没有转动。走廊里有人在等我做出选择。",
      sceneContext: { turnMode: "decision_required", expectedRegister: "suspense" },
      expect: { mustNotHitIssues: ["sentence_rhythm_flat", "info_density_low"] },
    })
  );
  assert.equal(result.pass, true);
});
