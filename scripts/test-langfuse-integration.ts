// scripts/test-langfuse-integration.ts
// End-to-end test: verifies Langfuse tracing is working with VerseCraft.
// Requires: Langfuse running at LANGFUSE_BASE_URL, VerseCraft dev server on localhost:666.
//
// Usage: VERSECRAFT_ENABLE_LANGFUSE=1 npx tsx scripts/test-langfuse-integration.ts

import { getLangfuseConfig, isLangfuseReady } from "@/lib/observability/langfuse/config";
import { hashIdentity } from "@/lib/observability/langfuse/privacy";
import { shouldSample } from "@/lib/observability/langfuse/sampling";
import { buildEvalScores, uploadScores } from "@/lib/observability/langfuse/scores";
import { validatePromptShadow } from "@/lib/observability/langfuse/prompts";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), ".env"), override: false, quiet: true });

async function main() {
  console.log("=== VerseCraft × Langfuse Integration Test ===\n");

  // 1. Config check
  console.log("1. Config check");
  const cfg = getLangfuseConfig();
  console.log(`   enabled:     ${cfg.enabled}`);
  console.log(`   baseUrl:     ${cfg.baseUrl}`);
  console.log(`   environment: ${cfg.environment}`);
  console.log(`   sampleRate:  ${cfg.sampleRate}`);
  console.log(`   promptMode:  ${cfg.promptSource}`);
  console.log(`   ready:       ${isLangfuseReady()}`);
  console.log();

  if (!isLangfuseReady()) {
    console.log("❌ Langfuse not ready — set VERSECRAFT_ENABLE_LANGFUSE=1 and keys in .env.local");
    process.exit(1);
  }

  // 2. Privacy check
  console.log("2. Privacy");
  const uid = hashIdentity("test-user-123");
  const sid = hashIdentity("test-session-456");
  console.log(`   user hash:  ${uid?.slice(0, 8)}...`);
  console.log(`   sess hash:  ${sid?.slice(0, 8)}...`);
  console.log(`   reversible: ${uid !== "test-user-123"} (should be true — hashed)`);
  console.log();

  // 3. Sampling check
  console.log("3. Deterministic sampling");
  const sampled = shouldSample("test-request-id-001");
  const sampled2 = shouldSample("test-request-id-001");
  console.log(`   same id → same result: ${sampled === sampled2 ? "✅" : "❌"}`);
  console.log();

  // 4. Langfuse web health
  console.log("4. Langfuse server health");
  try {
    const res = await fetch(`${cfg.baseUrl}/api/public/health`);
    console.log(`   status: ${res.status} ${res.ok ? "✅" : "❌"}`);
    const body = await res.text();
    console.log(`   body:   ${body.slice(0, 100)}`);
  } catch (e) {
    console.log(`   ❌ unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log();

  // 5. Score upload test
  console.log("5. Score upload");
  const scores = buildEvalScores({
    contractValid: true,
    finalJsonParseSuccess: true,
    turnCommitted: true,
    optionsQualityPass: true,
    narrativeSafetyPass: true,
    npcConsistencyIssueCount: 0,
    ttftMs: 850,
    finalLatencyMs: 4200,
    totalTokens: 3200,
    estimatedCostUsd: 0.0032,
    fallbackUsed: false,
  });
  console.log(`   built ${scores.length} scores`);

  try {
    const uploadResult = await uploadScores("test-trace-001", scores);
    console.log(`   upload result: ${JSON.stringify(uploadResult)}`);
    if (uploadResult.failed > 0 || uploadResult.skipped) throw new Error("score upload was not accepted");
  } catch (e) {
    console.log(`   upload failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log();

  // 6. Prompt validation
  console.log("6. Prompt shadow validation");
  if (cfg.promptSource === "local") {
    console.log("   skipped: promptSource=local (no remote prompt is required)");
  } else {
    const result = await validatePromptShadow(
      "versecraft-dm-stable",
      "你是一个中文互动叙事游戏的 DM。请严格以 JSON 格式输出。",
      "development"
    );
    console.log(`   match: ${result.match ? "✅" : "⚠️"} (localHash=${result.localHash.slice(0, 8)}...)`);
  }
  console.log();

  console.log("=== Integration test complete ===");
  console.log(`Next: start VerseCraft (pnpm dev) and play a turn → traces appear in ${cfg.baseUrl}`);
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
