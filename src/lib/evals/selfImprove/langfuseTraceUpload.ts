/**
 * Self-Improving Agent System — Langfuse Trace Upload
 *
 * Uploads SelfImproveTrace records to Langfuse via REST API.
 * Supports batching (50 per batch) and deduplication (by traceId).
 * Failures are logged but never thrown — upload is best-effort.
 */
import "server-only";

import type { SelfImproveTrace } from "./types";
import { isLangfuseEvalEnabled } from "./config";

export interface UploadResult {
  uploaded: number;
  skipped: number;
  failed: number;
  ok: boolean;
  error?: string;
}

/**
 * Upload traces to Langfuse. Duplicates (same traceId) are skipped.
 * Batches of 50 to avoid overwhelming the API.
 */
export async function uploadTracesToLangfuse(
  traces: SelfImproveTrace[],
): Promise<UploadResult> {
  if (!isLangfuseEvalEnabled()) {
    return { uploaded: 0, skipped: traces.length, failed: 0, ok: false, error: "langfuse_eval_disabled" };
  }

  if (!traces.length) {
    return { uploaded: 0, skipped: 0, failed: 0, ok: true };
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  const BATCH_SIZE = 50;

  try {
    const { LangfuseClient } = await import("@langfuse/client");
    const publicKey = process.env["LANGFUSE_PUBLIC_KEY"]?.trim() ?? "";
    const secretKey = process.env["LANGFUSE_SECRET_KEY"]?.trim() ?? "";
    const baseUrl = process.env["LANGFUSE_BASE_URL"]?.trim() ?? "https://cloud.langfuse.com";

    const client = new LangfuseClient({ publicKey, secretKey, baseUrl });

    // Process in batches
    for (let i = 0; i < traces.length; i += BATCH_SIZE) {
      const batch = traces.slice(i, i + BATCH_SIZE);

      for (const trace of batch) {
        try {
          // Check if trace already exists (simple dedup: try to get it)
          if (trace.langfuseTraceId) {
            try {
              const existing = await client.trace.get(trace.langfuseTraceId);
              if (existing) {
                skipped++;
                continue;
              }
            } catch {
              // Not found — proceed to create
            }
          }

          // Create trace in Langfuse
          const created = await client.trace.create({
            name: `self-improve-${trace.caseId}`,
            userId: `self-improve-run-${trace.runId}`,
            sessionId: trace.runId,
            metadata: {
              runId: trace.runId,
              round: trace.round,
              caseId: trace.caseId,
              model: trace.model,
              provider: trace.provider,
              durationMs: trace.durationMs,
              tokenUsage: trace.tokenUsage,
              latencyMs: trace.latencyMs,
              errorClass: trace.errorClass,
            },
            input: typeof trace.playerInput === "string"
              ? trace.playerInput
              : JSON.stringify(trace.playerInput),
            output: trace.narrative
              ? { narrative: trace.narrative, options: trace.options }
              : undefined,
          });

          // Update trace record with Langfuse IDs
          const createdTrace = created as { id: string };
          trace.langfuseTraceId = createdTrace.id;
          uploaded++;
        } catch (err) {
          failed++;
          console.warn("[selfImprove:langfuse] trace upload failed", trace.caseId,
            err instanceof Error ? err.message : String(err));
        }
      }
    }

    console.log(`[selfImprove:langfuse] trace upload complete: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`);
    return { uploaded, skipped, failed, ok: failed === 0 };
  } catch (err) {
    console.error("[selfImprove:langfuse] trace upload batch failed", err);
    return { uploaded, skipped, failed, ok: false, error: String(err) };
  }
}

/**
 * Upload scores for a trace to Langfuse.
 */
export async function uploadTraceScores(
  trace: SelfImproveTrace,
  scores: Array<{ name: string; value: number; higherIsBetter: boolean }>,
): Promise<void> {
  if (!isLangfuseEvalEnabled()) return;
  if (!trace.langfuseTraceId) return;

  try {
    const { LangfuseClient } = await import("@langfuse/client");
    const publicKey = process.env["LANGFUSE_PUBLIC_KEY"]?.trim() ?? "";
    const secretKey = process.env["LANGFUSE_SECRET_KEY"]?.trim() ?? "";
    const baseUrl = process.env["LANGFUSE_BASE_URL"]?.trim() ?? "https://cloud.langfuse.com";

    const client = new LangfuseClient({ publicKey, secretKey, baseUrl });

    for (const score of scores) {
      try {
        await client.score.create({
          traceId: trace.langfuseTraceId,
          name: score.name,
          value: score.value,
          dataType: "NUMERIC",
          source: "EVAL",
        });
      } catch (err) {
        console.warn("[selfImprove:langfuse] score upload failed", score.name, err);
      }
    }
  } catch (err) {
    console.warn("[selfImprove:langfuse] score batch failed", err);
  }
}
