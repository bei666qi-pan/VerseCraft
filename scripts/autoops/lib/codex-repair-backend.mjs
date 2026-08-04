/**
 * Codex Repair Backend — v2 (Campaign Mode)
 *
 * Upgraded for self-improving agent campaign:
 * - Thread-based repair (codex exec + codex exec resume <threadId>)
 * - JSONL output parsing
 * - Machine-readable result extraction
 * - Timeout support
 * - Dry-run validation
 * - No push/merge/deploy
 * - No danger-full-access
 * - No commit of runtime/logs/secrets/env
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Types ─────────────────────────────────────────────

/**
 * @typedef {Object} CodexRepairOptions
 * @property {string} taskPrompt - Task description for Codex
 * @property {string} [runId] - Campaign run identifier
 * @property {string} [threadId] - Resume existing thread (for retry)
 * @property {string} [taskFile] - Path to task file
 * @property {number} [timeoutMs] - Timeout (default: 45 min)
 * @property {string} [sandbox] - Sandbox mode (default: "workspace-write")
 * @property {string} [approvalPolicy] - Approval policy (default: "never")
 * @property {boolean} [jsonOutput] - Request JSONL output (default: true)
 * @property {boolean} [dryRun] - Dry-run only
 * @property {string} [workDir] - Working directory for repair
 * @property {Record<string,string>} [env] - Extra env vars
 */

/**
 * @typedef {Object} CodexRepairResult
 * @property {boolean} success
 * @property {number} exitCode
 * @property {string} stdout
 * @property {string} stderr
 * @property {string} command
 * @property {number} durationMs
 * @property {string} [threadId]
 * @property {string} [runId]
 * @property {boolean} timedOut
 * @property {boolean} unavailable
 * @property {string} [reason]
 * @property {Array<Object>} [events] - Parsed JSONL events
 * @property {string[]} [modifiedFiles] - Files modified by the repair
 * @property {string} [finalMessage] - Last assistant message
 */

const DEFAULT_OPTIONS = {
  timeoutMs: 45 * 60 * 1000,
  sandbox: "workspace-write",
  approvalPolicy: "never",
  jsonOutput: true,
  dryRun: false,
};

// ── Command construction ──────────────────────────────

/**
 * @param {CodexRepairOptions} options
 * @returns {[string, string[]]}
 */
export function buildCodexCommand(options) {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  const args = [];

  if (cfg.threadId) {
    // Resume existing thread
    args.push("exec", "resume", cfg.threadId);
  } else {
    args.push("exec");
  }

  if (cfg.sandbox && cfg.sandbox !== "use_default") {
    args.push("--sandbox", cfg.sandbox);
  }
  if (cfg.approvalPolicy) {
    args.push("--approval-policy", cfg.approvalPolicy);
  }
  if (cfg.jsonOutput && !cfg.threadId) {
    args.push("--output-format", "jsonl");
  }
  if (cfg.timeoutMs) {
    args.push("--timeout", String(Math.floor(cfg.timeoutMs / 1000)));
  }

  return ["codex", args];
}

/**
 * @param {CodexRepairOptions} options
 * @returns {string}
 */
export function formatCodexCommand(options) {
  const [cmd, args] = buildCodexCommand(options);
  return `${cmd} ${args.join(" ")}`;
}

// ── JSONL parsing ─────────────────────────────────────

/**
 * Parse JSONL output from codex exec.
 * @param {string} stdout
 * @returns {Array<Object>}
 */
export function parseJsonlOutput(stdout) {
  return stdout
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Extract modified files from JSONL events.
 * @param {Array<Object>} events
 * @returns {string[]}
 */
export function extractModifiedFiles(events) {
  const files = new Set();
  for (const event of events) {
    if (event.type === "file_write" || event.type === "file_edit") {
      if (event.path) files.add(event.path);
    }
    if (event.files) {
      for (const f of event.files) files.add(f);
    }
  }
  return [...files];
}

/**
 * Extract final assistant message.
 * @param {Array<Object>} events
 * @returns {string}
 */
export function extractFinalMessage(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "assistant" && event.message?.content) {
      return event.message.content;
    }
  }
  return "";
}

// ── Execution ─────────────────────────────────────────

/**
 * Execute a Codex repair task.
 * @param {CodexRepairOptions} options
 * @returns {Promise<CodexRepairResult>}
 */
export async function executeCodexRepair(options) {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  const startedAt = Date.now();
  const threadId = cfg.threadId || `vc-repair-${randomUUID().slice(0, 8)}`;

  if (cfg.dryRun) {
    return {
      success: true, exitCode: 0, stdout: "", stderr: "",
      command: formatCodexCommand(cfg), durationMs: 0,
      threadId, runId: cfg.runId, timedOut: false, unavailable: false,
      reason: "dry-run", events: [], modifiedFiles: [], finalMessage: "",
    };
  }

  let taskInput = cfg.taskPrompt || "";
  if (cfg.taskFile && existsSync(cfg.taskFile)) {
    taskInput = readFileSync(cfg.taskFile, "utf-8");
  }

  if (!taskInput && !cfg.threadId) {
    return {
      success: false, exitCode: -1, stdout: "", stderr: "",
      command: formatCodexCommand(cfg), durationMs: 0,
      threadId, runId: cfg.runId, timedOut: false, unavailable: false,
      reason: "No task prompt or task file.", events: [], modifiedFiles: [], finalMessage: "",
    };
  }

  // Check codex CLI
  const [cmd, args] = buildCodexCommand(cfg);
  try {
    const helpCheck = spawn(cmd, ["exec", "--help"], {
      stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
    });
    const helpResult = await new Promise((resolve) => {
      helpCheck.on("close", (code) => resolve(code));
      helpCheck.on("error", () => resolve(1));
    });
    if (helpResult !== 0) {
      return {
        success: false, exitCode: 1, stdout: "", stderr: "",
        command: `${cmd} exec`, durationMs: Date.now() - startedAt,
        threadId, runId: cfg.runId, timedOut: false, unavailable: true,
        reason: "codex CLI not available", events: [], modifiedFiles: [], finalMessage: "",
      };
    }
  } catch {
    return {
      success: false, exitCode: 1, stdout: "", stderr: "",
      command: `${cmd} exec`, durationMs: Date.now() - startedAt,
      threadId, runId: cfg.runId, timedOut: false, unavailable: true,
      reason: "codex CLI check failed", events: [], modifiedFiles: [], finalMessage: "",
    };
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: cfg.timeoutMs,
      cwd: cfg.workDir || process.cwd(),
      env: { ...process.env, ...(cfg.env || {}) },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, cfg.timeoutMs);

    if (taskInput) {
      proc.stdin.write(taskInput);
      proc.stdin.end();
    }

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("error", (err) => {
      clearTimeout(timeoutHandle);
      resolve({
        success: false, exitCode: -1, stdout, stderr,
        command: formatCodexCommand(cfg), durationMs: Date.now() - startedAt,
        threadId, runId: cfg.runId, timedOut: false, unavailable: false,
        reason: `Spawn error: ${err.message}`, events: [], modifiedFiles: [], finalMessage: "",
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutHandle);
      const events = parseJsonlOutput(stdout);
      const modifiedFiles = extractModifiedFiles(events);
      const finalMessage = extractFinalMessage(events);

      resolve({
        success: code === 0 && !timedOut,
        exitCode: code ?? -1, stdout, stderr,
        command: formatCodexCommand(cfg), durationMs: Date.now() - startedAt,
        threadId, runId: cfg.runId, timedOut, unavailable: false,
        reason: timedOut ? "Execution timed out." : undefined,
        events, modifiedFiles, finalMessage,
      });
    });
  });
}

// ── Result persistence ────────────────────────────────

/**
 * Save repair result to runtime directory.
 * @param {CodexRepairResult} result
 * @param {string} runId
 */
export function saveRepairResult(result, runId) {
  const dir = resolve(process.cwd(), `.runtime-data/self-improve/${runId}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `repair-${result.threadId}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2), "utf-8");
  return path;
}

// ── Self-test ─────────────────────────────────────────

export function selfTestCommandConstruction() {
  const testCases = [
    { options: {}, expectedFlags: ["--sandbox", "workspace-write"] },
    { options: { threadId: "th-123" }, expectedFlags: ["resume", "th-123"] },
    { options: { timeoutMs: 60000 }, expectedFlags: ["--timeout", "60"] },
    { options: { dryRun: true }, shouldNotExecute: true },
  ];

  const commands = [];
  let allPassed = true;

  for (const tc of testCases) {
    const cmd = formatCodexCommand(tc.options);
    commands.push(cmd);
    if (tc.shouldNotExecute) continue;
    for (const flag of tc.expectedFlags) {
      if (!cmd.includes(flag)) {
        console.error(`FAIL: Expected '${flag}' in: ${cmd}`);
        allPassed = false;
      }
    }
  }

  return { passed: allPassed, commands };
}

export function testJsonlParsing() {
  const sample = `{"type":"assistant","message":{"content":"Fixed the bug."}}
{"type":"file_write","path":"src/lib/fix.ts"}
not-json
{"type":"tool_result","output":"done"}`;

  const events = parseJsonlOutput(sample);
  const files = extractModifiedFiles(events);
  const msg = extractFinalMessage(events);

  const checks = [
    events.length === 3,
    files.length === 1,
    files[0] === "src/lib/fix.ts",
    msg === "Fixed the bug.",
  ];

  const allPassed = checks.every(Boolean);
  if (!allPassed) {
    console.error("JSONL parsing test FAILED:", { events, files, msg });
  }
  return allPassed;
}

// ── Main ──────────────────────────────────────────────

if (process.argv[1] && import.meta.url.endsWith(process.argv[1]?.replace(/^.*[\\/]/, "") || "")) {
  const cmdTest = selfTestCommandConstruction();
  const jsonlTest = testJsonlParsing();
  console.log("Command test:", cmdTest.passed ? "PASS" : "FAIL");
  console.log("JSONL test:", jsonlTest ? "PASS" : "FAIL");
  for (const cmd of cmdTest.commands) console.log(`  ${cmd}`);
  process.exit(cmdTest.passed && jsonlTest ? 0 : 1);
}
