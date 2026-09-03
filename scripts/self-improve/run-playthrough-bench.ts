#!/usr/bin/env tsx
/**
 * Gameplay Benchmark Runner
 *
 * Runs diverse gameplay scenarios against the live API, extracts trace IDs,
 * evaluates each turn with the LLM judge, and collects all scores in Langfuse.
 *
 * Usage:
 *   pnpm tsx scripts/self-improve/run-playthrough-bench.ts
 *   pnpm tsx scripts/self-improve/run-playthrough-bench.ts --mock (heuristic only)
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = process.env.API_BASE ?? "http://localhost:666";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Scenario {
  name: string;
  category: "explore" | "npc_interaction" | "combat" | "item_use" | "investigation" | "craft";
  input: string;
  expectedFlags: string[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "explore-third-floor",
    category: "explore",
    input: "沿着三楼走廊慢慢走，看看两边的门牌号和房间状态。",
    expectedFlags: ["is_action_legal", "narrative_contains_floor"],
  },
  {
    name: "npc-talk-linwanfeng",
    category: "npc_interaction",
    input: "我找到林晚枫，问他最近有没有在公寓里发现什么异常。",
    expectedFlags: ["is_action_legal", "npc_named"],
  },
  {
    name: "explore-dark-corridor",
    category: "explore",
    input: "走廊尽头的灯灭了，我打开手电筒，小心翼翼地往前探。",
    expectedFlags: ["is_action_legal", "tension_described"],
  },
  {
    name: "investigate-room-402",
    category: "investigation",
    input: "402房间的门虚掩着，我推开门，仔细检查里面的每一个角落，看看能找到什么线索。",
    expectedFlags: ["is_action_legal", "clue_possible"],
  },
  {
    name: "npc-ask-chenpopo",
    category: "npc_interaction",
    input: "我敲了敲一楼陈婆婆的门，想问问她关于公寓规则的事情。",
    expectedFlags: ["is_action_legal", "npc_reference"],
  },
  {
    name: "item-use-flashlight",
    category: "item_use",
    input: "我从背包里拿出手电筒，照向黑暗的楼梯间。",
    expectedFlags: ["is_action_legal", "item_mentioned"],
  },
  {
    name: "craft-forge-dagger",
    category: "craft",
    input: "我收集了几块铁矿石，在简陋的工作台上尝试锻造一把匕首。",
    expectedFlags: ["is_action_legal", "forge_attempt"],
  },
  {
    name: "combat-encounter",
    category: "combat",
    input: "黑暗中有东西在动！我握紧手中的武器，摆出防御姿态。",
    expectedFlags: ["is_action_legal", "threat_present"],
  },
];

interface TurnResult {
  scenario: string;
  category: string;
  status: "ok" | "error";
  traceId: string;
  isActionLegal: boolean;
  narrativeLen: number;
  optionsCount: number;
  durationMs: number;
  error?: string;
}

async function callApi(scenario: Scenario): Promise<TurnResult> {
  const startedAt = Date.now();
  const sessionId = `bench-${scenario.name}-${Date.now()}`;

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        sessionId,
        latestUserInput: scenario.input,
        messages: [{ role: "user", content: scenario.input }],
        clientState: {},
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      return {
        scenario: scenario.name,
        category: scenario.category,
        status: "error",
        traceId: "",
        isActionLegal: false,
        narrativeLen: 0,
        optionsCount: 0,
        durationMs: Date.now() - startedAt,
        error: `HTTP ${res.status}`,
      };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return {
        scenario: scenario.name,
        category: scenario.category,
        status: "error",
        traceId: "",
        isActionLegal: false,
        narrativeLen: 0,
        optionsCount: 0,
        durationMs: Date.now() - startedAt,
        error: "No body reader",
      };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalJsonStr = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ") && line.includes("__VERSECRAFT_FINAL__:")) {
          const idx = line.indexOf("__VERSECRAFT_FINAL__:");
          finalJsonStr = line.slice(idx + "__VERSECRAFT_FINAL__:".length);
        }
      }
    }

    if (!finalJsonStr) {
      return {
        scenario: scenario.name,
        category: scenario.category,
        status: "error",
        traceId: "",
        isActionLegal: false,
        narrativeLen: 0,
        optionsCount: 0,
        durationMs: Date.now() - startedAt,
        error: "No FINAL frame",
      };
    }

    const dmJson = JSON.parse(finalJsonStr);
    const traceId = (dmJson._langfuse_trace_id as string) || "";
    const narrative = (dmJson.narrative as string) || "";
    const options = Array.isArray(dmJson.options) ? (dmJson.options as string[]) : [];

    return {
      scenario: scenario.name,
      category: scenario.category,
      status: "ok",
      traceId,
      isActionLegal: dmJson.is_action_legal === true,
      narrativeLen: narrative.length,
      optionsCount: options.length,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      scenario: scenario.name,
      category: scenario.category,
      status: "error",
      traceId: "",
      isActionLegal: false,
      narrativeLen: 0,
      optionsCount: 0,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function judgeTurn(turn: TurnResult, mockMode: boolean): Promise<void> {
  if (!turn.traceId || turn.status !== "ok") {
    console.log(`  ⏭️  Skipping judge (no trace ID or error)`);
    return;
  }

  const mockFlag = mockMode ? " --mock" : "";
  const judgeScript = resolve(__dirname, "llm-judge.ts");
  try {
    execSync(
      `pnpm tsx '${judgeScript}' --trace-id '${turn.traceId}'${mockFlag}`,
      { stdio: "pipe", timeout: 40_000, encoding: "utf-8" },
    );
  } catch (err) {
    console.log(`  ⚠️  Judge failed: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`);
  }
}

async function main() {
  const mockMode = process.argv.includes("--mock");

  console.log("=".repeat(70));
  console.log("VerseCraft Gameplay Benchmark — Real Trajectory Evaluation");
  console.log(`API: ${API_BASE} | Mode: ${mockMode ? "heuristic" : "LLM"}`);
  console.log("=".repeat(70));

  const results: TurnResult[] = [];
  let okCount = 0;
  let errCount = 0;

  // Run scenarios sequentially to avoid overwhelming the server
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    console.log(`\n[${i + 1}/${SCENARIOS.length}] ${scenario.name} (${scenario.category})`);
    console.log(`  Input: ${scenario.input.slice(0, 60)}...`);

    const result = await callApi(scenario);
    results.push(result);

    if (result.status === "ok") {
      okCount++;
      console.log(`  ✅ is_action_legal=${result.isActionLegal} | narrative=${result.narrativeLen}chars | options=${result.optionsCount} | ${result.durationMs}ms`);
      console.log(`  📊 trace_id: ${result.traceId.slice(0, 16)}...`);

      // Judge each turn
      console.log(`  🔍 Judging...`);
      await judgeTurn(result, mockMode);
    } else {
      errCount++;
      console.log(`  ❌ ${result.error}`);
    }

    // Small delay between requests
    if (i < SCENARIOS.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total: ${results.length} | OK: ${okCount} | Errors: ${errCount}`);
  console.log();

  // Per-category stats
  const byCategory = new Map<string, TurnResult[]>();
  for (const r of results) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  for (const [cat, turns] of byCategory) {
    const legalCount = turns.filter((t) => t.isActionLegal).length;
    const avgNarrative = Math.round(turns.reduce((s, t) => s + t.narrativeLen, 0) / turns.length);
    const avgOptions = Math.round(turns.reduce((s, t) => s + t.optionsCount, 0) / turns.length);
    const avgLatency = Math.round(turns.reduce((s, t) => s + t.durationMs, 0) / turns.length);
    console.log(`  ${cat.padEnd(18)} | legal=${legalCount}/${turns.length} | narrative_avg=${avgNarrative}chars | options_avg=${avgOptions} | latency_avg=${avgLatency}ms`);
  }

  console.log(`\n📊 View in Langfuse: http://localhost:3001`);
  console.log(`📊 Run: pnpm tsx scripts/self-improve/llm-judge.ts --trace-id <id>`);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
