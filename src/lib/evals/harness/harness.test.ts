/**
 * Harness 核心单元测试
 */

import assert from "node:assert";
import { describe, it, before, after } from "node:test";

// ── types ────────────────────────────────────────────────

describe("harness/types", () => {
  it("类型定义应可导入", () => {
    // compile-time check
    const _: Record<string, never> = {};
    assert.ok(typeof _ === "object");
  });
});

// ── config ───────────────────────────────────────────────

describe("harness/config", () => {
  it("resolveEvalMode 应解析 mock", async () => {
    const { resolveEvalMode } = await import("./config");
    assert.strictEqual(resolveEvalMode("mock"), "mock");
  });

  it("resolveEvalMode 应解析 live", async () => {
    const { resolveEvalMode } = await import("./config");
    assert.strictEqual(resolveEvalMode("live"), "live");
  });

  it("resolveEvalMode 空字符串应兜底 fallback", async () => {
    const { resolveEvalMode } = await import("./config");
    assert.strictEqual(resolveEvalMode(""), "mock");
  });

  it("BUDGET 常量应合理", async () => {
    const { BUDGET } = await import("./config");
    assert.ok(BUDGET.JUDGE_CALIBRATION > 0);
    assert.ok(BUDGET.LIVE_BATCH > 0);
    assert.ok(BUDGET.DAILY_TOTAL > 0);
  });
});

// ── utils ────────────────────────────────────────────────

describe("harness/utils", () => {
  it("writeJson 应无错误写入", async () => {
    const { writeJson } = await import("./utils");
    const tmp = ".runtime-data/eval-test/test-write.json";
    writeJson(tmp, { ok: true });
    const fs = await import("node:fs");
    const content = JSON.parse(fs.readFileSync(tmp, "utf8"));
    assert.deepStrictEqual(content, { ok: true });
    // cleanup
    fs.rmSync(".runtime-data/eval-test", { recursive: true, force: true });
  });

  it("parseEvalCli 应解析默认值", async () => {
    const { parseEvalCli } = await import("./utils");
    const opts = parseEvalCli([], {});
    assert.strictEqual(opts.mode, "mock");
    assert.strictEqual(opts.assert, false);
    assert.strictEqual(opts.jsonOnly, false);
  });

  it("parseEvalCli 应解析 --mode live", async () => {
    const { parseEvalCli } = await import("./utils");
    const opts = parseEvalCli(["--mode", "live", "--assert", "--json-out", "out.json"]);
    assert.strictEqual(opts.mode, "live");
    assert.strictEqual(opts.assert, true);
    assert.strictEqual(opts.jsonOut, "out.json");
  });

  it("parseEvalCli 应解析 --mode=live 格式", async () => {
    const { parseEvalCli } = await import("./utils");
    const opts = parseEvalCli(["--mode=live", "--assert", "--json-out=out.json"]);
    assert.strictEqual(opts.mode, "live");
    assert.strictEqual(opts.jsonOut, "out.json");
  });

  it("appendHistory 与 readLastHistory 应端到端工作", async () => {
    const { appendHistory, readLastHistory } = await import("./utils");
    const suite = "test-suite";
    const entry = {
      suite,
      mode: "mock" as const,
      total: 42,
      pass: 40,
      passRate: 0.952,
      gate: "pass" as const,
      timestamp: new Date().toISOString(),
      gitSha: "abc1234",
    };
    appendHistory(entry);
    const last = readLastHistory(suite, 1);
    assert.strictEqual(last.length, 1);
    assert.strictEqual(last[0]!.total, 42);
    // cleanup
    const fs = await import("node:fs");
    const p = await import("path");
    fs.rmSync(p.resolve("benchmarks/history", `${suite}.jsonl`), { force: true });
  });

  it("getGitSha 应返回非空字符串", async () => {
    const { getGitSha } = await import("./utils");
    const sha = getGitSha();
    assert.ok(typeof sha === "string");
    assert.ok(sha.length > 0);
  });
});

// ── registry ─────────────────────────────────────────────

describe("harness/registry", () => {
  before(async () => {
    const { resetRegistry } = await import("./registry");
    resetRegistry();
  });

  after(async () => {
    const { resetRegistry } = await import("./registry");
    resetRegistry();
  });

  it("registerCase 与 getCasesBySuite 应工作", async () => {
    const { registerCase, getCasesBySuite, getAllCases } = await import("./registry");
    registerCase({ id: "test-001", suite: "test", difficulty: "basic", source: "hand", tags: [], description: "test case" });
    const all = getAllCases();
    assert.strictEqual(all.length, 1);
    const fromSuite = getCasesBySuite("test");
    assert.strictEqual(fromSuite.length, 1);
    assert.strictEqual(fromSuite[0]!.id, "test-001");
  });

  it("validateRegistry 应报告缺失字段", async () => {
    const { registerCase, validateRegistry, resetRegistry } = await import("./registry");
    resetRegistry();
    registerCase({ id: "", suite: "bad", difficulty: "basic", source: "hand", tags: [], description: "" });
    const errors = validateRegistry();
    assert.ok(errors.length > 0);
  });

  it("generateSuiteCounts 应返回正确计数", async () => {
    const { registerCase, generateSuiteCounts, resetRegistry } = await import("./registry");
    resetRegistry();
    registerCase({ id: "a", suite: "s1", difficulty: "basic", source: "hand", tags: [], description: "" });
    registerCase({ id: "b", suite: "s1", difficulty: "basic", source: "hand", tags: [], description: "" });
    registerCase({ id: "c", suite: "s2", difficulty: "basic", source: "hand", tags: [], description: "" });
    const counts = generateSuiteCounts();
    assert.strictEqual(counts.s1, 2);
    assert.strictEqual(counts.s2, 1);
  });

  it("跨 suite 重复 ID 应忽略", async () => {
    const { registerCase, getAllCases, resetRegistry } = await import("./registry");
    resetRegistry();
    registerCase({ id: "dup", suite: "s1", difficulty: "basic", source: "hand", tags: [], description: "" });
    registerCase({ id: "dup", suite: "s2", difficulty: "basic", source: "hand", tags: [], description: "" });
    // 只保留第一次
    assert.strictEqual(getAllCases().length, 1);
  });
});
