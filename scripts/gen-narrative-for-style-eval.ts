/**
 * Generate fresh DM outputs from live /api/chat and prepare for narrative-style judge.
 * Usage: pnpm dlx tsx scripts/gen-narrative-for-style-eval.ts
 */
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: [".env.local", ".env"] });

const BASE_URL = "http://127.0.0.1:666";
const TIMEOUT_MS = 120_000;

interface Scenario {
  id: string;
  scenario: string;
  input: string;
  context?: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "combat-dark-creature",
    scenario: "玩家在三楼走廊遭遇暗影生物，拔出武器反击",
    input: "拔出腰间的匕首，对准暗处逼近的扭曲身影刺去",
    context: "三楼走廊灯光闪烁，阴影中传来窸窣声。你的匕首是唯一武器。",
  },
  {
    id: "exploration-mysterious-door",
    scenario: "玩家在公寓探索中发现一扇隐藏的门",
    input: "用手指轻轻抚摸门上的划痕，试图辨认刻的是什么",
    context: "走廊尽头有一扇嵌在墙里的铁门，门上布满深浅不一的划痕，像某种符号。",
  },
  {
    id: "social-npc-encounter",
    scenario: "玩家在B1休息区遇到NPC林晚枫，试图交谈",
    input: "走到林晚枫身边坐下，轻声问她对这栋公寓知道多少",
    context: "B1休息区灯光柔和，林晚枫独自坐在角落看书，偶尔抬头望你一眼。",
  },
  {
    id: "investigation-hidden-clue",
    scenario: "玩家调查可疑物品寻找线索",
    input: "蹲下身，用手机屏幕的光仔细照看地板上的铜屑",
    context: "305号房门口的地板上散落着细小的铜屑，在闪烁的灯光下若隐若现。",
  },
  {
    id: "tense-escape-scene",
    scenario: "玩家感到危险逼近，需要迅速做出决定",
    input: "屏住呼吸，背靠墙壁缓缓后退，同时留意最近的出口方向",
    context: "走廊深处传来沉重的脚步声，越来越近。灯光一盏接一盏地熄灭。",
  },
];

async function fetchDmOutput(scenario: Scenario): Promise<{
  id: string;
  narrative: string;
  dmJson: Record<string, unknown>;
  options: string[];
}> {
  const requestId = `style-eval-${scenario.id}-${Date.now()}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Connection: "close",
        "x-versecraft-client-fingerprint": `si-eval-${requestId}`,
      },
      body: JSON.stringify({
        sessionId: requestId,
        latestUserInput: scenario.input,
        messages: [{ role: "user", content: scenario.input }],
        clientState: {
          playerLocation: "三楼走廊",
          nearbyNpcs: scenario.id.includes("social") ? ["林晚枫"] : [],
        },
      }),
      signal: ac.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("no_body");

    const decoder = new TextDecoder();
    let buffer = "";
    let finalJson: Record<string, unknown> | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }

    // Parse SSE data events
    const events = buffer.split(/\n\n/);
    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: __VERSECRAFT_FINAL__")) {
          try {
            finalJson = JSON.parse(line.slice(line.indexOf("{")).trim());
          } catch {
            // parse error
          }
        }
      }
    }

    if (!finalJson) {
      // Fallback: look for narrative in any data event
      for (const event of events) {
        const lines = event.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && !line.includes("__VERSECRAFT_")) {
            const text = line.slice(6).trim();
            if (text.length > 10 && !text.startsWith("{")) {
              // accumulate visible text
              if (!finalJson) finalJson = { narrative: text, options: [] };
            }
          }
        }
      }
    }

    const narrative = (finalJson?.narrative as string) ?? "";
    const options = Array.isArray(finalJson?.options)
      ? (finalJson.options as string[])
      : [];

    console.log(`  ✅ ${scenario.id}: ${narrative.length} chars, ${options.length} options`);
    return { id: scenario.id, narrative, dmJson: finalJson ?? {}, options };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`Generating DM outputs for ${SCENARIOS.length} scenarios...\n`);

  const results = [];
  for (const scenario of SCENARIOS) {
    console.log(`  Processing: ${scenario.id}...`);
    try {
      const result = await fetchDmOutput(scenario);
      if (result.narrative) {
        results.push({
          id: result.id,
          scenario: scenario.scenario,
          narrative: result.narrative,
          userInput: scenario.input,
          dmJson: result.dmJson,
          options: result.options,
          gameContext: scenario.context ?? scenario.scenario,
        });
      } else {
        console.log(`  ⚠️ ${scenario.id}: no narrative extracted`);
      }
    } catch (e) {
      console.error(`  ❌ ${scenario.id}: ${(e as Error).message}`);
    }
  }

  const outPath = resolve(".runtime-data", "narrative-style-live-new-outputs.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDone: ${results.length}/${SCENARIOS.length} outputs written to ${outPath}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
