/**
 * 测试完整性检测器
 *
 * 纯函数模块，扫描测试文件内容，检测假绿模式：
 * - assert.ok(true) / assert.equal(1, 1) 存根断言
 * - test.skip(true) / test.skip() 永久跳过
 * - passRate: 1 / passRate 硬编码满分
 * - || true 短路通过
 * - 吞错后返回成功
 *
 * 设计原则（AGENTS.md §8.6 第 9 条）：
 * - 纯函数，不做 IO，不访问数据库，不调用 LLM
 * - 输入：文件内容字符串
 * - 输出：IntegrityIssue 数组
 */

// ── 类型定义 ──────────────────────────────────────────────

export interface IntegrityIssue {
  file: string;
  line: number;
  rule: string;
  description: string;
  severity: "error" | "warning";
}

export interface IntegrityReport {
  passed: boolean;
  issueCount: number;
  byRule: Record<string, number>;
  issues: IntegrityIssue[];
  filesScanned: number;
}

// ── 检测器 ────────────────────────────────────────────────

/**
 * R1: 检测存根断言 — assert.ok(true), assert.equal(1, 1) 等。
 */
export function detectAssertOkTrue(content: string, filePath: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const lines = content.split("\n");

  const patterns: Array<{ regex: RegExp; msg: string }> = [
    { regex: /assert\.ok\(\s*true\s*\)/g, msg: "assert.ok(true) 存根断言 — 永远通过，无验证价值" },
    { regex: /assert\.equal\(\s*1\s*,\s*1\s*\)/g, msg: "assert.equal(1, 1) 存根断言 — 永远通过" },
    { regex: /assert\.strictEqual\(\s*1\s*,\s*1\s*\)/g, msg: "assert.strictEqual(1, 1) 存根断言" },
    { regex: /assert\.deepStrictEqual\(\s*1\s*,\s*1\s*\)/g, msg: "assert.deepStrictEqual(1, 1) 存根断言" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, msg } of patterns) {
      const matches = line.match(regex);
      if (matches) {
        for (let m = 0; m < matches.length; m++) {
          issues.push({
            file: filePath,
            line: i + 1,
            rule: "R1:stub-assertion",
            description: msg,
            severity: "error",
          });
        }
      }
    }
  }

  return issues;
}

/**
 * R2: 检测永久 skip — test.skip(true), test.skip() (无条件跳过)。
 */
export function detectPermanentSkip(content: string, filePath: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const lines = content.split("\n");

  const patterns: Array<{ regex: RegExp; msg: string }> = [
    { regex: /test\.skip\(\s*true\s*[,)]/g, msg: "test.skip(true) 永久跳过 — 死代码" },
    { regex: /test\.skip\(\s*\)/g, msg: "test.skip() 无条件跳过 — 死代码" },
    { regex: /it\.skip\(\s*true\s*[,)]/g, msg: "it.skip(true) 永久跳过" },
    { regex: /it\.skip\(\s*\)/g, msg: "it.skip() 无条件跳过" },
    { regex: /describe\.skip\(\s*true\s*[,)]/g, msg: "describe.skip(true) 永久跳过" },
    { regex: /describe\.skip\(\s*\)/g, msg: "describe.skip() 无条件跳过" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, msg } of patterns) {
      const matches = line.match(regex);
      if (matches) {
        for (let m = 0; m < matches.length; m++) {
          issues.push({
            file: filePath,
            line: i + 1,
            rule: "R2:permanent-skip",
            description: msg,
            severity: "error",
          });
        }
      }
    }
  }

  return issues;
}

/**
 * R4: 检测 fallback 到满分 — passRate 硬编码为 1。
 */
export function detectFallbackPassRate(content: string, filePath: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const lines = content.split("\n");

  const patterns: Array<{ regex: RegExp; msg: string }> = [
    { regex: /passRate\s*[:=]\s*1\s*[,;})\s]/, msg: "passRate 硬编码为 1 — 可能是 fallback 满分" },
    { regex: /passRate\s*[:=]\s*1\s*$/, msg: "passRate 硬编码为 1 — 可能是 fallback 满分" },
    { regex: /overallScore\s*[:=]\s*5\s*[,;})\s]/, msg: "overallScore 硬编码为 5 — 可能是 fallback 满分" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, msg } of patterns) {
      const matches = line.match(regex);
      if (matches) {
        for (let m = 0; m < matches.length; m++) {
          issues.push({
            file: filePath,
            line: i + 1,
            rule: "R4:fallback-pass-rate",
            description: msg,
            severity: "warning",
          });
        }
      }
    }
  }

  return issues;
}

/**
 * R8: 检测 || true 短路通过模式。
 */
export function detectOrTrue(content: string, filePath: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const lines = content.split("\n");

  const pattern = /\|\|\s*true\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(pattern);
    if (matches) {
      for (let m = 0; m < matches.length; m++) {
        issues.push({
          file: filePath,
          line: i + 1,
          rule: "R8:or-true-shortcut",
          description: "|| true 短路 — 可能使断言恒真",
          severity: "warning",
        });
      }
    }
  }

  return issues;
}

/**
 * R3: 检测吞错后返回成功 — catch 块中不重新抛出且返回 ok: true。
 */
export function detectSwallowedError(content: string, filePath: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const lines = content.split("\n");

  let inCatch = false;
  let catchLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/\bcatch\b/.test(line) && (line.includes("(") || line.includes("{"))) {
      inCatch = true;
      catchLine = i + 1;
      continue;
    }

    if (inCatch) {
      if (/\breturn\s*\{[^}]*\bok\s*:\s*true\b/.test(line)) {
        issues.push({
          file: filePath,
          line: i + 1,
          rule: "R3:swallowed-error",
          description: `catch 块吞错后返回 ok: true (行 ${catchLine}) — 掩盖了真实错误`,
          severity: "error",
        });
        inCatch = false;
      } else if (line === "}" || line.startsWith("}")) {
        inCatch = false;
      }
    }
  }

  return issues;
}

// ── 批量扫描 ──────────────────────────────────────────────

/**
 * 对单个文件运行所有完整性检测。
 */
export function scanFile(content: string, filePath: string): IntegrityIssue[] {
  return [
    ...detectAssertOkTrue(content, filePath),
    ...detectPermanentSkip(content, filePath),
    ...detectSwallowedError(content, filePath),
    ...detectFallbackPassRate(content, filePath),
    ...detectOrTrue(content, filePath),
  ];
}

/**
 * 批量扫描多个文件，生成完整性报告。
 */
export function scanIntegrity(files: Record<string, string>): IntegrityReport {
  const allIssues: IntegrityIssue[] = [];
  const filePaths = Object.keys(files);

  for (const filePath of filePaths) {
    const content = files[filePath];
    if (content !== undefined) {
      allIssues.push(...scanFile(content, filePath));
    }
  }

  const byRule: Record<string, number> = {};
  for (const issue of allIssues) {
    byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;
  }

  const hasErrors = allIssues.some((i) => i.severity === "error");

  return {
    passed: !hasErrors,
    issueCount: allIssues.length,
    byRule,
    issues: allIssues,
    filesScanned: filePaths.length,
  };
}

/**
 * 从完整性报告生成人类可读的摘要字符串。
 */
export function formatIntegrityReport(report: IntegrityReport): string {
  const lines: string[] = [];

  if (report.passed) {
    lines.push(`✅ 完整性检查通过 — ${report.filesScanned} 个文件，0 个 error`);
  } else {
    const errorCount = report.issues.filter((i) => i.severity === "error").length;
    const warningCount = report.issues.filter((i) => i.severity === "warning").length;
    lines.push(
      `❌ 完整性检查失败 — ${report.filesScanned} 个文件，${errorCount} 个 error，${warningCount} 个 warning`,
    );
  }

  if (report.issueCount > 0) {
    lines.push("");
    lines.push("问题明细：");
    for (const issue of report.issues) {
      const icon = issue.severity === "error" ? "🔴" : "🟡";
      lines.push(`  ${icon} ${issue.file}:${issue.line} [${issue.rule}] ${issue.description}`);
    }
  }

  return lines.join("\n");
}
