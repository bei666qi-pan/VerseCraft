/**
 * extractChineseNames.test.ts — v4 全链路人名白名单核心测试
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  extractChineseNames,
  isHighConfidenceUnregisteredPersonName,
  redactHighConfidenceUnregisteredPersonNames,
} from "./extractChineseNames";
import { NPCS } from "@/lib/registry/npcs";
import { NPC_ALIAS_FLAT_SET } from "@/lib/registry/npcAliases";

const registered = new Set<string>([
  ...NPCS.map((n) => n.name),
  ...NPC_ALIAS_FLAT_SET,
]);
const aliases = NPC_ALIAS_FLAT_SET;

function candidates(narrative: string): string[] {
  return extractChineseNames(narrative, { registeredNames: registered, aliases })
    .filter((e) => e.candidate)
    .map((e) => e.token);
}

test("含已注册真名不报 (陈婆婆/周伯/阿织/阿绣/红姨)", () => {
  assert.deepEqual(candidates("陈婆婆坐在一楼长椅。"), []);
  assert.deepEqual(candidates("周伯摸着白手杖。"), []);
  assert.deepEqual(candidates("阿织和阿绣手拉手走出 6 楼走廊。"), []);
  assert.deepEqual(candidates("红姨推着车走来。"), []);
});

test("含 alias 不报 (老王/老周/红姨/陶师)", () => {
  assert.deepEqual(candidates("老王敲了敲门。"), []);
  assert.deepEqual(candidates("老周在 4 楼徘徊。"), []);
  assert.deepEqual(candidates("陶师在厨房里剁肉。"), []);
});

test("纯陌生人名报 (陈昆/李明/赵四海)", () => {
  assert.deepEqual(candidates("陈昆走进 4 楼。"), ["陈昆"]);
  assert.deepEqual(candidates("李明回头看了一眼。"), ["李明"]);
  assert.deepEqual(candidates("赵四海笑着说再见。"), ["赵四海"]);
});

test("单字场景词不报 (窗户/树叶/枫叶)", () => {
  assert.deepEqual(candidates("窗户飘进一片枫叶。"), []);
  assert.deepEqual(candidates("树叶落了一地。"), []);
});

test("描述性词不报 (中年男人/灰衣)", () => {
  assert.deepEqual(candidates("中年男人穿着灰衣走来。"), []);
  assert.deepEqual(candidates("年轻女人站在楼梯口。"), []);
});

test("物品不被拆出误报 (黄铜钥匙/白手杖/茶壶)", () => {
  assert.deepEqual(candidates("你捡起地上的黄铜钥匙。"), []);
  assert.deepEqual(candidates("周伯的白手杖倒在地上。"), []);
  assert.deepEqual(candidates("红姨端着一只茶壶。"), []);
});

test("safe narrative 不报", () => {
  const safe =
    "你停下脚步，环顾四周。空气里有种说不清的安静，像有人在看着你。";
  assert.deepEqual(candidates(safe), []);
});

test("混合多人名 + 已注册真名", () => {
  const text = "陈婆婆坐在门前；陈昆从楼梯走下来，周伯在远处抬头。";
  const c = candidates(text);
  assert.ok(c.includes("陈昆"), `expected 陈昆 in ${c.join(",")}`);
  assert.ok(!c.includes("陈婆婆"));
  assert.ok(!c.includes("周伯"));
});

test("长 narrative 含多个陌生人名", () => {
  const text = "李明和张三并肩走来。";
  const c = candidates(text);
  assert.ok(c.includes("李明"));
  assert.ok(c.includes("张三"));
});

test("特殊 NPC alias 不报 (章姐/红姨/绣儿/陶师/织儿)", () => {
  assert.deepEqual(candidates("章姐在 6 楼楼梯间徘徊。"), []);
  assert.deepEqual(candidates("绣儿安静地站着。"), []);
  assert.deepEqual(candidates("织儿笑了笑。"), []);
});

test("老/小前缀 + 姓氏 报", () => {
  assert.deepEqual(candidates("老钱在锅炉房外蹲着。"), ["老钱"]);
  // 小林 是 N-040 alias，不报
  assert.deepEqual(candidates("小林从画室走出来。"), []);
});

test("context 标记正确", () => {
  const r = extractChineseNames("陈昆走进 4 楼。", {
    registeredNames: registered,
    aliases,
  });
  const candidate = r.find((e) => e.candidate);
  assert.ok(candidate);
  assert.match(candidate!.contextAfter, /4/);
});

test("final guard 仅将人称谓词后的陌生姓名视为高置信", () => {
  const named = extractChineseNames("陈昆从楼梯走下来。", { registeredNames: registered, aliases })
    .find((entry) => entry.candidate);
  assert.ok(named);
  assert.equal(isHighConfidenceUnregisteredPersonName(named!), true);

  const descriptive = extractChineseNames("陈旧的木门上多了一道划痕。", { registeredNames: registered, aliases })
    .find((entry) => entry.candidate);
  assert.ok(descriptive);
  assert.equal(isHighConfidenceUnregisteredPersonName(descriptive!), false);
});

test("高置信陌生姓名仅匿名化，不丢弃叙事其余内容", () => {
  const narrative = "陈昆从楼梯走下来，递给你一把生锈的钥匙。";
  const entries = extractChineseNames(narrative, { registeredNames: registered, aliases });
  assert.equal(
    redactHighConfidenceUnregisteredPersonNames(narrative, entries),
    "陌生人从楼梯走下来，递给你一把生锈的钥匙。",
  );
});

test("物品署名与口语姓名所有格属于高置信陌生人名", () => {
  const label = "螺丝刀柄上贴着胶布，写着「7F-阿珍」。";
  const labelEntries = extractChineseNames(label, { registeredNames: registered, aliases });
  assert.ok(labelEntries.some((entry) => entry.token === "阿珍" && isHighConfidenceUnregisteredPersonName(entry)));
  assert.equal(redactHighConfidenceUnregisteredPersonNames(label, labelEntries).includes("阿珍"), false);

  const possessive = "这是阿珍的东西，你从阿珍那儿借来的。";
  const possessiveEntries = extractChineseNames(possessive, { registeredNames: registered, aliases });
  assert.ok(possessiveEntries.filter((entry) => entry.token === "阿珍").every(isHighConfidenceUnregisteredPersonName));
});

test("quoted 叫名语境将真实虚构姓名判为高置信", () => {
  const entries = extractChineseNames("登记册上有一个叫“周远”的名字。", { registeredNames: registered, aliases });
  const zhou = entries.find((entry) => entry.token === "周远");
  assert.ok(zhou);
  assert.equal(isHighConfidenceUnregisteredPersonName(zhou!), true);
  const sentence = "保安说他叫“周远”，周远在门口值夜。";
  const sentenceEntries = extractChineseNames(sentence, { registeredNames: registered, aliases });
  assert.equal(
    redactHighConfidenceUnregisteredPersonNames(sentence, sentenceEntries),
    "保安说他的名字还没有得到确认，陌生人在门口值夜。",
  );
});

test("描述性陈旧仍不得因所有格规则被匿名化", () => {
  const narrative = "陈旧的木门上多了一道划痕。";
  const entries = extractChineseNames(narrative, { registeredNames: registered, aliases });
  assert.equal(redactHighConfidenceUnregisteredPersonNames(narrative, entries), narrative);
});

test("核心玩法术语不得从词中间被匿名化", () => {
  for (const narrative of [
    "我把原石放在掌心。",
    "三颗原石在口袋里硌着指腹。",
    "检查任务列表和职业试炼。",
  ]) {
    const entries = extractChineseNames(narrative, { registeredNames: registered, aliases });
    assert.equal(redactHighConfidenceUnregisteredPersonNames(narrative, entries), narrative);
  }
});

test("量词张与后续动词不得被误判为临时人物", () => {
  const narrative = "另一张纸条旁是一张钉在铁丝网里的表格。";
  const entries = extractChineseNames(narrative, { registeredNames: registered, aliases });
  assert.equal(redactHighConfidenceUnregisteredPersonNames(narrative, entries), narrative);

  const actualName = "我看见张三走进大堂。";
  const actualEntries = extractChineseNames(actualName, { registeredNames: registered, aliases });
  assert.equal(redactHighConfidenceUnregisteredPersonNames(actualName, actualEntries).includes("张三"), false);
});

test("地点方向词不得被匿名化为陌生人", () => {
  for (const narrative of [
    "欣蓝从电梯口方向走过来。",
    "我朝出口方向走去。",
    "前方传来塑料袋的轻响。",
    "然后向走廊尽头那团难以言状的阴影挺进。",
  ]) {
    const entries = extractChineseNames(narrative, { registeredNames: registered, aliases });
    assert.equal(redactHighConfidenceUnregisteredPersonNames(narrative, entries), narrative);
  }
});
