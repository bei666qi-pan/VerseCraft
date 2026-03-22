/**
 * 一次性诊断：对比 stream / response_format 组合的上游 HTTP 状态（不写密钥到 stdout）。
 * 用法：pnpm dlx tsx scripts/debug-gateway-json-stream.ts
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const name of [".env", ".env.local"]) {
  const p = resolve(process.cwd(), name);
  if (existsSync(p)) config({ path: p });
}

async function post(
  label: string,
  body: Record<string, unknown>
): Promise<void> {
  const { resolveAiEnv, anyAiProviderConfigured } = await import("../src/lib/ai/config/envCore");
  if (!anyAiProviderConfigured()) {
    console.log("[debug-gateway-json-stream] skip: gateway not configured");
    process.exit(0);
  }
  const e = resolveAiEnv();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25_000);
  try {
    const res = await fetch(e.gatewayBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${e.gatewayApiKey}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    console.log(
      `[debug-gateway-json-stream] ${label} -> HTTP ${res.status}`,
      text.slice(0, 350).replace(/\s+/g, " ")
    );
  } catch (err) {
    console.log(`[debug-gateway-json-stream] ${label} -> error`, err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(t);
  }
}

async function main(): Promise<void> {
  const { resolveAiEnv } = await import("../src/lib/ai/config/envCore");
  const e = resolveAiEnv();
  const model = e.modelsByRole.main;
  const base = {
    model,
    messages: [{ role: "user" as const, content: "reply with one word: ok" }],
    max_tokens: 16,
  };

  await post("A_stream_false_no_json", { ...base, stream: false });
  await post("B_stream_false_json_object", {
    ...base,
    stream: false,
    response_format: { type: "json_object" },
  });
  await post("C_stream_true_no_json", { ...base, stream: true, stream_options: { include_usage: true } });
  await post("D_stream_true_json_object", {
    ...base,
    stream: true,
    response_format: { type: "json_object" },
    stream_options: { include_usage: true },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
