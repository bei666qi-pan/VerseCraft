import test from "node:test";
import assert from "node:assert/strict";
import { applyCompositeNarrativeGuard } from "./compositeNarrativeGuard";

function withGuardEnv<T>(fn: () => T): T {
  const prev = {
    c: process.env.VERSECRAFT_ENABLE_COMPOSITE_NARRATIVE_GUARD,
    cont: process.env.VERSECRAFT_ENABLE_CONTINUITY_GUARD,
    pov: process.env.VERSECRAFT_ENABLE_FIRST_PERSON_GUARD,
    g: process.env.VERSECRAFT_ENABLE_GENDER_PRONOUN_GUARD,
  };
  process.env.VERSECRAFT_ENABLE_COMPOSITE_NARRATIVE_GUARD = "1";
  process.env.VERSECRAFT_ENABLE_CONTINUITY_GUARD = "1";
  process.env.VERSECRAFT_ENABLE_FIRST_PERSON_GUARD = "1";
  process.env.VERSECRAFT_ENABLE_GENDER_PRONOUN_GUARD = "1";
  try {
    return fn();
  } finally {
    if (prev.c === undefined) delete process.env.VERSECRAFT_ENABLE_COMPOSITE_NARRATIVE_GUARD;
    else process.env.VERSECRAFT_ENABLE_COMPOSITE_NARRATIVE_GUARD = prev.c;
    if (prev.cont === undefined) delete process.env.VERSECRAFT_ENABLE_CONTINUITY_GUARD;
    else process.env.VERSECRAFT_ENABLE_CONTINUITY_GUARD = prev.cont;
    if (prev.pov === undefined) delete process.env.VERSECRAFT_ENABLE_FIRST_PERSON_GUARD;
    else process.env.VERSECRAFT_ENABLE_FIRST_PERSON_GUARD = prev.pov;
    if (prev.g === undefined) delete process.env.VERSECRAFT_ENABLE_GENDER_PRONOUN_GUARD;
    else process.env.VERSECRAFT_ENABLE_GENDER_PRONOUN_GUARD = prev.g;
  }
}

test("composite：连续性+POV+gender 顺序裁决（不破坏对白内的你/他）", () => {
  withGuardEnv(() => {
    const latestUserInput = "我压低声音问灵伤：你刚才听见什么？";
    const bad =
      "你刚才压低声音问灵伤：你刚才听见什么？灵伤抬头，他的笑很亮。她说：“你别动。”";
    const { narrative, telemetry } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput,
      previousTailSummary: "灯管一明一灭，刮擦声还在。",
      focusNpcId: "N-020",
      presentNpcIds: ["N-020"],
    });
    assert.equal(telemetry.rewriteTriggered, true);
    // POV：旁白禁你
    assert.equal(/(^|[。！？\n\r”])\s*你(看见|听见|走向|刚才)/.test(narrative), false);
    // gender：灵伤 female 不应“他的笑”
    assert.equal(narrative.includes("灵伤抬头，他的笑"), false);
    assert.ok(narrative.includes("她的笑") || narrative.includes("灵伤抬头，她"));
    // 对白允许你
    assert.ok(narrative.includes("她说：“你别动。”"));
  });
});

test("composite：男性角色不误修（北夏 N-018 male）", () => {
  withGuardEnv(() => {
    const { narrative, telemetry } = applyCompositeNarrativeGuard({
      narrative: "北夏笑了一声，他把价码写得很轻。",
      latestUserInput: "我看向北夏",
      previousTailSummary: null,
      focusNpcId: "N-018",
      presentNpcIds: ["N-018"],
    });
    assert.equal(telemetry.genderValidatorTriggered, false);
    assert.equal(narrative, "北夏笑了一声，他把价码写得很轻。");
  });
});

test("composite：动作复述/解释腔会触发 continuity 开头重写", () => {
  withGuardEnv(() => {
    const latest = "我观察走廊尽头的门缝。";
    const bad = "你刚才观察走廊尽头的门缝，所以你发现了一些东西。灯管闪了一下。";
    const { narrative, telemetry } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput: latest,
      previousTailSummary: "刮擦声一下下数着。",
      focusNpcId: null,
      presentNpcIds: [],
    });
    assert.equal(telemetry.continuityValidatorTriggered, true);
    assert.ok(narrative.startsWith("我压下呼吸"));
  });
});

test("composite：对白类残留标签（玩家说/你说/玩家输入）会被全文清洗为自然对白", () => {
  withGuardEnv(() => {
    const latest = "我压低声音对灵伤说：别出声，我们先躲一下。";
    const bad =
      "玩家输入：我压低声音对灵伤说：别出声，我们先躲一下。\n" +
      "玩家说：别出声，我们先躲一下。灵伤抬眼，你说：快点。\n" +
      "你刚才说的“我压低声音对灵伤说：别出声，我们先躲一下。”在空中打了个折。";
    const { narrative } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput: latest,
      previousTailSummary: "走廊深处像有东西在磨。",
      focusNpcId: "N-020",
      presentNpcIds: ["N-020"],
    });
    assert.equal(/玩家输入[:：]/.test(narrative), false);
    assert.equal(/玩家说[:：]/.test(narrative), false);
    assert.equal(/你说[:：]/.test(narrative), false);
    // Must preserve immersion: dialogue should be in Chinese quotes.
    assert.ok(narrative.includes("“别出声，我们先躲一下。”") || narrative.includes("“别出声"));
  });
});

test("golden：玩家观察环境（短输入）— 不解释动作，不二人称旁白", () => {
  withGuardEnv(() => {
    const latest = "我查看墙角的铁牌。";
    const bad = "你查看墙角的铁牌，你发现上面写着如月公寓。";
    const { narrative } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput: latest,
      previousTailSummary: "灯管忽明忽暗。",
      focusNpcId: null,
      presentNpcIds: [],
    });
    assert.equal(narrative.includes("你查看"), false);
    assert.ok(narrative.startsWith("我"));
  });
});

test("golden：玩家与女性 NPC 对话（灵伤）— 她/对白你都正确", () => {
  withGuardEnv(() => {
    const latest = "我问灵伤：你有没有受伤？";
    const bad = "你问灵伤有没有受伤。灵伤点头，他的声音发轻：“你别管我。”";
    const { narrative } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput: latest,
      previousTailSummary: null,
      focusNpcId: "N-020",
      presentNpcIds: ["N-020"],
    });
    assert.equal(narrative.includes("灵伤点头，他"), false);
    assert.ok(narrative.includes("她的声音") || narrative.includes("灵伤点头，她"));
    assert.ok(narrative.includes("“你别管我。”"));
  });
});

test("golden：玩家与高魅力 NPC 试探（欣蓝）— 不写成他，不二人称旁白", () => {
  withGuardEnv(() => {
    const latest = "我压低声音问欣蓝：这张表到底登记什么？";
    const bad = "你压低声音问欣蓝这张表登记什么。欣蓝把表推过来，他的目光很稳。";
    const { narrative } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput: latest,
      previousTailSummary: "纸边像潮过。",
      focusNpcId: "N-010",
      presentNpcIds: ["N-010"],
    });
    assert.equal(narrative.includes("你压低"), false);
    assert.equal(narrative.includes("欣蓝把表推过来，他的"), false);
    assert.ok(narrative.includes("她的目光") || narrative.includes("欣蓝把表推过来，她"));
  });
});

test("golden：首轮承接（opening-like）— 允许短，但不出现你旁白", () => {
  withGuardEnv(() => {
    const latest = "。";
    const bad = "你睁开眼，灯管一明一灭。";
    const { narrative } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput: latest,
      previousTailSummary: "刮擦声还在。",
      focusNpcId: null,
      presentNpcIds: [],
    });
    assert.ok(narrative.startsWith("我"));
    assert.equal(narrative.includes("你睁开眼"), false);
  });
});

test("golden：连续两回合承接（第二回合不另起开场）", () => {
  withGuardEnv(() => {
    const latest = "我把手按在门框上。";
    const bad = "你把手按在门框上，然后你感觉到冰冷。";
    const { narrative } = applyCompositeNarrativeGuard({
      narrative: bad,
      latestUserInput: latest,
      previousTailSummary: "门缝里有一线风。",
      focusNpcId: null,
      presentNpcIds: [],
    });
    assert.equal(narrative.includes("然后你"), false);
    assert.ok(narrative.startsWith("我"));
  });
});

