import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resetProviderCircuitsForTests } from "@/lib/ai/fallback/circuitBreaker";
import { resetModelCircuitsForTests } from "@/lib/ai/fallback/modelCircuit";
import {
  generateOptionsOnlyFallback,
  guardOptionsQualityToFour,
  isNonNarrativeOptionLike,
  parseOptionsArrayFromAiJson,
} from "./logicalTasks";

function patchEnv(updates: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(updates)) {
    prev[k] = process.env[k];
    const v = updates[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of Object.keys(updates)) {
      const o = prev[k];
      if (o === undefined) delete process.env[k];
      else process.env[k] = o;
    }
  };
}

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

test("generateOptionsOnlyFallback retries one transient empty model response without local padding", async (t) => {
  const restore = patchEnv({
    AI_GATEWAY_BASE_URL: "https://gw.options.test",
    AI_GATEWAY_API_KEY: "k",
    AI_MODEL_MAIN: "model-main",
    AI_MODEL_CONTROL: "model-control",
    AI_MODEL_ENHANCE: "model-enhance",
    AI_MODEL_REASONER: "model-reasoner",
    AI_ONLINE_SHORT_JSON_DISABLE_MAIN_FALLBACK: "1",
    AI_ONLINE_SHORT_JSON_MAX_RETRIES: "0",
    AI_MAX_RETRIES: "0",
    AI_CIRCUIT_FAILURE_THRESHOLD: "99",
  });
  const origFetch = globalThis.fetch;
  let fetchCount = 0;
  const seenMaxTokens: unknown[] = [];
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    fetchCount += 1;
    const body = JSON.parse(String(init?.body)) as {
      max_tokens?: number;
      response_format?: { type?: string };
      enable_thinking?: boolean;
      thinking?: { type?: string };
    };
    seenMaxTokens.push(body.max_tokens);
    assert.equal(body.response_format?.type, "json_object");
    assert.equal(body.enable_thinking, false);
    assert.equal(body.thinking?.type, "disabled");
    if (fetchCount === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "{\"options\":[\"我俯身查看门缝水迹\",\"我用手电照向防火门\",\"我后退贴墙听楼道动静\",\"我低声询问门后是谁\"]}",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const res = await generateOptionsOnlyFallback({
    narrative: "门缝下有水迹，楼道尽头传来电流声。",
    latestUserInput: "刷新行动选项",
    playerContext: "位置：三楼楼道；道具：手电筒。",
    ctx: { requestId: "options-empty-retry", userId: null, sessionId: "s", path: "/api/chat" },
    budgetMs: 8_500,
  });

  assert.equal(fetchCount, 2);
  assert.deepEqual(seenMaxTokens, [640, 640]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.options, [
    "我俯身查看门缝水迹",
    "我用手电照向防火门",
    "我后退贴墙听楼道动静",
    "我低声询问门后是谁",
  ]);
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
