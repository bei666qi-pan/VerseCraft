/**
 * Evidence probe for malformed-DM recovery.
 *
 * It intentionally records two distinct facts instead of conflating them:
 * 1. a real gateway call for the narrative-repair task; and
 * 2. an /api/chat malformed-main-stream branch using the deterministic mock
 *    candidate fixture. The latter verifies the SSE/final-hook wiring only.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { probeChatSse } from "../src/lib/perf/chatSseProbe";

type RepairResult = { ok: boolean; latencyMs: number; narrative?: string; reason?: string };

function outputPath(): string {
  const index = process.argv.indexOf("--out");
  if (index >= 0 && process.argv[index + 1]) return path.resolve(process.argv[index + 1]!);
  return path.resolve(`.runtime-data/eval/malformed-dm-repair-live-${new Date().toISOString().replace(/[:.]/g, "-")}/report.json`);
}

async function runRealGatewayRepair(): Promise<RepairResult> {
  dotenv.config({ path: ".env.local", quiet: true });
  const logicalTasksModule = await import("../src/lib/ai/logicalTasks");
  const repairNarrativeOnly = logicalTasksModule.repairNarrativeOnly;
  const result = await repairNarrativeOnly({
    originalNarrative: "我贴着墙根听见走廊尽头有轻响，门缝里透出微弱的光。",
    originalDmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "我贴着墙根听见走廊尽头有轻响，门缝里透出微弱的光。",
      is_death: false,
    },
    latestUserInput: "我侧耳听走廊尽头的动静。",
    playerContextSnapshot: "位置:3F_Hallway；回合:2；理智:80",
    issues: [{ source: "live_probe", code: "malformed_dm_json", severity: "high", detail: "intentional repair probe" }],
    constraints: ["继续当前场景，不解释模型或 JSON。"],
    ctx: { requestId: `repair-live-${Date.now()}`, path: "repair-live-probe" },
    budgetMs: 4_000,
    maxChars: 520,
  });
  return result.ok
    ? { ok: true, latencyMs: result.latencyMs, narrative: result.narrative }
    : { ok: false, latencyMs: result.latencyMs, reason: result.reason };
}

async function runApiMalformedBranch(baseUrl: string) {
  const content = "[mock_scenario:malformed_json] 我侧耳听走廊尽头的动静。";
  return probeChatSse({
    baseUrl,
    timeoutMs: 30_000,
    headers: { Accept: "text/event-stream", "X-VerseCraft-Request-Id": `malformed-api-${Date.now()}` },
    body: {
      latestUserInput: content,
      messages: [{ role: "user", content }],
      playerContext: "位置:3F_Hallway；回合:2",
      sessionId: `malformed-api-${Date.now()}`,
    },
  });
}

async function main(): Promise<void> {
  const realRepair = await runRealGatewayRepair();
  const apiResult = await runApiMalformedBranch(process.env.LIVEPLAY_BASE_URL ?? "http://127.0.0.1:666");
  const apiFinal = apiResult.finalJson ?? {};
  const branchAction = apiFinal.internal_meta && typeof apiFinal.internal_meta === "object"
    ? (apiFinal.internal_meta as Record<string, unknown>).action
    : null;
  const evidence = {
    passed: realRepair.ok && apiResult.httpStatus === 200 && apiResult.finalFrameReceived && apiResult.finalJsonParseSuccess && branchAction === "model_repair_after_malformed_dm",
    realGatewayRepair: { source: "oneapi / deepseek-v4-flash", ...realRepair },
    apiMalformedBranch: {
      source: "mock malformed main candidate; verifies /api/chat recovery wiring only",
      httpStatus: apiResult.httpStatus,
      finalFrameReceived: apiResult.finalFrameReceived,
      finalJsonParseSuccess: apiResult.finalJsonParseSuccess,
      finalMs: apiResult.finalMs,
      action: branchAction,
      narrativeChars: typeof apiFinal.narrative === "string" ? Array.from(apiFinal.narrative).length : 0,
    },
  };
  const out = outputPath();
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(evidence, null, 2) + "\n");
  assert.equal(evidence.passed, true, `malformed-DM recovery probe failed; evidence: ${out}`);
  console.log(`malformed-DM recovery probe passed: ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
