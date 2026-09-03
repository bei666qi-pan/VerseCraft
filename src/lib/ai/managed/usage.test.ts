import assert from "node:assert/strict";
import test from "node:test";
import { buildManagedUsageRecord, calculateCostCnyMicros, dedupeManagedUsageBatch } from "./usage";
import { rollupThenDeleteExpiredUsage } from "./usageRetention";
import type { ManagedAiBinding } from "./types";
const binding = { serviceId:"s",serviceName:"服务",modelId:"m",modelName:"model",baseUrl:"https://x",apiKey:"k",transport:"openai_compatible",purpose:"story",logicalRole:"writer",embeddingDimension:null,inputPriceCnyFenPerMillion:100,outputPriceCnyFenPerMillion:200 } as ManagedAiBinding;
test("RMB pricing uses fen-per-million and returns micros", () => { assert.equal(calculateCostCnyMicros(1_000_000,500_000,100,200), 2_000_000); assert.equal(calculateCostCnyMicros(1,1,null,2), null); });
test("usage records only provider counts and exposes unavailable usage without estimated cost", () => {
  const exact=buildManagedUsageRecord({requestId:"r",task:"PLAYER_CHAT",binding,phase:"done",usage:{promptTokens:10,completionTokens:2,totalTokens:12},outcome:"success"});
  assert.equal(exact.usageEstimated,false); assert.equal(exact.totalTokens,12);
  const unavailable=buildManagedUsageRecord({requestId:"r2",task:"PLAYER_CHAT",binding,phase:"done",inputText:"1234",outputText:"12345678",outcome:"success"});
  assert.equal(unavailable.usageEstimated,false);
  assert.equal(unavailable.totalTokens,0);
  assert.equal(unavailable.costCnyMicros,null);
  assert.equal(unavailable.errorCategory,"usage_unavailable");
});

test("usage batches deduplicate identical completion callbacks", () => {
  const record = buildManagedUsageRecord({requestId:"same",task:"PLAYER_CHAT",binding,phase:"complete",usage:{promptTokens:8,completionTokens:2,totalTokens:10},outcome:"success"});
  assert.deepEqual(dedupeManagedUsageBatch([record, record]), [record]);
});

test("retention commits daily rollup before deleting detail", async () => {
  const steps: string[] = [];
  const result = await rollupThenDeleteExpiredUsage({
    rollup: async () => { steps.push("rollup"); return { rowCount: 3 }; },
    remove: async () => { steps.push("delete"); return { rowCount: 9 }; },
  });
  assert.deepEqual(steps, ["rollup", "delete"]);
  assert.deepEqual(result, { rolledUp: 3, deleted: 9 });

  const failedSteps: string[] = [];
  await assert.rejects(() => rollupThenDeleteExpiredUsage({
    rollup: async () => { failedSteps.push("rollup"); throw new Error("rollup_failed"); },
    remove: async () => { failedSteps.push("delete"); return { rowCount: 1 }; },
  }));
  assert.deepEqual(failedSteps, ["rollup"]);
});
