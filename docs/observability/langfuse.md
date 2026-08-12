# Langfuse 运行验收

Langfuse 是观测与评测出口，不是在线回合的状态真相源，也不得阻塞首包或在失败时中断 `/api/chat`。

## 本地验收

本机存在 HTTP 代理时，必须显式绕过 localhost，否则健康检查可能得到代理返回的 502：

```bash
export NO_PROXY=localhost,127.0.0.1
export no_proxy=localhost,127.0.0.1
pnpm langfuse:preflight
pnpm test:langfuse:trace
```

`preflight` 只有在开关、密钥、URL、采样率、生产 hash salt 和健康端点均有效时才算 healthy。`test:langfuse:trace` 必须创建 trace/span/generation，显式 flush 并 shutdown；仅打印“attempted”不算验收通过。

RAGAS-compatible 分数可通过以下方式关联到已有 trace：

```bash
LANGFUSE_EVAL_TRACE_ID=<trace-id> pnpm eval:ragas -- --upload-langfuse
```

上传内容只允许脱敏 metadata、计数、延迟、布尔门禁与 score。禁止上传完整 prompt、玩家输入、narrative、cookie、token 或 secret。

## 故障语义

- `disabled`：功能明确关闭，不算错误，但不能作为“已接入”的证据。
- `misconfigured`：配置缺失或生产 salt 不安全，验收失败。
- `ready + endpoint healthy`：配置和服务健康；仍需 trace probe 证明出口真实写入。
- `export failed`：在线主链路继续，发布证据失败，并保留 request/trace ID。
