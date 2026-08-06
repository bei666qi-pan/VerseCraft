#!/usr/bin/env tsx
/**
 * Upload calibration evaluation scores to Langfuse.
 *
 * Usage:
 *   pnpm tsx scripts/self-improve/upload-scores.ts \
 *     --trace-id <traceId> \
 *     --scores '[{"name":"contract_valid","value":1,"dataType":"NUMERIC","source":"EVAL"}]'
 *
 * Reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL from environment.
 */
import { parseArgs } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local manually (tsx doesn't auto-load .env files)
function loadEnvLocal() {
  const __filename = fileURLToPath(import.meta.url);
  const rootDir = resolve(dirname(__filename), "../../");
  const envPath = resolve(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  // Track keys already set in the environment (don't override them)
  const shellKeys = new Set(Object.keys(process.env));
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    // Skip keys explicitly set by shell environment (they take precedence)
    const wasSet = shellKeys.has(key);
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!wasSet) {
      process.env[key] = value; // later lines override earlier (standard .env behavior)
    }
  }
}

interface EvalScore {
  name: string;
  value: number | string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  source?: "API" | "EVAL" | "ANNOTATION";
  comment?: string;
}

async function main() {
  loadEnvLocal();
  const { values } = parseArgs({
    options: {
      "trace-id": { type: "string" },
      scores: { type: "string" },
    },
  });

  const traceId = values["trace-id"];
  const scoresRaw = values.scores;

  if (!traceId || !scoresRaw) {
    console.error("Usage: upload-scores.ts --trace-id <id> --scores '<json>'");
    process.exit(1);
  }

  let scores: EvalScore[];
  try {
    scores = JSON.parse(scoresRaw);
  } catch {
    console.error("Invalid --scores JSON");
    process.exit(1);
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  // Use the local Langfuse unless explicitly overridden
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? "http://localhost:3001";

  if (!publicKey || !secretKey) {
    console.warn("[upload-scores] Langfuse keys not configured, skipping");
    process.exit(0);
  }

  const { LangfuseClient } = await import("@langfuse/client");
  const client = new LangfuseClient({ publicKey, secretKey, baseUrl });

  for (const score of scores) {
    try {
      await client.score.create({
        traceId,
        name: score.name,
        value: score.value,
        dataType: score.dataType,
        source: (score.source ?? "EVAL") as any,
        comment: score.comment,
      });
      console.log(`[upload-scores] ✓ ${score.name}=${score.value}`);
    } catch (err) {
      console.error(`[upload-scores] ✗ ${score.name}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Flush buffered scores before exit (client uses async batching)
  try {
    await (client as any).score.flush?.();
    await client.shutdown();
  } catch { /* best-effort */ }
}

main().catch((err) => {
  console.error("[upload-scores] fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
