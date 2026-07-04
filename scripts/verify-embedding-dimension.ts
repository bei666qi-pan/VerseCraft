/**
 * 真实环境 embeddings 维度校验（T4，2026-07）。
 *
 * 用真实凭证（.env.local 里的 AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY / AI_MODEL_EMBEDDING）
 * 实际调用一次 embeddings 网关，打印返回向量的真实维度，并与 AI_EMBEDDING_DIMENSION
 * （默认 256，对应 world_knowledge_chunks.embedding_vector 的 pgvector 列宽度）比对。
 *
 * 用法：
 *   pnpm embeddings:verify-dimension
 *   严格模式（不匹配时 exit 1）：VERIFY_EMBEDDING_STRICT=1 pnpm embeddings:verify-dimension
 *
 * 这是"审阅代码即可完成"范围之外的验证——必须在有真实凭证的环境里跑，
 * 本仓库沙箱环境没有真实 AI_GATEWAY_API_KEY，无法在这里代跑。
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
  const strict = process.env.VERIFY_EMBEDDING_STRICT === "1";
  const { resolveEmbeddingBinding } = await import("../src/lib/ai/config/envCore");
  const { embedText } = await import("../src/lib/ai/embeddings/embedText");

  const binding = resolveEmbeddingBinding();
  console.log("[verify-embedding-dimension] VerseCraft embeddings 配置检查");
  console.log(`  gatewayProvider 复用 AI_GATEWAY_BASE_URL: ${binding.apiUrl ? "已设置" : "缺失"}`);
  console.log(`  apiUrl: ${binding.apiUrl || "(空)"}`);
  console.log(`  apiKey: ${binding.apiKey.length > 0 ? `已设置（${binding.apiKey.length} 字符）` : "缺失"}`);
  console.log(`  AI_MODEL_EMBEDDING: ${binding.model || "缺失"}`);
  console.log(`  AI_EMBEDDING_DIMENSION（期望值，对应 pgvector 列宽度）: ${binding.dimension}`);
  console.log(`  configured: ${binding.configured}`);

  if (!binding.configured) {
    console.log(
      "\n未配置齐全：至少需要 AI_GATEWAY_BASE_URL、AI_GATEWAY_API_KEY、AI_MODEL_EMBEDDING 才能测试真实向量维度。"
    );
    if (strict) process.exit(1);
    return;
  }

  console.log("\n正在调用真实 embeddings 网关（探测文本：\"VerseCraft 世界知识向量检索维度探测\"）...");
  const started = Date.now();
  const result = await embedText("VerseCraft 世界知识向量检索维度探测");
  const elapsedMs = Date.now() - started;

  if (!result.ok) {
    console.error(`\n[FAIL] embeddings 调用失败，reason=${result.reason}`);
    if ("status" in result) console.error(`  HTTP status: ${result.status}`);
    if ("message" in result) console.error(`  message: ${result.message}`);
    console.error(`  耗时: ${elapsedMs}ms`);
    process.exit(1);
  }

  const actualDim = result.vector.length;
  const expectedDim = binding.dimension;
  const match = actualDim === expectedDim;

  console.log(`\n调用成功，耗时: ${elapsedMs}ms`);
  console.log(`  实际返回维度: ${actualDim}`);
  console.log(`  期望维度（AI_EMBEDDING_DIMENSION / schema vector(256)）: ${expectedDim}`);
  console.log(`  维度匹配: ${match ? "是 ✅" : "否 ❌"}`);

  if (!match) {
    console.log(
      `\n[不匹配] world_knowledge_chunks.embedding_vector 目前是 vector(${expectedDim})。\n` +
        `要接入真实维度为 ${actualDim} 的模型，二选一：\n` +
        `  1. 在 one-api 侧换一个输出维度为 ${expectedDim} 的 embedding 模型/加一层降维投影；\n` +
        `  2. 同步修改 AI_EMBEDDING_DIMENSION="${actualDim}" 并把 src/db/ensureSchema.ts 里\n` +
        `     world_knowledge_chunks.embedding_vector 的建表类型从 vector(256) 改成 vector(${actualDim})\n` +
        `     （这是一次 schema 变更，需要重建索引，请评估对已有 embedding_status='ready' 数据的影响）。\n` +
        `在解决前不要跑 pnpm embeddings:backfill，否则会产生 embedding_status='error' 的记录。`
    );
    if (strict) process.exit(1);
  } else {
    console.log(
      "\n维度匹配，可以安全运行 pnpm embeddings:backfill:once 做一次小批量试跑，\n" +
        "确认 embedding_status 正确变为 'ready' 后再跑全量 pnpm embeddings:backfill。"
    );
  }
}

main().catch((error: unknown) => {
  console.error("[verify-embedding-dimension] 未捕获异常：", error);
  process.exit(1);
});
