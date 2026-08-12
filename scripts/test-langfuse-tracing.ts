// scripts/test-langfuse-tracing.ts (v2 — uses REST exporter)
import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), ".env"), override: false, quiet: true });

async function main() {
  const { getLangfuseConfig } = await import("../src/lib/observability/langfuse/config");
  const {
    createTracingAdapter,
    startTurnTrace,
    endTurnTrace,
    getCurrentAdapter,
  } = await import("../src/lib/observability/langfuse/index");

  const { initLangfuse, shutdownLangfuse } = await import(
    "../src/lib/observability/langfuse/client"
  );

  console.log("1. Initializing Langfuse...");
  const ok = await initLangfuse();
  console.log(`   initLangfuse: ${ok}`);
  if (!ok) {
    console.log("   ❌ Failed to init — exiting");
    process.exit(1);
  }

  // Create adapter
  const adapter = createTracingAdapter();
  const isNoop = getCurrentAdapter() === (await import("../src/lib/observability/langfuse/noop")).noopTracingAdapter;
  console.log(`   adapter is noop: ${isNoop}`);
  if (isNoop) {
    console.log("   ❌ Adapter is noop — exiting");
    process.exit(1);
  }
  console.log("   ✅ Adapter is real");

  // Start trace
  console.log("2. Starting trace...");
  startTurnTrace({
    requestId: "test-trace-v2-1",
    userIdHash: "user-1",
    sessionIdHash: "sess-1",
    task: "PLAYER_CHAT",
    environment: "development",
    clientPurpose: "normal",
    isFirstAction: true,
    operationMode: "normal",
  });

  // Wait for async root span
  await new Promise((r) => setTimeout(r, 2000));
  console.log("   Root span created");

  // Stage span
  console.log("3. Creating stage span...");
  const span = adapter.startSpan({
    name: "chat.request_validation",
    status: "ok",
  });
  span.end();

  // Generation
  console.log("4. Creating generation...");
  const gen = adapter.startGeneration({
    name: "ai.PLAYER_CHAT.primary",
    provider: "openai",
    gatewayModel: "gpt-4",
    intendedRole: "primary",
    actualRole: "primary",
    attemptIndex: 0,
    retryCount: 0,
    fallbackCount: 0,
    stream: false,
    cacheHit: false,
    success: true,
    totalTokens: 100,
    promptTokens: 50,
    completionTokens: 50,
    totalLatencyMs: 2500,
    ttftMs: 800,
  });
  gen.end({ success: true });

  // End trace
  console.log("5. Ending trace...");
  endTurnTrace({
    finalJsonParsed: true,
    turnCommitted: true,
    narrativeCharLen: 500,
    optionsCount: 3,
    fallbackUsed: false,
    degradedMode: false,
    validatorIssueCount: 0,
    npcConsistencyIssueCount: 0,
  });

  console.log("6. Flushing...");
  await new Promise((r) => setTimeout(r, 3000));

  await shutdownLangfuse();
  console.log(`✅ Test complete — check ${getLangfuseConfig().baseUrl}`);
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
