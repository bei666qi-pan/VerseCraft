import test from "node:test";
import assert from "node:assert/strict";
import { classifyNarrativeRegister } from "./registerClassifier";

test("classifyNarrativeRegister classifies suspense narrative", () => {
  const result = classifyNarrativeRegister(
    "灯管闪了两下。走廊尽头的黑暗里有刮擦声。我停在原地，没有回答。门后有什么东西在逼近。"
  );
  assert.equal(result.register, "suspense");
  assert.ok(result.scores.suspense >= 2);
});

test("classifyNarrativeRegister classifies wit narrative", () => {
  const result = classifyNarrativeRegister(
    "我把登记单翻了个面，背面的签名栏已经被人撕掉了。日期对不上，线索在缺口处拼合。"
  );
  assert.equal(result.register, "wit");
  assert.ok(result.scores.wit >= 2);
});

test("classifyNarrativeRegister classifies levity narrative", () => {
  const result = classifyNarrativeRegister(
    "我从口袋翻出半截铅笔和一块薄荷糖。她笑了：这就是你的全部装备？我挑眉：还有一口袋计划。"
  );
  assert.equal(result.register, "levity");
});

test("classifyNarrativeRegister classifies warmth narrative", () => {
  const result = classifyNarrativeRegister(
    "她把能量块掰成两半，一半塞进我掌心。伞柄还带着她掌心的温度。走廊冷，你先拿着。"
  );
  assert.equal(result.register, "warmth");
});

test("classifyNarrativeRegister classifies payoff narrative", () => {
  const result = classifyNarrativeRegister(
    "登记表那一半上，是我的名字。不是写上去的——是印上去的。原来她早就把我的名字写在了我看不见的那一半上。"
  );
  assert.equal(result.register, "payoff");
});

test("classifyNarrativeRegister defaults to suspense for short ambiguous input", () => {
  const result = classifyNarrativeRegister("我推开门，走了进去。");
  assert.equal(result.register, "suspense");
});

test("classifyNarrativeRegister returns topKeywords", () => {
  const result = classifyNarrativeRegister("脚步声忽然停了。灯管闪烁。黑暗里有声音。");
  assert.ok(result.topKeywords.length > 0);
});
