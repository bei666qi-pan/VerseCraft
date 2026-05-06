# k6 Load Testing

k6 用于 HTTP/SSE 应用层负载门禁：吞吐、错误率、完整响应耗时和队列稳定性。它不替代 `scripts/benchmark-chat-metrics.ts`，因为 TTFT、streaming chunk gap 和 final JSON 质量仍由共享 SSE probe 精细统计。

脚本：

- `perf/k6/health-load.js`
- `perf/k6/chat-mock-load.js`
- `perf/k6/chat-degraded-load.js`
- `perf/k6/queue-admission-load.js`

运行示例：

```bash
BASE_URL=http://127.0.0.1:666 pnpm perf:k6:health
AI_PROVIDER=mock BASE_URL=http://127.0.0.1:666 pnpm perf:k6:chat:mock
VC_FORCE_AI_KEYS_MISSING=1 BASE_URL=http://127.0.0.1:666 pnpm perf:k6:chat:degraded
k6 run perf/k6/queue-admission-load.js
```

默认 thresholds 会让 CI 失败：

- `http_req_failed: rate<0.01`
- `http_req_duration` 按场景设置 p95 上限
- `checks: rate>0.99`

真实 AI gateway 不应默认进入 k6；否则容易制造费用和限流噪声。真实 provider 的延迟和质量用 live benchmark/eval 低并发验证。
