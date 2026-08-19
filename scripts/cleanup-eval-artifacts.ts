#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanupEvalArtifacts, type EvalArtifactManifest } from "../src/lib/evals/artifacts/cleanup";

const args = process.argv.slice(2);
const repoRoot = process.cwd();
const manifestPath = resolve(repoRoot, "scripts/eval-artifact-manifest.v1.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as EvalArtifactManifest;
const deleteFiles = args.includes("--delete");
const terminalSuccess = args.includes("--terminal-success");
const result = cleanupEvalArtifacts({ repoRoot, manifest, deleteFiles, terminalSuccess });

console.log(`eval artifact manifest v${manifest.version}`);
console.log(deleteFiles ? `已删除 ${result.deleted.length} 个生成型产物` : `dry-run：发现 ${result.candidates.length} 个生成型产物`);
for (const path of deleteFiles ? result.deleted : result.candidates) console.log(path);

if (deleteFiles) {
  const residual = cleanupEvalArtifacts({ repoRoot, manifest, deleteFiles: false, terminalSuccess: true }).candidates;
  if (residual.length > 0) throw new Error(`清理后仍有 ${residual.length} 个 manifest 产物残留`);
}
