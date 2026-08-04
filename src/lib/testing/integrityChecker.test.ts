/**
 * 完整性检测器单元测试
 *
 * 验证所有 5 条检测规则（R1-R4, R8）的正例、反例和边界。
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  detectAssertOkTrue,
  detectPermanentSkip,
  detectFallbackPassRate,
  detectOrTrue,
  detectSwallowedError,
  scanFile,
  scanIntegrity,
  formatIntegrityReport,
} from "./integrityChecker";
import type { IntegrityIssue } from "./integrityChecker";

// ═══════════════════════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════════════════════

function hasRule(issues: IntegrityIssue[], rule: string): boolean {
  return issues.some((i) => i.rule === rule);
}

function countIssues(issues: IntegrityIssue[], rule: string): number {
  return issues.filter((i) => i.rule === rule).length;
}

// ═══════════════════════════════════════════════════════════
// R1: assert.ok(true) 检测
// ═══════════════════════════════════════════════════════════

describe("R1: detectAssertOkTrue", () => {
  it("检测 assert.ok(true)", () => {
    const issues = detectAssertOkTrue("assert.ok(true);", "test.ts");
    assert.ok(hasRule(issues, "R1:stub-assertion"));
    assert.equal(issues[0].line, 1);
    assert.equal(issues[0].severity, "error");
  });

  it("检测 assert.equal(1, 1)", () => {
    const issues = detectAssertOkTrue("assert.equal(1, 1);", "test.ts");
    assert.ok(hasRule(issues, "R1:stub-assertion"));
  });

  it("检测 assert.strictEqual(1, 1)", () => {
    const issues = detectAssertOkTrue("assert.strictEqual(1, 1);", "test.ts");
    assert.ok(hasRule(issues, "R1:stub-assertion"));
  });

  it("不误报正常的 assert.ok(condition)", () => {
    const issues = detectAssertOkTrue("assert.ok(result > 0);", "test.ts");
    assert.equal(issues.length, 0);
  });

  it("不误报 assert.equal(actual, expected)", () => {
    const issues = detectAssertOkTrue("assert.equal(a, b);", "test.ts");
    assert.equal(issues.length, 0);
  });

  it("返回正确的文件路径", () => {
    const issues = detectAssertOkTrue("assert.ok(true);", "src/foo.test.ts");
    assert.equal(issues[0].file, "src/foo.test.ts");
  });
});

// ═══════════════════════════════════════════════════════════
// R2: 永久 skip 检测
// ═══════════════════════════════════════════════════════════

describe("R2: detectPermanentSkip", () => {
  it("检测 test.skip(true, ...)", () => {
    const issues = detectPermanentSkip(
      'test.skip(true, "never runs");',
      "test.ts",
    );
    assert.ok(hasRule(issues, "R2:permanent-skip"));
  });

  it("检测 test.skip()", () => {
    const issues = detectPermanentSkip("test.skip();", "test.ts");
    assert.ok(hasRule(issues, "R2:permanent-skip"));
  });

  it("检测 it.skip(true, ...)", () => {
    const issues = detectPermanentSkip(
      'it.skip(true, "disabled");',
      "test.ts",
    );
    assert.ok(hasRule(issues, "R2:permanent-skip"));
  });

  it("检测 describe.skip()", () => {
    const issues = detectPermanentSkip("describe.skip();", "test.ts");
    assert.ok(hasRule(issues, "R2:permanent-skip"));
  });

  it("不误报条件 skip: test.skip(condition)", () => {
    const issues = detectPermanentSkip(
      "test.skip(!process.env.CI, 'requires CI');",
      "test.ts",
    );
    assert.equal(issues.length, 0);
  });

  it("不误报 test.skip(condition, ...)", () => {
    const issues = detectPermanentSkip(
      'test.skip(!E2E_AI_LIVE, "requires live gateway");',
      "test.ts",
    );
    assert.equal(issues.length, 0);
  });

  it("检测多行中的 skip(true)", () => {
    const content = [
      "test('normal', () => {",
      "  assert.ok(true);",
      "});",
      "",
      "test.skip(true, 'dead');",
    ].join("\n");
    const issues = detectPermanentSkip(content, "multi.ts");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].line, 5);
  });
});

// ═══════════════════════════════════════════════════════════
// R4: fallback passRate 检测
// ═══════════════════════════════════════════════════════════

describe("R4: detectFallbackPassRate", () => {
  it("检测 passRate: 1", () => {
    const issues = detectFallbackPassRate(
      "const result = { passRate: 1 };",
      "bench.ts",
    );
    assert.ok(hasRule(issues, "R4:fallback-pass-rate"));
  });

  it("检测 passRate = 1", () => {
    const issues = detectFallbackPassRate("passRate = 1;", "bench.ts");
    assert.ok(hasRule(issues, "R4:fallback-pass-rate"));
  });

  it("检测 overallScore: 5", () => {
    const issues = detectFallbackPassRate(
      "return { overallScore: 5 };",
      "judge.ts",
    );
    assert.ok(hasRule(issues, "R4:fallback-pass-rate"));
  });

  it("不误报 passRate: 0.95", () => {
    const issues = detectFallbackPassRate(
      "const r = { passRate: 0.95 };",
      "bench.ts",
    );
    assert.equal(
      issues.filter((i) => i.rule === "R4:fallback-pass-rate").length,
      0,
    );
  });

  it("不误报 passRate: derivedValue", () => {
    const issues = detectFallbackPassRate(
      "const r = { passRate: computedRate };",
      "bench.ts",
    );
    assert.equal(
      issues.filter((i) => i.rule === "R4:fallback-pass-rate").length,
      0,
    );
  });

  it("severity 为 warning", () => {
    const issues = detectFallbackPassRate(
      "passRate: 1,",
      "test.ts",
    );
    assert.equal(issues[0].severity, "warning");
  });
});

// ═══════════════════════════════════════════════════════════
// R8: || true 短路检测
// ═══════════════════════════════════════════════════════════

describe("R8: detectOrTrue", () => {
  it("检测 || true 模式", () => {
    const issues = detectOrTrue(
      "const ok = check() || true;",
      "gate.ts",
    );
    assert.ok(hasRule(issues, "R8:or-true-shortcut"));
  });

  it("不误报 || 'default' 字符串", () => {
    const issues = detectOrTrue(
      "const name = input || 'default';",
      "util.ts",
    );
    // || 'default' 不匹配 || true 的 regex
    // 但 'default' 不含 true
    assert.equal(issues.length, 0);
  });

  it("severity 为 warning", () => {
    const issues = detectOrTrue("x || true", "test.ts");
    assert.equal(issues[0].severity, "warning");
  });
});

// ═══════════════════════════════════════════════════════════
// R3: 吞错检测
// ═══════════════════════════════════════════════════════════

describe("R3: detectSwallowedError", () => {
  it("检测 catch + return { ok: true }", () => {
    const content = [
      "try {",
      "  await riskyOp();",
      "} catch (e) {",
      "  return { ok: true };",
      "}",
    ].join("\n");
    const issues = detectSwallowedError(content, "service.ts");
    assert.ok(hasRule(issues, "R3:swallowed-error"));
  });

  it("不误报 catch + 重新抛出", () => {
    const content = [
      "try {",
      "  await riskyOp();",
      "} catch (e) {",
      "  throw e;",
      "}",
    ].join("\n");
    const issues = detectSwallowedError(content, "service.ts");
    assert.equal(issues.length, 0);
  });

  it("不误报 catch + return { ok: false }", () => {
    const content = [
      "try {",
      "  await riskyOp();",
      "} catch (e) {",
      "  return { ok: false, error: e };",
      "}",
    ].join("\n");
    const issues = detectSwallowedError(content, "service.ts");
    assert.equal(issues.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════
// scanFile: 综合扫描
// ═══════════════════════════════════════════════════════════

describe("scanFile", () => {
  it("干净文件返回空", () => {
    const content = [
      "test('works', () => {",
      "  assert.equal(result, 'expected');",
      "  assert.ok(condition);",
      "});",
    ].join("\n");
    const issues = scanFile(content, "clean.test.ts");
    assert.equal(issues.length, 0);
  });

  it("同时检测多种问题", () => {
    const content = [
      "test.skip(true, 'dead');",
      "assert.ok(true);",
      "const r = passRate: 1;",
    ].join("\n");
    const issues = scanFile(content, "dirty.test.ts");
    assert.ok(countIssues(issues, "R2:permanent-skip") >= 1);
    assert.ok(countIssues(issues, "R1:stub-assertion") >= 1);
  });

  it("只检测测试/脚本文件模式", () => {
    // 生产代码中可能有 assert.ok(true) 同样应被检测
    const issues = scanFile("assert.ok(true);", "src/lib/utils.ts");
    assert.ok(hasRule(issues, "R1:stub-assertion"));
  });
});

// ═══════════════════════════════════════════════════════════
// scanIntegrity: 批量扫描
// ═══════════════════════════════════════════════════════════

describe("scanIntegrity", () => {
  it("空文件集返回通过", () => {
    const report = scanIntegrity({});
    assert.equal(report.passed, true);
    assert.equal(report.filesScanned, 0);
    assert.equal(report.issueCount, 0);
  });

  it("干净文件返回通过", () => {
    const report = scanIntegrity({
      "a.test.ts": "test('ok', () => { assert.equal(1, 2); });",
      "b.test.ts": "test('skip', () => { test.skip(!CI); });",
    });
    assert.equal(report.passed, true);
    assert.equal(report.filesScanned, 2);
  });

  it("有存根断言返回不通过", () => {
    const report = scanIntegrity({
      "a.test.ts": "assert.ok(true);",
    });
    assert.equal(report.passed, false);
    assert.ok(report.byRule["R1:stub-assertion"] >= 1);
  });

  it("有 warning 无 error 仍通过", () => {
    const report = scanIntegrity({
      "bench.ts": "const r = { passRate: 1 };",
    });
    // R4 fallback-pass-rate 是 warning，不阻止通过
    assert.equal(report.passed, true);
  });

  it("多文件统计正确", () => {
    const report = scanIntegrity({
      "a.ts": "assert.ok(true);",
      "b.ts": "assert.ok(true); assert.ok(true);",
      "c.ts": "passRate: 1;",
    });
    assert.equal(report.filesScanned, 3);
    assert.equal(countIssues(report.issues, "R1:stub-assertion"), 3);
    assert.equal(countIssues(report.issues, "R4:fallback-pass-rate"), 1);
  });

  it("byRule 统计正确", () => {
    const report = scanIntegrity({
      "a.ts": "assert.ok(true);\ntest.skip(true);",
    });
    assert.equal(report.byRule["R1:stub-assertion"], 1);
    assert.equal(report.byRule["R2:permanent-skip"], 1);
  });
});

// ═══════════════════════════════════════════════════════════
// formatIntegrityReport
// ═══════════════════════════════════════════════════════════

describe("formatIntegrityReport", () => {
  it("通过报告包含 ✅", () => {
    const report = scanIntegrity({
      "clean.ts": "test('clean', () => {});",
    });
    const text = formatIntegrityReport(report);
    assert.ok(text.includes("✅"));
    assert.ok(text.includes("0 个 error"));
  });

  it("失败报告包含 ❌", () => {
    const report = scanIntegrity({
      "dirty.ts": "assert.ok(true);",
    });
    const text = formatIntegrityReport(report);
    assert.ok(text.includes("❌"));
    assert.ok(text.includes("R1:stub-assertion"));
  });

  it("包含文件扫描数", () => {
    const report = scanIntegrity({
      "a.ts": "test('a', () => {});",
      "b.ts": "test('b', () => {});",
    });
    const text = formatIntegrityReport(report);
    assert.ok(text.includes("2 个文件"));
  });

  it("warning 不计入 error 计数", () => {
    const report = scanIntegrity({
      "bench.ts": "passRate: 1;",
    });
    const text = formatIntegrityReport(report);
    // R4 是 warning，不应显示 error 计数
    assert.ok(text.includes("0 个 error"));
  });
});
