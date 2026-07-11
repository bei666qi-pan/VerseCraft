import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractImageryKeys, classifyNarrativeHookType, insertPacingLedgerRow } from "./pacingLedger";

describe("extractImageryKeys", () => {
  test("returns empty for empty narrative", () => {
    assert.deepEqual(extractImageryKeys(""), []);
    assert.deepEqual(extractImageryKeys("  "), []);
  });

  test("returns B1 key when boilers described", () => {
    const result = extractImageryKeys("昏暗的值班室里，锅炉管道在墙边蜿蜒，工具墙上挂满扳手。");
    assert.ok(result.includes("B1"));
  });

  test("returns 1F key when lobby described", () => {
    const result = extractImageryKeys("大堂登记台后面坐着保安，天花板日光灯兹兹作响。");
    assert.ok(result.includes("1F"));
  });

  test("returns 夜晚 key when night imagery appears", () => {
    const result = extractImageryKeys("路灯投影在地面，手机屏幕微光照亮了门缝。");
    assert.ok(result.includes("夜晚"));
  });

  test("returns multiple keys", () => {
    const result = extractImageryKeys("走廊灯管闪烁，楼梯间的墙皮剥落，暖气片在夜里发出响声。");
    assert.ok(result.includes("通用"));
    assert.ok(result.includes("3F"));
  });

  test("returns no keys for non-imagery text", () => {
    const result = extractImageryKeys("他看了我一眼，然后低头继续写东西。");
    assert.equal(result.length, 0);
  });
});

describe("classifyNarrativeHookType", () => {
  test("returns none for empty text", () => {
    assert.equal(classifyNarrativeHookType(""), "none");
  });

  test("detects question hook", () => {
    assert.equal(classifyNarrativeHookType("我推开门，走廊里什么也没有。这是怎么回事？"), "question");
  });

  test("detects threat hook", () => {
    assert.equal(classifyNarrativeHookType("脚步声从背后逼近，越来越近。"), "threat");
  });

  test("detects dilemma hook", () => {
    assert.equal(classifyNarrativeHookType("你应该选哪条路？留下还是离开？"), "dilemma");
  });

  test("detects bond hook", () => {
    assert.equal(classifyNarrativeHookType("她把伞塞进我手里，笑了笑。"), "bond");
  });

  test("detects reveal hook", () => {
    assert.equal(classifyNarrativeHookType("门牌上写着我的名字。"), "reveal");
  });

  test("returns none for no matching patterns", () => {
    assert.equal(classifyNarrativeHookType("我坐下来，喝了口水。"), "none");
  });
});

describe("insertPacingLedgerRow (smoke test — function exists with correct shape)", () => {
  test("insertPacingLedgerRow is a function", () => {
    assert.equal(typeof insertPacingLedgerRow, "function");
  });
});
