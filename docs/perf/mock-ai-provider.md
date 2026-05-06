# Mock AI Provider

`AI_PROVIDER=mock` 启用确定性本地模型提供方，只用于测试、benchmark 和 eval。生产默认仍是 one-api / OpenAI-compatible gateway；不要在生产环境配置 mock。

入口在 `src/lib/ai/router/execute.ts`，不是 `/api/chat/route.ts` 旁路。它覆盖：

- `executePlayerChatStream`：返回 OpenAI-compatible streaming chunks。
- `executeChatCompletion`：覆盖 control preflight、options-only repair 等非流式 JSON 任务。

可用场景：

- `normal_stream`
- `missing_options`
- `malformed_json`
- `empty_stream`
- `disconnect_before_final`
- `slow_first_token`
- `long_chunk_gap`
- `options_only_valid`
- `options_only_invalid`

环境变量：

```bash
AI_PROVIDER=mock
VC_MOCK_AI_SCENARIO=normal_stream
VC_MOCK_FIRST_TOKEN_DELAY_MS=30
VC_MOCK_CHUNK_DELAY_MS=15
VC_MOCK_FINAL_DELAY_MS=20
VC_MOCK_AI_BYPASS_CHAT_QUEUE=1
```

`AI_PROVIDER=mock` 默认跳过主聊天队列，让生成链路的 mock gates 不把 queue admission 算进 TTFT；需要联测队列时设置 `VC_MOCK_AI_BYPASS_CHAT_QUEUE=0`，队列吞吐另由 `perf/k6/queue-admission-load.js` 覆盖。

mock eval/benchmark 可以在输入中使用 `[mock_scenario:missing_options]` 标记单个 case；该标记只由 mock provider 识别。

PR 必跑：

```bash
AI_PROVIDER=mock pnpm test:e2e:mock
AI_PROVIDER=mock pnpm benchmark:chat-metrics -- --mode mock --assert-budget --include-all --json-out .runtime-data/chat-benchmark-mock.json
AI_PROVIDER=mock pnpm eval:chat-quality -- --mode mock --assert --json-out .runtime-data/eval-chat-quality-mock.json
```

回滚方式：移除 `AI_PROVIDER=mock` 即回到真实 provider / degraded 行为。mock 不读取真实玩家输入、不产生真实 AI 费用、不需要 gateway key。
