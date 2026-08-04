import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runSocialWorldEvalCases, type SocialWorldEvalCase } from "@/lib/socialWorld/eval";
import { appendHistory, resolveExperimentProvenance } from "../src/lib/evals/harness";

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(here, "../src/lib/socialWorld/__fixtures__/socialWorldEvalCases.json");
  const cases = JSON.parse(await readFile(fixturePath, "utf8")) as SocialWorldEvalCase[];
  const report = await runSocialWorldEvalCases(cases);

  console.log(JSON.stringify(report.metrics, null, 2));
  if (report.failures.length > 0) {
    console.error(JSON.stringify({ failures: report.failures, cases: report.cases }, null, 2));
    process.exit(1);
  }

  const provenance = resolveExperimentProvenance();
  appendHistory({
    suite: "social-world",
    mode: "mock",
    total: report.cases?.length ?? 0,
    pass: report.failures.length === 0 ? (report.cases?.length ?? 0) : 0,
    passRate: report.failures.length === 0 ? 1 : 0,
    gate: report.failures.length === 0 ? "pass" : "fail",
    timestamp: new Date().toISOString(),
    gitSha: provenance.commit,
    provenance,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
