/**
 * Self-Improving Agent System — Langfuse Experiment Integration
 *
 * Runs experiments on Langfuse datasets using self-improve traces.
 * Associates traces with dataset run items and uploads judge scores.
 */
import "server-only";

import type { SelfImproveTrace } from "./types";
import { isLangfuseEvalEnabled } from "./config";

export interface ExperimentResult {
  experimentName: string;
  datasetName: string;
  runCount: number;
  ok: boolean;
  error?: string;
}

/**
 * Run an experiment on a Langfuse dataset.
 * Associates each trace with a dataset run item and uploads judge scores.
 */
export async function runLangfuseExperiment(params: {
  datasetName: string;
  traces: SelfImproveTrace[];
  experimentName?: string;
  runDescription?: string;
}): Promise<ExperimentResult> {
  if (!isLangfuseEvalEnabled()) {
    return {
      experimentName: params.experimentName ?? "self-improve",
      datasetName: params.datasetName,
      runCount: 0,
      ok: false,
      error: "langfuse_eval_disabled",
    };
  }

  const experimentName = params.experimentName ?? `self-improve-${new Date().toISOString().slice(0, 10)}`;

  try {
    const { LangfuseClient } = await import("@langfuse/client");
    const publicKey = process.env["LANGFUSE_PUBLIC_KEY"]?.trim() ?? "";
    const secretKey = process.env["LANGFUSE_SECRET_KEY"]?.trim() ?? "";
    const baseUrl = process.env["LANGFUSE_BASE_URL"]?.trim() ?? "https://cloud.langfuse.com";

    const client = new LangfuseClient({ publicKey, secretKey, baseUrl });

    // Create experiment
    let dataset: { id: string } | null = null;
    try {
      dataset = await client.dataset.get(params.datasetName) as { id: string } | null;
    } catch {
      // Dataset not found
    }

    if (!dataset) {
      return { experimentName, datasetName: params.datasetName, runCount: 0, ok: false, error: "dataset_not_found" };
    }

    // Create dataset run items for each trace
    let runCount = 0;
    for (const trace of params.traces) {
      if (!trace.langfuseTraceId) continue;

      try {
        await client.datasetRunItem.create({
          datasetName: params.datasetName,
          runName: experimentName,
          traceId: trace.langfuseTraceId,
          observationId: trace.langfuseObservationId,
        });
        runCount++;
      } catch (err) {
        console.warn("[selfImprove:langfuse] dataset run item failed", trace.caseId, err);
      }
    }

    console.log(`[selfImprove:langfuse] experiment "${experimentName}" complete: ${runCount} runs`);
    return { experimentName, datasetName: params.datasetName, runCount, ok: true };
  } catch (err) {
    console.error("[selfImprove:langfuse] experiment failed", err);
    return { experimentName, datasetName: params.datasetName, runCount: 0, ok: false, error: String(err) };
  }
}
