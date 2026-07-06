/**
 * gameStatePacket.test.ts — 验证游戏状态面板解析与构建的正确性
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildGameStatePacket, buildGameStatePacketCompact } from "./gameStatePacket";

// 模拟真实的 playerContext 字符串（取自 getPromptContext 的实际输出格式）
function makePlayerContext(overrides?: Record<string, string>): string {
  const parts: string[] = [];
  parts.push(overrides?.profile ?? "用户档案：姓名[林晚]，性别[女]，身高[165cm]，性格[谨慎]。");
  parts.push(overrides?.time ?? "游戏时间[第3日 14时]。");
  parts.push(overrides?.location ?? "用户位置[B1_Classroom_Corridor]。");
  parts.push(overrides?.stats ?? "当前属性：精神[7]，敏捷[5]，幸运[3]，魅力[6]，出身[4]。");
  parts.push(overrides?.talent ?? "回响天赋[生命汇源]。");
  parts.push(overrides?.profession ??
    "职业状态：当前[调查员]，已认证[调查员]，可认证[执行者/守夜人]，被动[线索敏锐/疑点嗅觉]。");
  parts.push(overrides?.professionBenefit ??
    "职业收益：当前[调查员]，被动摘要[线索敏锐]，主动摘要[现场还原]，主动可用[1]，命中率[0.75]，提示[在调查场景中可用]。");
  parts.push(overrides?.inventory ??
    "行囊道具：手电筒[flashlight|common]，绷带[bandage|common]，镇痛剂[painkiller|uncommon]。");
  parts.push(overrides?.originium ?? "原石[3]。");
  parts.push(overrides?.floorScore ?? "进度[最高层分450]。");
  parts.push(overrides?.deathCount ?? "死亡累计[1]。");
  parts.push(overrides?.sanity ?? "理智状态[85/100]。");
  parts.push(overrides?.tasks ??
    "任务追踪：调查楼梯间的血迹[进行中|正式|廖暗|B1]，寻找失踪档案[进行中|暗示|麟泽|1F]，B1锚点登记[可接取|正式|电工老刘|B1]。");
  parts.push(overrides?.talentCooldowns ??
    "天赋冷却：生命汇源[剩余2]，时间裂隙[剩余0]。");
  parts.push(overrides?.codex ??
    "图鉴已解锁：廖暗[npc|好感3]，麟泽[npc|好感1]，暗月残片[anomaly|好感0]。");
  parts.push(overrides?.weapon ??
    "主手武器[警用手电|稳定72|反制目眩|模组高亮]。");
  return parts.join("");
}

describe("buildGameStatePacket", () => {
  it("parses a complete playerContext into a structured dashboard", () => {
    const ctx = makePlayerContext();
    const result = buildGameStatePacket({ playerContext: ctx });

    // 资源
    assert.ok(result.includes("理智 85/100"), "should show sanity");
    assert.ok(result.includes("清醒"), "should show sanity band");
    assert.ok(result.includes("原石 3"), "should show originium");
    assert.ok(result.includes("精神7"), "should show stats");

    // 装备
    assert.ok(result.includes("警用手电"), "should show weapon");
    assert.ok(result.includes("稳定72"), "should show stability");
    assert.ok(result.includes("高亮"), "should show module");

    // 行囊
    assert.ok(result.includes("手电筒"), "should show inventory item");
    assert.ok(result.includes("common"), "should show item tier");

    // 职业
    assert.ok(result.includes("调查员"), "should show profession");
    assert.ok(result.includes("现场还原"), "should show active skill");
    assert.ok(result.includes("线索敏锐"), "should show passive");

    // 任务
    assert.ok(result.includes("调查楼梯间的血迹"), "should show task");
    assert.ok(result.includes("廖暗"), "should show task issuer");

    // 天赋
    assert.ok(result.includes("生命汇源"), "should show talent");
    assert.ok(result.includes("CD2h"), "should show cooldown");
    assert.ok(result.includes("就绪"), "should show ready talent");

    // 进度
    assert.ok(result.includes("450"), "should show floor score");
    assert.ok(result.includes("1 次"), "should show death count");
  });

  it("handles missing fields gracefully", () => {
    const ctx = makePlayerContext({
      weapon: "",
      profession: "职业状态：当前[无]，已认证[无]，可认证[无]，被动[无]。",
      professionBenefit: "职业收益：当前[无]，被动摘要[无]，主动摘要[无]，主动可用[0]，命中率[0]，提示[无]。",
      inventory: "行囊道具：空。",
      tasks: "任务追踪：无。",
      talentCooldowns: "天赋冷却：。",
      codex: "",
    });
    const result = buildGameStatePacket({ playerContext: ctx });

    // Should not crash and should still include what it can
    assert.ok(result.includes("原石 3"), "should still show originium");
    assert.ok(result.includes("理智 85/100"), "should still show sanity");

    // Should NOT include empty sections
    assert.ok(!result.includes("【主手】"), "should not show weapon section when no weapon");
    assert.ok(!result.includes("【行囊】"), "should not show inventory when empty");
    assert.ok(!result.includes("【职业】"), "should not show profession when none");
  });

  it("respects maxChars budget", () => {
    const ctx = makePlayerContext();
    const result = buildGameStatePacket({ playerContext: ctx, maxChars: 150 });
    assert.ok(result.length <= 150, `expected <=150 chars, got ${result.length}`);
  });

  it("returns a compact version within budget", () => {
    const ctx = makePlayerContext();
    const result = buildGameStatePacketCompact({ playerContext: ctx, maxChars: 100 });
    assert.ok(result.length <= 100, `expected <=100 chars, got ${result.length}`);
    // Check key info is preserved
    assert.ok(result.includes("理智"), "should have sanity");
    assert.ok(result.includes("原石"), "should have originium");
    assert.ok(result.includes("警用手电"), "should have weapon");
  });

  it("handles empty playerContext", () => {
    const result = buildGameStatePacket({ playerContext: "" });
    assert.ok(typeof result === "string");
    const lines = result.split("\n");
    // Should only have the header and 【进度】 which might have no data
    assert.ok(lines.length < 15, "empty context produces minimal output");
  });

  it("handles weird NBSPs and half-width characters", () => {
    const ctx = makePlayerContext({
      originium: "原石[ 5 ]。",
      sanity: "理智状态[ 60 / 100 ]。",
    });
    const result = buildGameStatePacket({ playerContext: ctx });
    // Regex-based parsing may miss these, but should not crash
    assert.ok(typeof result === "string");
  });
});

describe("buildGameStatePacketCompact", () => {
  it("produces a single-line summary", () => {
    const ctx = makePlayerContext();
    const result = buildGameStatePacketCompact({ playerContext: ctx });
    assert.ok(!result.includes("\n"), "compact should be single line");
    assert.ok(result.startsWith("【状态】"), "should start with status label");
  });
});
