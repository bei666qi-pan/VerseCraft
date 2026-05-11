import { spawnSync } from "node:child_process";

// ── Abstract base ──────────────────────────────────────────────

export class AgentBackend {
  constructor(name) {
    if (new.target === AgentBackend) {
      throw new TypeError("AgentBackend is abstract");
    }
    this._name = name;
  }
  get name() {
    return this._name;
  }
  // eslint-disable-next-line no-unused-vars
  async run(_taskPrompt, _options = {}) {
    throw new Error(`AgentBackend "${this._name}" does not implement run()`);
  }
}

// ── Codex Backend (existing codex exec path) ──────────────────

export class CodexBackend extends AgentBackend {
  constructor(options = {}) {
    super("codex");
    this.commandOverride =
      options.commandOverride || process.env.AUTOOPS_CODEX_COMMAND;
  }

  async run(taskPrompt, options = {}) {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs || 45 * 60 * 1000;

    if (this.commandOverride) {
      const result = spawnSync(this.commandOverride, {
        shell: true,
        input: taskPrompt,
        encoding: "utf8",
        timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return {
        executed: result.status === 0,
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        command: "AUTOOPS_CODEX_COMMAND",
        durationMs: Date.now() - startedAt,
      };
    }

    const help = spawnSync("codex", ["exec", "--help"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (help.status !== 0) {
      return {
        executed: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        unavailable: true,
        reason: "codex CLI with non-interactive exec is not available",
        command: "codex exec",
        durationMs: 0,
      };
    }

    const result = spawnSync("codex", ["exec"], {
      input: taskPrompt,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      executed: result.status === 0,
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      command: "codex exec",
      durationMs: Date.now() - startedAt,
    };
  }
}

// ── Claude Backend (Claude Code CLI) ──────────────────────────

export class ClaudeBackend extends AgentBackend {
  // eslint-disable-next-line no-unused-vars
  constructor(options = {}) {
    super("claude");
  }

  async run(taskPrompt, options = {}) {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs || 45 * 60 * 1000;

    // Verify claude CLI is available
    const version = spawnSync("claude", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (version.status !== 0) {
      return {
        executed: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        unavailable: true,
        reason:
          "claude CLI not found; install from https://claude.ai/download",
        command: "claude --print",
        durationMs: 0,
      };
    }

    // Claude Code non-interactive mode: pipe prompt via stdin
    const result = spawnSync("claude", ["--print"], {
      input: taskPrompt,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      executed: result.status === 0,
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      command: "claude --print",
      durationMs: Date.now() - startedAt,
    };
  }
}

// ── DeepSeek Backend (API-based) ──────────────────────────────

export class DeepSeekBackend extends AgentBackend {
  constructor(options = {}) {
    super("deepseek");
    this.apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
    this.model = options.model || "deepseek-chat";
    this.baseUrl = options.baseUrl || "https://api.deepseek.com";
  }

  async run(taskPrompt, options = {}) {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs || 120000;

    if (!this.apiKey) {
      return {
        executed: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        unavailable: true,
        reason: "DEEPSEEK_API_KEY is not configured",
        command: "deepseek-api",
        durationMs: 0,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: [
                "你是一个 VerseCraft 项目的代码修复助手。",
                "分析事故信息并建议代码修改。",
                "用简洁的 Markdown 格式输出，包含文件路径和代码块。",
                "只做最小必要的修改，不引入无关变更。",
                "保留 /api/chat SSE 和 DM JSON 契约。",
                "不要提交运行时文件、密钥、.env 文件。",
              ].join("\n"),
            },
            { role: "user", content: taskPrompt },
          ],
          max_tokens: Number(options.maxTokens || 8192),
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          executed: false,
          exitCode: 1,
          stdout: "",
          stderr: "",
          reason: `DeepSeek API error ${response.status}: ${JSON.stringify(data)}`,
          command: `deepseek-api (${this.model})`,
          durationMs: Date.now() - startedAt,
        };
      }

      const content = data.choices?.[0]?.message?.content || "";
      return {
        executed: true,
        exitCode: 0,
        stdout: content,
        stderr: "",
        command: `deepseek-api (${this.model})`,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        executed: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        reason: `DeepSeek API call failed: ${error.message}`,
        command: "deepseek-api",
        durationMs: Date.now() - startedAt,
      };
    }
  }
}

// ── Factory ────────────────────────────────────────────────────

export function createAgentRunner(agentType = "claude", options = {}) {
  switch (agentType) {
    case "codex":
      return new CodexBackend(options);
    case "claude":
      return new ClaudeBackend(options);
    case "deepseek":
      return new DeepSeekBackend(options);
    default:
      throw new Error(
        `Unknown agent type "${agentType}". Supported: codex, claude, deepseek`
      );
  }
}
