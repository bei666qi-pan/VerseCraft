import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanupEvalArtifacts, listEvalArtifacts, type EvalArtifactManifest } from "./cleanup";

function fixture(): { root: string; manifest: EvalArtifactManifest } {
  const root = mkdtempSync(join(tmpdir(), "versecraft-eval-cleanup-"));
  const files = [
    "docs/eval/traces/run.json",
    ".runtime-data/eval/run/report.md",
    ".runtime-data/eval-narrative-safety-mock.json",
    ".runtime-data/chat-benchmark-mock.json",
    ".runtime-data/self-improve/si-1/final-report.json",
    ".runtime-data/self-improve/si-1/traces.jsonl",
    "benchmarks/game-mechanics/benchmark-report-1.json",
    "benchmarks/rag-pipeline/report-1.json",
    "benchmarks/game-mechanics/fixtures/keep.json",
    "benchmarks/game-mechanics/scenarios.json",
    "openspec/changes/keep/report.md",
    "docs/eval/README.md",
    ".runtime-data/budget-state.json",
  ];
  for (const file of files) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "fixture");
  }
  return {
    root,
    manifest: {
      version: 1,
      include: ["docs/eval/traces/**/*", ".runtime-data/eval/**/*", ".runtime-data/eval-*.json", ".runtime-data/chat-benchmark-*.json", ".runtime-data/self-improve/si-*/final-report.*", ".runtime-data/self-improve/si-*/traces.jsonl", "benchmarks/**/benchmark-report-*.json", "benchmarks/rag-pipeline/report-*.json"],
      preserve: ["benchmarks/**/fixtures/**/*", "openspec/**/*", "docs/eval/README.md"],
    },
  };
}

test("manifest lists generated traces/reports and preserves fixtures, OpenSpec and durable docs", () => {
  const { root, manifest } = fixture();
  const listed = listEvalArtifacts(root, manifest);
  assert.deepEqual(listed, [
    ".runtime-data/chat-benchmark-mock.json",
    ".runtime-data/eval-narrative-safety-mock.json",
    ".runtime-data/eval/run/report.md",
    ".runtime-data/self-improve/si-1/final-report.json",
    ".runtime-data/self-improve/si-1/traces.jsonl",
    "benchmarks/game-mechanics/benchmark-report-1.json",
    "benchmarks/rag-pipeline/report-1.json",
    "docs/eval/traces/run.json",
  ]);
});

test("delete is refused without terminal-success and dry-run never deletes", () => {
  const { root, manifest } = fixture();
  const dryRun = cleanupEvalArtifacts({ repoRoot: root, manifest, deleteFiles: false, terminalSuccess: false });
  assert.equal(dryRun.deleted.length, 0);
  assert.throws(() => cleanupEvalArtifacts({ repoRoot: root, manifest, deleteFiles: true, terminalSuccess: false }), /拒绝删除/);
  assert.equal(listEvalArtifacts(root, manifest).length, dryRun.candidates.length);
});

test("terminal-success deletion removes only manifest candidates", () => {
  const { root, manifest } = fixture();
  const result = cleanupEvalArtifacts({ repoRoot: root, manifest, deleteFiles: true, terminalSuccess: true });
  assert.equal(result.deleted.length, 8);
  assert.deepEqual(listEvalArtifacts(root, manifest), []);
});

test("path traversal and absolute manifest patterns are rejected", () => {
  const { root } = fixture();
  assert.throws(() => listEvalArtifacts(root, { version: 1, include: ["../outside/**/*"], preserve: [] }), /不安全/);
  assert.throws(() => listEvalArtifacts(root, { version: 1, include: ["/tmp/**/*"], preserve: [] }), /不安全/);
});
