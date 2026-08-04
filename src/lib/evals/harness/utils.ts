/**
 * Harness 工具函数 — CLI 参数解析、JSON 写入等
 *
 * 提取自各 eval 脚本中重复的 getArgValue / parseCli / log / writeJson。
 * 保持与现有 CLI 接口完全兼容。
 */

import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import type { EvalMode } from "./config";
import { resolveEvalMode } from "./config";
import type { _EvalCaseBase, ReportEntry, EvalSummaryBase } from "./types";
import { HISTORY_DIR } from "./config";

// ── CLI 参数 ─────────────────────────────────────────────

export interface EvalCliOptions {
  mode: EvalMode;
  assert: boolean;
  jsonOut: string | null;
  jsonOnly: boolean;
}

export interface EvalCliEnvMapping {
  modeEnv?: string;
  assertEnv?: string;
  jsonOutEnv?: string;
}

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

/**
 * 解析 CLI 参数（兼容现有所有 eval 脚本的 CLI 约定）。
 *
 * @param envMapping 各选项的环境变量名（可选）
 */
export function parseEvalCli(
  extraArgs?: string[],
  envMapping?: EvalCliEnvMapping
): EvalCliOptions {
  const args = extraArgs ?? process.argv.slice(2);
  const rawMode = getArgValue(args, "--mode") ?? (envMapping?.modeEnv ? process.env[envMapping.modeEnv] : undefined) ?? "mock";
  return {
    mode: resolveEvalMode(rawMode),
    assert:
      args.includes("--assert") ||
      (envMapping?.assertEnv ? process.env[envMapping.assertEnv] === "1" : false),
    jsonOut:
      getArgValue(args, "--json-out") ??
      (envMapping?.jsonOutEnv ? process.env[envMapping.jsonOutEnv] : null) ??
      null,
    jsonOnly: args.includes("--json-only"),
  };
}

// ── 日志与输出 ──────────────────────────────────────────

/** 非 jsonOnly 模式才输出 */
export function evalLog(options: Pick<EvalCliOptions, "jsonOnly">, message: string): void {
  if (!options.jsonOnly) console.log(message);
}

/** 写入 JSON 文件（自动建目录） */
export function writeJson(pathName: string | null, data: unknown): void {
  if (!pathName) return;
  const resolved = path.resolve(pathName);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// ── 评测结果 ────────────────────────────────────────────

/** 组合 final 输出对象（各 suite 覆盖后调用） */
export function buildEvalOutput<TResults>(params: {
  mode: EvalMode;
  suite: string;
  summary: EvalSummaryBase;
  results: TResults[];
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    mode: params.mode,
    suite: params.suite,
    timestamp: new Date().toISOString(),
    summary: params.summary,
    results: params.results,
    ...params.extra,
  };
}

/** 将聚合行写入 benchmarks/history/<suite>.jsonl */
export function appendHistory(entry: ReportEntry): void {
  const dir = path.resolve(HISTORY_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  fs.appendFileSync(path.join(dir, `${entry.suite}.jsonl`), line, "utf8");
}

/** 从 benchmarks/history/<suite>.jsonl 读取最后 N 行 */
export function readLastHistory(suite: string, n: number = 1): ReportEntry[] {
  const filePath = path.resolve(HISTORY_DIR, `${suite}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean);
  return lines
    .slice(-n)
    .map((line) => JSON.parse(line) as ReportEntry);
}

/** 计算 git SHA（40 字符完整值） */
export function getGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    // 兜底：尝试从 .git/HEAD 解析 ref 再读实际 SHA
    try {
      const head = fs.readFileSync(path.resolve(".git", "HEAD"), "utf8").trim();
      const refMatch = /^ref:\s+(.+)$/.exec(head);
      if (refMatch) {
        const refPath = path.resolve(".git", refMatch[1]!);
        if (fs.existsSync(refPath)) {
          return fs.readFileSync(refPath, "utf8").trim();
        }
      }
      // 可能是 detached HEAD（直接是 SHA）
      if (/^[0-9a-f]{40}$/.test(head)) return head;
    } catch {
      // ignore
    }
    return "unknown";
  }
}
