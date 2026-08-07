/**
 * Self-Improving Agent System — Langfuse Dataset Integration
 *
 * Maps SelfImproveScenario[] to Langfuse datasets for experiment tracking.
 * Each scenario becomes a dataset item with input=playerInput, expectedOutput=expectedBehavior.
 */
import "server-only";

import type { SelfImproveScenario } from "./types";
import { isLangfuseEvalEnabled } from "./config";

export interface DatasetCreateResult {
  datasetName: string;
  itemCount: number;
  ok: boolean;
  error?: string;
}

/**
 * Create or update a Langfuse dataset from scenarios.
 * Dataset name = `self-improve-<category>` or `self-improve-scenarios` (default).
 */
export async function createOrUpdateDataset(
  scenarios: SelfImproveScenario[],
  datasetName?: string,
): Promise<DatasetCreateResult> {
  if (!isLangfuseEvalEnabled()) {
    return { datasetName: datasetName ?? "self-improve-scenarios", itemCount: 0, ok: false, error: "langfuse_eval_disabled" };
  }

  if (!scenarios.length) {
    return { datasetName: datasetName ?? "self-improve-scenarios", itemCount: 0, ok: true };
  }

  const name = datasetName ?? deriveDatasetName(scenarios);

  try {
    const { LangfuseClient } = await import("@langfuse/client");
    const cfg = getLangfuseEvalConfig();
    const client = new LangfuseClient({
      publicKey: cfg.publicKey!,
      secretKey: cfg.secretKey!,
      baseUrl: cfg.baseUrl,
    });

    // Get or create dataset
    let dataset: { id: string; name: string } | null = null;
    try {
      const existing = await client.dataset.get(name);
      if (existing) dataset = existing as { id: string; name: string };
    } catch {
      // Dataset doesn't exist yet — create it
    }

    if (!dataset) {
      try {
        const created = await client.dataset.create({ name });
        dataset = created as { id: string; name: string };
      } catch (err) {
        console.warn("[selfImprove:langfuse] dataset creation failed", name, err);
        return { datasetName: name, itemCount: 0, ok: false, error: String(err) };
      }
    }

    // Create/update items
    let itemCount = 0;
    for (const scenario of scenarios) {
      try {
        const input = scenario.playerInput;
        const expectedOutput = scenario.expectedInvariants
          .map((inv) => `${inv.check}:${inv.expected}`)
          .join("; ");

        await client.datasetItem.create({
          datasetName: name,
          input: typeof input === "string" ? input : JSON.stringify(input),
          expectedOutput,
          metadata: {
            caseId: scenario.caseId,
            category: scenario.category,
            source: scenario.source,
          },
        });
        itemCount++;
      } catch (err) {
        console.warn("[selfImprove:langfuse] dataset item creation failed", scenario.caseId, err);
      }
    }

    console.log(`[selfImprove:langfuse] dataset "${name}" ready: ${itemCount} items`);
    return { datasetName: name, itemCount, ok: true };
  } catch (err) {
    console.error("[selfImprove:langfuse] dataset operation failed", err);
    return { datasetName: name, itemCount: 0, ok: false, error: String(err) };
  }
}

function deriveDatasetName(scenarios: SelfImproveScenario[]): string {
  const categories = new Set(scenarios.map((s) => s.category));
  if (categories.size === 1) {
    return `self-improve-${[...categories][0]}`;
  }
  return "self-improve-scenarios";
}

function getLangfuseEvalConfig(): { publicKey: string; secretKey: string; baseUrl: string } {
  const publicKey = process.env["LANGFUSE_PUBLIC_KEY"]?.trim() ?? "";
  const secretKey = process.env["LANGFUSE_SECRET_KEY"]?.trim() ?? "";
  const baseUrl = process.env["LANGFUSE_BASE_URL"]?.trim() ?? "https://cloud.langfuse.com";
  return { publicKey, secretKey, baseUrl };
}
