import test from "node:test";
import assert from "node:assert/strict";
import { validateAiInsightOutput } from "@/lib/admin/aiInsightSchema";

test("validateAiInsightOutput should accept valid payload", () => {
  const valid = {
    executiveSummary: "ok",
    retentionRisks: [{ priority: "immediate", title: "t", detail: "d", evidence: "e" }],
    productProblems: [{ priority: "this_week", title: "t", detail: "d", evidence: "e" }],
    opportunityPoints: [{ priority: "mid_term", title: "t", detail: "d", evidence: "e" }],
    top3Actions: [{ priority: "immediate", action: "a", why: "w", expectedImpact: "i" }],
    expectedImpact: { confidenceNote: "c" },
    confidence: { score: 0.8, level: "high", reason: "r" },
    evidence: [{ metric: "m", value: "v", source: "s" }],
    suggestedExperiments: [{ name: "n", hypothesis: "h", metric: "m", duration: "7d" }],
    generatedAt: new Date().toISOString(),
    evidenceSufficiency: "enough",
  };
  assert.ok(validateAiInsightOutput(valid));
});

test("validateAiInsightOutput should reject wrong priority", () => {
  const invalid = {
    executiveSummary: "x",
    retentionRisks: [{ priority: "p0", title: "t", detail: "d", evidence: "e" }],
    productProblems: [],
    opportunityPoints: [],
    top3Actions: [],
    expectedImpact: { confidenceNote: "c" },
    confidence: { score: 0.2, level: "low", reason: "r" },
    evidence: [],
    suggestedExperiments: [],
    generatedAt: new Date().toISOString(),
    evidenceSufficiency: "insufficient",
  };
  assert.equal(validateAiInsightOutput(invalid), null);
});

