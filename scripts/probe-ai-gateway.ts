/**
 * 轻量 one-api 连通性探测：发起极小非流式补全（可能产生极少 token 费用）。
 * 未配置网关时退出 0 并提示，不发起请求。
 *
 * 用法：pnpm probe:ai-gateway
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

  if (!anyAiProviderConfigured()) {
    console.log("[probe-ai-gateway] 未配置完整网关（见 pnpm verify:ai-gateway），跳过探测。");
    process.exit(0);
  }

  const e = resolveAiEnv();
  const url = e.gatewayBaseUrl;
  const model = e.modelsByRole.main;
  const timeoutMs = Math.min(e.defaultTimeoutMs, 30_000);

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    stream: false,
  });

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${e.gatewayApiKey}`,
      },
      body,
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[probe-ai-gateway] HTTP ${res.status}: ${text.slice(0, 500)}`);
      process.exit(1);
    }
    console.log("[probe-ai-gateway] 上游响应 OK（HTTP", res.status, "），模型字段:", model);
  } catch (err) {
    console.error("[probe-ai-gateway] 请求失败:", err);
    process.exit(1);
  } finally {
    clearTimeout(t);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
