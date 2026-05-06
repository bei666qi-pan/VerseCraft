import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { guardOptionsQualityToFour, isNonNarrativeOptionLike, parseOptionsArrayFromAiJson } from "./logicalTasks";

function collectProductSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectProductSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

test("parseOptionsArrayFromAiJson: keeps valid strings and dedupes", () => {
  assert.deepEqual(parseOptionsArrayFromAiJson(["a", "我走近门口", "我走近门口", "我停下听声"]), [
    "我走近门口",
    "我停下听声",
  ]);
});

test("parseOptionsArrayFromAiJson: skips too-short and too-long", () => {
  assert.deepEqual(parseOptionsArrayFromAiJson(["x", "我走近门口", "x".repeat(50)]), ["我走近门口"]);
});

test("isNonNarrativeOptionLike: blocks journal and menu-like options", () => {
  assert.equal(isNonNarrativeOptionLike("我查看灵感手记"), true);
  assert.equal(isNonNarrativeOptionLike("检查背包与随身物品"), true);
  assert.equal(isNonNarrativeOptionLike("我打开任务面板"), true);
  assert.equal(isNonNarrativeOptionLike("我用手电照向门缝"), false);
});

test("guardOptionsQualityToFour: high-duplicate outputs stay insufficient without local padding", () => {
  const out = guardOptionsQualityToFour({
    options: ["我先看看门", "我先看看门", "我先看看周围", "我先看看周围"],
    playerContext: "用户位置[B1_SafeZone]。主威胁状态：B1[A-001|active|30]。NPC当前位置：走廊尽头的保安室。",
    recentActionHint: "我拿出手机照明",
  });
  assert.deepEqual(out, ["我先看看门", "我先看看周围"]);
  assert.equal(out.length < 4, true);
});

test("guardOptionsQualityToFour: fewer than four valid model options are not padded", () => {
  const out = guardOptionsQualityToFour({
    options: ["我用手电照向门缝", "我贴墙听走廊动静", "我退回楼梯口观察"],
  });
  assert.deepEqual(out, ["我用手电照向门缝", "我贴墙听走廊动静", "我退回楼梯口观察"]);
});

test("options regen product paths must not import or call local template padding", () => {
  const banned = ["padOptionsFallbackToFour", "legacyPadOptionsForOfflineDevOnly"];
  const roots = ["src/app", "src/features", "src/lib/play", "src/lib/turnEngine"].map((p) => path.resolve(p));
  const offenders: string[] = [];
  for (const root of roots) {
    for (const file of collectProductSourceFiles(root)) {
      const src = fs.readFileSync(file, "utf8");
      if (banned.some((name) => src.includes(name))) offenders.push(path.relative(process.cwd(), file));
    }
  }
  assert.deepEqual(offenders, []);
});
