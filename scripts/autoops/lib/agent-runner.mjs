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
   
  async run() {
    throw new Error(`AgentBackend "${this._name}" does not implement run()`);
  }
}

// ── DeepSeek diagnostic backend (API-based) ──────────────────

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
                "你是 VerseCraft 部署事故分类器，只提供诊断，不执行代码修改。",
                "严格按用户给定的分类标签和格式输出。",
                "不得声称已修改、提交、推送或部署任何内容。",
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

export function createAgentRunner(agentType = "deepseek", options = {}) {
  switch (agentType) {
    case "deepseek":
      return new DeepSeekBackend(options);
    default:
      throw new Error(
        `Unknown diagnostic backend "${agentType}". Supported: deepseek`
      );
  }
}
