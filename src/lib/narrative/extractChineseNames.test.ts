/**
 * extractChineseNames.test.ts — v4 全链路人名白名单核心测试
 */
import test from "node:test";
import assert from "node:assert/strict";
import { extractChineseNames } from "./extractChineseNames";
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