/**
 * 校验当前进程环境下的 one-api 网关配置（不发起真实 LLM 请求）。
 * 加载顺序：`.env` → `.env.local`（与 Next 常见习惯一致）。
 *
 * 用法：pnpm verify:ai-gateway
 * 严格模式（缺项时 exit 1）：VERIFY_AI_GATEWAY_STRICT=1 pnpm verify:ai-gateway
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const name of [".env", ".env.local"]) {
  const p = resolve(process.cwd(), name);
  if (existsSync(p)) {
    config({ path: p });
  }
}

async function main(): Promise<void> {
  const { anyAiProviderConfigured, resolveAiEnv } = await import("../src/lib/ai/config/envCore");
  const strict = process.env.VERIFY_AI_GATEWAY_STRICT === "1";

  const e = resolveAiEnv();

  console.log("[verify-ai-gateway] VerseCraft one-api 配置检查");
  console.log(`  gatewayBaseUrl: ${e.gatewayBaseUrl ? "已设置" : "缺失"}`);
  console.log(
    `  gatewayApiKey: ${e.gatewayApiKey.length > 0 ? `已设置（${e.gatewayApiKey.length} 字符）` : "缺失"}`
  );
  for (const role of ["main", "control", "enhance", "reasoner"] as const) {
    const v = e.modelsByRole[role];
    console.log(`  AI_MODEL_${role.toUpperCase()}: ${v ? `已设置 (${v.length} 字符)` : "缺失"}`);
  }
  console.log(`  playerRoleFallbackChain: ${e.playerRoleFallbackChain.join(", ") || "(空)"}`);
  console.log(`  anyAiProviderConfigured: ${anyAiProviderConfigured()}`);

  const missingCritical =
    !e.gatewayBaseUrl || !e.gatewayApiKey || !e.modelsByRole.main.trim();

  if (missingCritical) {
    console.log(
      "\n提示：至少需要 AI_GATEWAY_BASE_URL、AI_GATEWAY_API_KEY、AI_MODEL_MAIN 才能进行玩家对话。"
    );
    if (strict) process.exit(1);
  } else {
    console.log("\n配置项齐全（是否连通 one-api 需自行 curl 或跑 e2e）。");
  }

  if (strict && !anyAiProviderConfigured()) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
